import {
  deriveKEK,
  generateDEK,
  generateSalt,
  hashPassword,
  unwrapKey,
  verifyPassword,
  wrapKey,
} from "@awesome-bookmarks/crypto";
import { randomBytes } from "node:crypto";
import { eq, or, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { ensureUserKeys } from "./userKeys.js";
import { getDb } from "../db/client.js";
import { users } from "../db/schema.js";
import {
  getRequire2fa,
  getSkip2faOnTrusted,
  isRegistrationOpen,
} from "../settings/service.js";
import {
  BadRequest,
  Conflict,
  Forbidden,
  KeyUnavailable,
  NotFound,
  Unauthorized,
} from "../util/errors.js";
import { masterUnwrap, masterWrap, openField } from "./encryption.js";
import { keyCache } from "./key-cache.js";
import {
  designatedAdmins,
  nicknameFor,
  roleForNewAccount,
} from "./adminBootstrap.js";
import { getEnv } from "../env.js";
import { verifyTotp } from "./totp.js";

/**
 * Core account creation shared by public signup and admin-provisioned users.
 * Generates a fresh DEK for the new user, wraps it with a KEK derived from
 * their password, and seals that with the master key. Does NOT log the user
 * in (no session, no key cache) unless the caller does so.
 */
async function createUserAccount(input: {
  email: string;
  nickname: string;
  password: string;
  role: "user" | "admin";
  mustChangePassword: boolean;
}): Promise<{ id: string; dek: Buffer }> {
  const db = getDb();
  const emailDup = db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(email) = lower(${input.email})`)
    .all();
  if (emailDup.length > 0) throw Conflict("Email ya registrado");

  const nickDup = db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(nickname) = lower(${input.nickname})`)
    .all();
  if (nickDup.length > 0) throw Conflict("Nickname ya en uso");

  const id = uuidv4();
  const passwordHash = await hashPassword(input.password);
  const kdfSalt = generateSalt(32);
  const kek = await deriveKEK(input.password, kdfSalt);
  const dek = generateDEK();
  const wrappedDek = wrapKey(kek, dek, `kek|${id}`);
  const sealed = masterWrap(id, wrappedDek);

  db.insert(users)
    .values({
      id,
      email: input.email,
      nickname: input.nickname,
      passwordHash,
      kdfSalt,
      masterWrap: sealed,
      role: input.role,
      mustChangePassword: input.mustChangePassword,
    })
    .run();

  return { id, dek };
}


/**
 * Create the administrator named by `ADMIN_EMAILS` if it does not exist yet,
 * using `ADMIN_PASSWORD` as a one-time password.
 *
 * Runs on every boot and does nothing once the account is there, so leaving the
 * variables in place is harmless — and removing `ADMIN_PASSWORD` after the
 * first sign-in is the tidier thing to do anyway.
 *
 * Only when exactly one email is designated: handing the same bootstrap
 * password to several accounts would be a worse idea than the one it replaces.
 * The rest are promoted when they register.
 */
