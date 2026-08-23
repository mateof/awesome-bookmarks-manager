import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { users } from "../db/schema.js";
import { getEnv } from "../env.js";

/**
 * Deciding who administers the instance before anybody can claim it.
 *
 * The rule this replaces — first account to register becomes admin — is a
 * land-grab. Between `docker compose up` and getting round to registering,
 * whoever reaches `/signup` first owns the instance: an admin can read the
 * settings, provision and delete accounts, and set storage quotas. The window
 * is however long it takes to configure DNS, or go for coffee, and an empty
 * instance accepts signups even with registration disabled, because otherwise
 * there would be no way to bootstrap.
 *
 * `ADMIN_EMAILS` closes it by naming the administrators up front. The part that
 * matters, and that a half-implementation gets wrong: when it is set, the
 * first-user rule is **off entirely**. Keeping both means an attacker who
 * registers first is still admin, and the variable has bought nothing except
 * the belief that it did.
 *
 * `ADMIN_PASSWORD` closes what is left. With the email alone, nobody else can
 * become admin, but nothing stops somebody registering *as* that email before
 * its owner does, and an email address is usually guessable. Creating the
 * account at boot means there is nothing to claim.
 */

/** Designated administrators, lowercased. Empty when the variable is unset. */
export function designatedAdmins(): string[] {
  return (getEnv().ADMIN_EMAILS ?? "")
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter((e: string) => e.length > 0);
}

export function isDesignatedAdmin(email: string): boolean {
  const list = designatedAdmins();
  return list.length > 0 && list.includes(email.trim().toLowerCase());
}

/**
 * The role a newly registered account gets.
 *
 * Reads as one rule with two modes rather than two rules that can both fire,
 * which is the shape that keeps the land-grab closed.
 */
export function roleForNewAccount(
  email: string,
  totalUsers: number,
): "user" | "admin" {
  if (designatedAdmins().length > 0) {
    return isDesignatedAdmin(email) ? "admin" : "user";
  }
  return totalUsers === 0 ? "admin" : "user";
}

/**
 * Promote accounts named by `ADMIN_EMAILS` that already exist.
 *
 * Covers the instance that has been running for a year and is only now setting
 * the variable, and re-applies on every boot so the file stays the source of
 * truth for who *is* an admin.
 *
 * It never demotes, deliberately. A typo in a compose file should not be able
 * to lock the real administrator out of their own instance, and removing an
 * admin is a decision to take on the admin screen where it can be seen.
 */
export function applyDesignatedAdmins(): number {
  const wanted = designatedAdmins();
  if (wanted.length === 0) return 0;
  const db = getDb();
  let promoted = 0;
  for (const email of wanted) {
    const row = db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(sql`lower(email) = lower(${email})`)
      .get();
    if (!row || row.role === "admin") continue;
    db.update(users).set({ role: "admin" }).where(eq(users.id, row.id)).run();
    promoted++;
  }
  return promoted;
}

/** A nickname the account can actually be created with, derived from the email. */
export function nicknameFor(email: string): string {
  const base = (email.split("@")[0] ?? "admin")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 24);
  const seed = base.length >= 3 ? base : "admin";
  const db = getDb();
  for (let n = 0; n < 100; n++) {
    const candidate = n === 0 ? seed : `${seed}${n}`;
    const taken = db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(nickname) = lower(${candidate})`)
      .get();
    if (!taken) return candidate;
  }
  // A hundred collisions on one seed is not a real situation, but returning
  // something that fails uniqueness later would be worse than a long name.
  return `${seed}${Date.now()}`;
}
