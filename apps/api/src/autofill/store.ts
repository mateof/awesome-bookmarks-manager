import { createHash } from "node:crypto";
import {
  type AutomationInput,
  AutomationContentSchema,
  AutomationInputSchema,
  automationScope,
} from "@awesome-bookmarks/shared";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { openField, sealField } from "../auth/encryption.js";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { bookmarkAutomations } from "../db/schema.js";

const automationAad = (bookmarkId: string) => `bookmark.automation:${bookmarkId}`;

export const StoredAutomationSchema = z.object({
  input: AutomationInputSchema,
  approved: z.string().nullable().default(null),
  approvedInput: AutomationContentSchema.nullable().default(null),
});
export type StoredAutomation = z.infer<typeof StoredAutomationSchema>;

export function fingerprint(input: AutomationInput, url: string): string {
  const scope = automationScope(url);
  return createHash("sha256")
    .update(
      JSON.stringify([
        scope?.origin ?? null,
        input.enabled,
        input.trigger,
        input.timeoutMs,
        input.steps,
        input.script,
      ]),
    )
    .digest("hex");
}

export function readStored(
  ctx: AuthedContext,
  bookmarkId: string,
): { stored: StoredAutomation; updatedAt: string } | null {
  const row = getDb()
    .select()
    .from(bookmarkAutomations)
    .where(
      and(
        eq(bookmarkAutomations.bookmarkId, bookmarkId),
        eq(bookmarkAutomations.userId, ctx.userId),
      ),
    )
    .get();
  if (!row) return null;
  const raw = openField(
    ctx.dek,
    ctx.userId,
    automationAad(bookmarkId),
    Buffer.from(row.dataCt),
  );
  return {
    stored: StoredAutomationSchema.parse(JSON.parse(raw)),
    updatedAt: row.updatedAt,
  };
}

export function writeStored(
  ctx: AuthedContext,
  bookmarkId: string,
  stored: StoredAutomation,
) {
  const dataCt = sealField(
    ctx.dek,
    ctx.userId,
    automationAad(bookmarkId),
    JSON.stringify(stored),
  );
  const updatedAt = new Date().toISOString();
  getDb()
    .insert(bookmarkAutomations)
    .values({ bookmarkId, userId: ctx.userId, dataCt, updatedAt })
    .onConflictDoUpdate({
      target: [bookmarkAutomations.bookmarkId, bookmarkAutomations.userId],
      set: { dataCt, updatedAt },
    })
    .run();
}

export function deleteStored(ctx: AuthedContext, bookmarkId: string) {
  getDb()
    .delete(bookmarkAutomations)
    .where(
      and(
        eq(bookmarkAutomations.bookmarkId, bookmarkId),
        eq(bookmarkAutomations.userId, ctx.userId),
      ),
    )
    .run();
}

export function storedInput(ctx: AuthedContext, bookmarkId: string): AutomationInput | null {
  try {
    return readStored(ctx, bookmarkId)?.stored.input ?? null;
  } catch {
    return null;
  }
}
