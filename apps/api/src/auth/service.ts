import {
  deriveKEK,
  generateDEK,
  generateSalt,
  hashPassword,
  unwrapKey,
  verifyPassword,
  wrapKey,
} from "@awesome-bookmarks/crypto";
import { eq, or, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/client.js";
import { users } from "../db/schema.js";
import { BadRequest, Conflict, NotFound, Unauthorized } from "../util/errors.js";
import { masterUnwrap, masterWrap } from "./encryption.js";
import { keyCache } from "./key-cache.js";

export async function signup(
  email: string,
  password: string,
  nickname: string,
) {
  const db = getDb();
  const emailDup = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .all();
  if (emailDup.length > 0) throw Conflict("Email ya registrado");

  const nickDup = db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(nickname) = lower(${nickname})`)
    .all();
  if (nickDup.length > 0) throw Conflict("Nickname ya en uso");

  // First user becomes admin so the instance has someone who can manage users.
  const totalUsers = db.select({ id: users.id }).from(users).all().length;
  const role = totalUsers === 0 ? "admin" : "user";

  const id = uuidv4();
  const passwordHash = await hashPassword(password);
  const kdfSalt = generateSalt(32);
  const kek = await deriveKEK(password, kdfSalt);
  const dek = generateDEK();
  const wrappedDek = wrapKey(kek, dek, `kek|${id}`);
  const sealed = masterWrap(id, wrappedDek);

  db.insert(users)
    .values({
      id,
      email,
      nickname,
      passwordHash,
      kdfSalt,
      masterWrap: sealed,
      role,
    })
    .run();

  keyCache.put(id, dek);
  return { id, email, nickname, role };
}

/**
 * Login with either an email or a nickname. Lookup is case-insensitive on
 * both fields so the user doesn't have to remember casing.
 */
export async function login(identifier: string, password: string) {
  const db = getDb();
  const lookup = identifier.trim();
  const row = db
    .select()
    .from(users)
    .where(
      or(
        sql`lower(email) = lower(${lookup})`,
        sql`lower(nickname) = lower(${lookup})`,
      ),
    )
    .get();
  if (!row) throw Unauthorized("Credenciales inválidas");
  const ok = await verifyPassword(row.passwordHash, password);
  if (!ok) throw Unauthorized("Credenciales inválidas");

  const wrappedDek = masterUnwrap(row.id, Buffer.from(row.masterWrap));
  const kek = await deriveKEK(password, Buffer.from(row.kdfSalt));
  const dek = unwrapKey(kek, wrappedDek, `kek|${row.id}`);
  keyCache.put(row.id, dek);
  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    role: row.role,
  };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const db = getDb();
  const row = db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) throw NotFound("User not found");
  const ok = await verifyPassword(row.passwordHash, currentPassword);
  if (!ok) throw Unauthorized("Invalid current password");
  if (currentPassword === newPassword) {
    throw BadRequest("New password must differ from current");
  }

  const wrappedDek = masterUnwrap(row.id, Buffer.from(row.masterWrap));
  const oldKek = await deriveKEK(currentPassword, Buffer.from(row.kdfSalt));
  const dek = unwrapKey(oldKek, wrappedDek, `kek|${row.id}`);

  const newSalt = generateSalt(32);
  const newKek = await deriveKEK(newPassword, newSalt);
  const newWrappedDek = wrapKey(newKek, dek, `kek|${row.id}`);
  const newSealed = masterWrap(row.id, newWrappedDek);
  const newHash = await hashPassword(newPassword);

  db.update(users)
    .set({
      passwordHash: newHash,
      kdfSalt: newSalt,
      masterWrap: newSealed,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId))
    .run();

  keyCache.put(row.id, dek);
}

export function setAutoSnapshots(userId: string, value: boolean) {
  const db = getDb();
  const me = db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
  if (!me) throw NotFound("User not found");
  db.update(users)
    .set({ autoSnapshots: value, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId))
    .run();
  return { autoSnapshots: value };
}

export function getAutoSnapshots(userId: string): boolean {
  const row = getDb()
    .select({ autoSnapshots: users.autoSnapshots })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.autoSnapshots ?? true;
}

export function setNickname(userId: string, nickname: string) {
  const db = getDb();
  const me = db.select().from(users).where(eq(users.id, userId)).get();
  if (!me) throw NotFound("User not found");
  if (me.nickname && me.nickname.toLowerCase() === nickname.toLowerCase()) {
    return { nickname: me.nickname };
  }
  const dup = db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(nickname) = lower(${nickname}) AND id != ${userId}`)
    .all();
  if (dup.length > 0) throw Conflict("Nickname ya en uso");
  db.update(users)
    .set({ nickname, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId))
    .run();
  return { nickname };
}

export function getMe(userId: string) {
  const db = getDb();
  const row = db
    .select({
      id: users.id,
      email: users.email,
      nickname: users.nickname,
      role: users.role,
      autoSnapshots: users.autoSnapshots,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!row) throw NotFound("User not found");
  return row;
}