export async function bootstrapAdminAccount(): Promise<string | null> {
  const wanted = designatedAdmins();
  const password = getEnv().ADMIN_PASSWORD;
  if (wanted.length !== 1 || !password) return null;
  const email = wanted[0]!;

  const existing = getDb()
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(email) = lower(${email})`)
    .get();
  if (existing) return null;

  await createUserAccount({
    email,
    nickname: nicknameFor(email),
    password,
    role: "admin",
    // The point of the flag: this password stops being usable the moment it is
    // used once, which is what makes a secret in a compose file tolerable.
    mustChangePassword: true,
  });
  return email;
}

export async function signup(
  email: string,
  password: string,
  nickname: string,
) {
  const db = getDb();
  // First user is always allowed (bootstrap); afterwards honour the toggle.
  if (!isRegistrationOpen()) {
    throw Forbidden("El registro de nuevos usuarios está desactivado");
  }

  // Either `ADMIN_EMAILS` decides, or the first account does — never both. See
  // `adminBootstrap.ts` for why keeping both would leave the race open.
  const totalUsers = db.select({ id: users.id }).from(users).all().length;
  const role = roleForNewAccount(email, totalUsers);

  const { id, dek } = await createUserAccount({
    email,
    nickname,
    password,
    role,
    mustChangePassword: false,
  });

  keyCache.put(id, dek);
  // Generated now rather than on first use, so a brand new account can be
  // invited into a group before it has ever made another request.
  ensureUserKeys(id, dek);
  return { id, email, nickname, role };
}

/**
 * Admin-provisioned account. Generates a one-time password (unless the admin
 * supplied one), flags the account as must-change, and returns the password
 * so the admin can hand it to the user.
 */
export async function adminCreateUser(input: {
  email: string;
  nickname: string;
  password?: string;
}): Promise<{
  id: string;
  email: string;
  nickname: string;
  role: "user";
  oneTimePassword: string;
}> {
  const oneTimePassword =
    input.password && input.password.length >= 10
      ? input.password
      : randomBytes(12).toString("base64url");

  const { id } = await createUserAccount({
    email: input.email,
    nickname: input.nickname,
    password: oneTimePassword,
    role: "user",
    mustChangePassword: true,
  });

  return {
    id,
    email: input.email,
    nickname: input.nickname,
    role: "user",
    oneTimePassword,
  };
}

/**
 * First-login password set. The user just authenticated with the one-time
 * password, so the DEK is warm in the cache — re-wrap it under the new
 * password and clear the must-change flag. No need to re-enter the OTP.
 */
export async function setFirstPassword(userId: string, newPassword: string) {
  const db = getDb();
  const row = db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) throw NotFound("User not found");

  const dek = keyCache.get(userId);
  if (!dek) throw KeyUnavailable();

  const newSalt = generateSalt(32);
  const newKek = await deriveKEK(newPassword, newSalt);
  const newWrappedDek = wrapKey(newKek, dek, `kek|${userId}`);
  const newSealed = masterWrap(userId, newWrappedDek);
  const newHash = await hashPassword(newPassword);

  db.update(users)
    .set({
      passwordHash: newHash,
      kdfSalt: newSalt,
      masterWrap: newSealed,
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId))
    .run();

  keyCache.put(userId, dek);
}

export type LoginResult =
  | { ok: true; user: { id: string; email: string; nickname: string | null; role: string } }
  | { ok: false; twoFactorRequired: true };

/**
 * Login with either an email or a nickname. Lookup is case-insensitive on
 * both fields so the user doesn't have to remember casing.
 *
 * When the account has TOTP 2FA enabled we only finish the login (cache the
 * DEK) once a valid code is supplied. `trusted` (a request from an admin-
 * configured trusted network) can waive the second factor: for everyone when
 * skip-on-trusted is on, and always for admins so they can never be locked out
 * of their own LAN if they lose the authenticator.
 */
export async function login(
  identifier: string,
  password: string,
  opts: { totp?: string; trusted?: boolean } = {},
): Promise<LoginResult> {
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

  const skip2fa =
    (opts.trusted ?? false) &&
    (getSkip2faOnTrusted() || row.role === "admin");
  if (row.twoFactorEnabled && row.twoFactorSecretCt && !skip2fa) {
    if (!opts.totp) return { ok: false, twoFactorRequired: true };
    const secret = openField(
      dek,
      row.id,
      "twofa.secret",
      Buffer.from(row.twoFactorSecretCt),
    );
    if (!verifyTotp(secret, opts.totp)) {
      throw Unauthorized("Código 2FA inválido");
    }
  }

  keyCache.put(row.id, dek);
  return {
    ok: true,
    user: {
      id: row.id,
      email: row.email,
      nickname: row.nickname,
      role: row.role,
    },
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
      mustChangePassword: false,
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

export function setAutoAcceptInvitations(userId: string, value: boolean) {
  getDb()
    .update(users)
    .set({ autoAcceptInvitations: value, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId))
    .run();
  return { autoAcceptInvitations: value };
}

export function getAutoAcceptInvitations(userId: string): boolean {
  const row = getDb()
    .select({ v: users.autoAcceptInvitations })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.v ?? false;
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
      autoAcceptInvitations: users.autoAcceptInvitations,
      mustChangePassword: users.mustChangePassword,
      twoFactorEnabled: users.twoFactorEnabled,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!row) throw NotFound("User not found");
  // `mustSetup2fa` drives the forced-enrollment gate in the SPA when an admin
  // has made 2FA mandatory and this account hasn't set it up yet.
  return { ...row, mustSetup2fa: getRequire2fa() && !row.twoFactorEnabled };
}
