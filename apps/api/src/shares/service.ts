import {
  aeadDecrypt,
  deriveShareKey,
  generateShareToken,
  hashPassword,
  verifyPassword,
} from "@awesome-bookmarks/crypto";
import type { Share } from "@awesome-bookmarks/shared";
import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { AuthedContext } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { shareLinks } from "../db/schema.js";
import { getEnv } from "../env.js";
import { enqueue } from "../jobs/queue.js";
import { Forbidden, NotFound, Unauthorized } from "../util/errors.js";

export async function createShare(
  ctx: AuthedContext,
  input: {
    targetType: "folder" | "bookmark";
    targetId: string;
    expiresAt?: string | null;
    password?: string | null;
  },
): Promise<Share> {
  const id = uuidv4();
  const token = generateShareToken();
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  getDb()
    .insert(shareLinks)
    .values({
      id,
      userId: ctx.userId,
      targetType: input.targetType,
      targetId: input.targetId,
      token,
      payloadStatus: "pending",
      expiresAt: input.expiresAt ?? null,
      passwordHash,
    })
    .run();

  enqueue({
    userId: ctx.userId,
    type: "share_seal",
    payload: { shareId: id },
  });

  return shareView(id, token, input.targetType, input.targetId, input.expiresAt ?? null, passwordHash);
}

export function listShares(ctx: AuthedContext): Share[] {
  return getDb()
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.userId, ctx.userId))
    .all()
    .map((r) =>
      shareView(
        r.id,
        r.token,
        r.targetType as "folder" | "bookmark",
        r.targetId,
        r.expiresAt,
        r.passwordHash,
        r.createdAt,
      ),
    );
}

export function deleteShare(ctx: AuthedContext, id: string) {
  const row = getDb()
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.id, id), eq(shareLinks.userId, ctx.userId)))
    .get();
  if (!row) throw NotFound("Share not found");
  getDb().delete(shareLinks).where(eq(shareLinks.id, id)).run();
}

export interface PublicShareResolution {
  needsPassword: boolean;
  payload?: unknown;
}

export async function resolvePublicShare(
  token: string,
  password: string | undefined,
): Promise<PublicShareResolution> {
  const row = getDb()
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .get();
  if (!row) throw NotFound("Share not found");
  if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
    throw NotFound("Share expired");
  }
  if (row.passwordHash) {
    if (!password) return { needsPassword: true };
    const ok = await verifyPassword(row.passwordHash, password);
    if (!ok) throw Unauthorized("Invalid password");
  }
  if (row.payloadStatus !== "ready" || !row.payloadCt) {
    throw Forbidden("Share is still being prepared");
  }
  const key = deriveShareKey(row.token);
  const json = aeadDecrypt(key, Buffer.from(row.payloadCt)).toString("utf8");
  return { needsPassword: false, payload: JSON.parse(json) };
}

function shareView(
  id: string,
  token: string,
  targetType: "folder" | "bookmark",
  targetId: string,
  expiresAt: string | null,
  passwordHash: string | null,
  createdAt = new Date().toISOString(),
): Share {
  return {
    id,
    token,
    targetType,
    targetId,
    url: `${getEnv().PUBLIC_BASE_URL}/share/${token}`,
    expiresAt,
    hasPassword: !!passwordHash,
    createdAt,
  };
}
