import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/client.js";
import { extensionTokens } from "../db/schema.js";

export function createToken(userId: string, label: string) {
  const id = uuidv4();
  const raw = randomBytes(32).toString("base64url");
  const hash = sha256(raw);
  getDb()
    .insert(extensionTokens)
    .values({ id, userId, label, tokenHash: hash })
    .run();
  // Token format: <id>.<raw> so we can do a fast lookup by id (avoid scanning).
  return `${id}.${raw}`;
}

export function verifyToken(token: string): string | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const raw = token.slice(dot + 1);
  const row = getDb()
    .select()
    .from(extensionTokens)
    .where(eq(extensionTokens.id, id))
    .get();
  if (!row) return null;
  const candidate = sha256(raw);
  if (
    candidate.length !== row.tokenHash.length ||
    !timingSafeEqual(Buffer.from(candidate), Buffer.from(row.tokenHash))
  ) {
    return null;
  }
  getDb()
    .update(extensionTokens)
    .set({ lastUsedAt: sql`current_timestamp` })
    .where(eq(extensionTokens.id, id))
    .run();
  return row.userId;
}

export function listTokens(userId: string) {
  return getDb()
    .select({
      id: extensionTokens.id,
      label: extensionTokens.label,
      lastUsedAt: extensionTokens.lastUsedAt,
      createdAt: extensionTokens.createdAt,
    })
    .from(extensionTokens)
    .where(eq(extensionTokens.userId, userId))
    .all();
}

export function revokeToken(userId: string, id: string) {
  getDb()
    .delete(extensionTokens)
    .where(eq(extensionTokens.id, id))
    .run();
  return userId;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
