import { createHash } from "node:crypto";
import {
  type AutofillRuntime,
  type AutofillVariable,
  AutofillVariableSchema,
  type AutofillVariableInfo,
  type Automation,
  type AutomationInput,
  AutomationInputSchema,
  type AutomationSummary,
  automationMatchesUrl,
  automationScope,
  automationVariableKeys,
} from "@awesome-bookmarks/shared";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { openField, sealField } from "../auth/encryption.js";
import type { AuthedContext } from "../auth/session.js";
import { getBookmark, listBookmarks } from "../bookmarks/service.js";
import { getDb } from "../db/client.js";
import { autofillProfiles, bookmarkAutomations } from "../db/schema.js";
import { BadRequest, Conflict, NotFound } from "../util/errors.js";

const PROFILE_AAD = "autofill.profile";
const automationAad = (bookmarkId: string) => `bookmark.automation:${bookmarkId}`;

const StoredProfileSchema = z.object({
  variables: z.array(AutofillVariableSchema).default([]),
});

const StoredAutomationSchema = z.object({
  input: AutomationInputSchema,
  approved: z.string().nullable().default(null),
});
type StoredAutomation = z.infer<typeof StoredAutomationSchema>;

export function listVariables(ctx: AuthedContext): AutofillVariable[] {
  const row = getDb()
    .select()
    .from(autofillProfiles)
    .where(eq(autofillProfiles.userId, ctx.userId))
    .get();
  if (!row) return [];
  const raw = openField(ctx.dek, ctx.userId, PROFILE_AAD, Buffer.from(row.dataCt));
  return StoredProfileSchema.parse(JSON.parse(raw)).variables;
}

export function listVariableInfo(ctx: AuthedContext): AutofillVariableInfo[] {
  return listVariables(ctx).map(({ value, ...rest }) => ({
    ...rest,
    hasValue: value !== "",
  }));
}

export function saveVariables(
  ctx: AuthedContext,
  variables: AutofillVariable[],
): AutofillVariable[] {
  const dataCt = sealField(
    ctx.dek,
    ctx.userId,
    PROFILE_AAD,
    JSON.stringify({ variables }),
  );
  const updatedAt = new Date().toISOString();
  getDb()
    .insert(autofillProfiles)
    .values({ userId: ctx.userId, dataCt, updatedAt })
    .onConflictDoUpdate({
      target: autofillProfiles.userId,
      set: { dataCt, updatedAt },
    })
    .run();
  return listVariables(ctx);
}

function fingerprint(input: AutomationInput, url: string): string {
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

function readStored(
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

function writeStored(ctx: AuthedContext, bookmarkId: string, stored: StoredAutomation) {
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

function present(
  bookmarkId: string,
  url: string,
  stored: StoredAutomation,
  updatedAt: string,
  knownKeys: Set<string>,
): Automation {
  const current = fingerprint(stored.input, url);
  return {
    bookmarkId,
    ...stored.input,
    status: stored.approved === current ? "approved" : "pending",
    fingerprint: current,
    unknownVariables: automationVariableKeys(stored.input).filter(
      (k) => !knownKeys.has(k),
    ),
    updatedAt,
  };
}

function knownKeys(ctx: AuthedContext): Set<string> {
  return new Set(listVariables(ctx).map((v) => v.key));
}

function automatableUrl(ctx: AuthedContext, bookmarkId: string): string {
  const { url } = getBookmark(ctx, bookmarkId);
  if (!automationScope(url)) {
    throw BadRequest("Only http and https bookmarks can carry an automation");
  }
  return url;
}

export function getAutomation(
  ctx: AuthedContext,
  bookmarkId: string,
): Automation | null {
  const { url } = getBookmark(ctx, bookmarkId);
  const found = readStored(ctx, bookmarkId);
  if (!found) return null;
  return present(bookmarkId, url, found.stored, found.updatedAt, knownKeys(ctx));
}

export function setAutomation(
  ctx: AuthedContext,
  bookmarkId: string,
  input: AutomationInput,
  opts: { approve: boolean },
): Automation {
  const url = automatableUrl(ctx, bookmarkId);
  const previous = readStored(ctx, bookmarkId)?.stored.approved ?? null;
  const next = fingerprint(input, url);
  writeStored(ctx, bookmarkId, {
    input,
    approved: opts.approve ? next : previous,
  });
  return getAutomation(ctx, bookmarkId)!;
}

export function approveAutomation(
  ctx: AuthedContext,
  bookmarkId: string,
  expected: string,
): Automation {
  const url = automatableUrl(ctx, bookmarkId);
  const found = readStored(ctx, bookmarkId);
  if (!found) throw NotFound("Automation not found");
  if (fingerprint(found.stored.input, url) !== expected) {
    throw Conflict("The automation changed since it was shown; review it again");
  }
  writeStored(ctx, bookmarkId, { ...found.stored, approved: expected });
  return getAutomation(ctx, bookmarkId)!;
}

export function deleteAutomation(ctx: AuthedContext, bookmarkId: string) {
  getBookmark(ctx, bookmarkId);
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

function allAutomations(ctx: AuthedContext): Array<{ automation: Automation; url: string }> {
  const rows = getDb()
    .select({ bookmarkId: bookmarkAutomations.bookmarkId })
    .from(bookmarkAutomations)
    .where(eq(bookmarkAutomations.userId, ctx.userId))
    .all();
  if (rows.length === 0) return [];
  const urls = new Map(listBookmarks(ctx, {}).map((b) => [b.id, b.url]));
  const keys = knownKeys(ctx);
  const out: Array<{ automation: Automation; url: string }> = [];
  for (const { bookmarkId } of rows) {
    const url = urls.get(bookmarkId);
    if (url === undefined) continue;
    try {
      const found = readStored(ctx, bookmarkId);
      if (found) {
        out.push({
          automation: present(bookmarkId, url, found.stored, found.updatedAt, keys),
          url,
        });
      }
    } catch (err) {
      console.warn(
        `[autofill] skip automation ${bookmarkId}: decode failed`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return out;
}

export function listAutomationSummaries(ctx: AuthedContext): AutomationSummary[] {
  return allAutomations(ctx).map(({ automation: a, url }) => ({
    bookmarkId: a.bookmarkId,
    url,
    enabled: a.enabled,
    trigger: a.trigger,
    status: a.status,
    hasScript: a.script.trim() !== "",
  }));
}

export function autofillRuntime(ctx: AuthedContext): AutofillRuntime {
  const automations = allAutomations(ctx)
    .filter(({ automation: a, url }) =>
      a.enabled && a.status === "approved" && automationScope(url) !== null,
    )
    .map(({ automation: a, url }) => ({
      bookmarkId: a.bookmarkId,
      url,
      trigger: a.trigger,
      timeoutMs: a.timeoutMs,
      steps: a.steps,
      script: a.script,
    }));
  const variables = Object.fromEntries(
    listVariables(ctx).map((v) => [v.key, v.value]),
  );
  return { variables, automations };
}

export function findBookmarkIdsForUrl(
  ctx: AuthedContext,
  pageUrl: string,
): Array<{ id: string; title: string; url: string }> {
  return listBookmarks(ctx, {})
    .filter((b) => automationScope(b.url) && automationMatchesUrl(b.url, pageUrl))
    .sort((a, b) => b.url.length - a.url.length)
    .map((b) => ({ id: b.id, title: b.title, url: b.url }));
}
