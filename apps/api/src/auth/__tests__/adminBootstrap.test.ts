import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who administers the instance.
 *
 * "First account to register becomes admin" is a land-grab: between starting
 * the container and getting round to registering, whoever reaches `/signup`
 * first owns the instance. `ADMIN_EMAILS` names the administrators up front.
 *
 * The test that matters most is the second one. Naming an admin while *also*
 * keeping the first-user rule would let an attacker who registers first be
 * admin anyway, and the variable would have bought nothing but confidence.
 */

let dir: string;

async function boot(
  dataDir: string,
  extra: Record<string, string | undefined> = {},
) {
  process.env.DATA_DIR = dataDir;
  process.env.MASTER_KEY = Buffer.alloc(32, 31).toString("base64");
  process.env.SESSION_SECRET = Buffer.alloc(48, 32).toString("base64");
  delete process.env.ADMIN_EMAILS;
  delete process.env.ADMIN_PASSWORD;
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
  const { ensureSchema } = await import("../../db/bootstrap.js");
  ensureSchema();
  return {
    db: await import("../../db/client.js"),
    auth: await import("../service.js"),
    bootstrap: await import("../adminBootstrap.js"),
  };
}

function roleOf(
  m: { db: { getSqlite: () => import("better-sqlite3").Database } },
  email: string,
): string | undefined {
  return (
    m.db
      .getSqlite()
      .prepare(`SELECT role FROM users WHERE lower(email) = lower(?)`)
      .get(email) as { role: string } | undefined
  )?.role;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ab-admin-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.ADMIN_EMAILS;
  delete process.env.ADMIN_PASSWORD;
});

describe("designating the administrator", () => {
  it("keeps first-user-is-admin when nothing is configured", async () => {
    const m = await boot(dir);
    await m.auth.signup("first@example.com", "FirstUserPass28xx", "first");
    await m.auth.signup("second@example.com", "SecondUserPas28xx", "second");
    expect(roleOf(m, "first@example.com")).toBe("admin");
    expect(roleOf(m, "second@example.com")).toBe("user");
  });

  it("switches off first-user-is-admin once an email is named", async () => {
    const m = await boot(dir, { ADMIN_EMAILS: "boss@example.com" });
    // The land-grab: somebody else gets there first. Under the old rule they
    // would now own the instance.
    await m.auth.signup("quick@example.com", "QuickClaimer28xx", "quick");
    expect(roleOf(m, "quick@example.com")).toBe("user");

    await m.auth.signup("boss@example.com", "TheRealBoss28xxx", "boss");
    expect(roleOf(m, "boss@example.com")).toBe("admin");
  });

  it("matches the email whatever case it is written in", async () => {
    const m = await boot(dir, { ADMIN_EMAILS: " Boss@Example.com " });
    await m.auth.signup("boss@example.com", "CaseInsensitive28", "boss");
    expect(roleOf(m, "boss@example.com")).toBe("admin");
  });

  it("takes several administrators", async () => {
    const m = await boot(dir, {
      ADMIN_EMAILS: "one@example.com,two@example.com",
    });
    await m.auth.signup("one@example.com", "AdminOnePass28xx", "one");
    await m.auth.signup("two@example.com", "AdminTwoPass28xx", "two");
    await m.auth.signup("three@example.com", "PlainUserPass28xx", "three");
    expect(roleOf(m, "one@example.com")).toBe("admin");
    expect(roleOf(m, "two@example.com")).toBe("admin");
    expect(roleOf(m, "three@example.com")).toBe("user");
  });

  it("promotes an account that already existed", async () => {
    // An instance that has been running a while, and only now names an admin.
    const m = await boot(dir);
    await m.auth.signup("owner@example.com", "AlreadyHere28xxx", "owner");
    await m.auth.signup("later@example.com", "LaterUser28xxxxx", "later");
    expect(roleOf(m, "later@example.com")).toBe("user");

    const again = await boot(dir, { ADMIN_EMAILS: "later@example.com" });
    expect(again.bootstrap.applyDesignatedAdmins()).toBe(1);
    expect(roleOf(again, "later@example.com")).toBe("admin");
    // Grants, never revokes: a typo here must not lock the real admin out.
    expect(roleOf(again, "owner@example.com")).toBe("admin");
    // Idempotent, since it runs on every boot.
    expect(again.bootstrap.applyDesignatedAdmins()).toBe(0);
  });

  it("creates the account up front when given a password", async () => {
    const m = await boot(dir, {
      ADMIN_EMAILS: "boss@example.com",
      ADMIN_PASSWORD: "BootstrapPass28xx",
    });
    expect(await m.auth.bootstrapAdminAccount()).toBe("boss@example.com");
    expect(roleOf(m, "boss@example.com")).toBe("admin");

    // The email is taken, so nobody can register as the admin any more. That
    // is the hole the email alone leaves open.
    await expect(
      m.auth.signup("boss@example.com", "ImpostorPass28xxx", "impostor"),
    ).rejects.toThrow();

    // Doing nothing on later boots is what makes leaving the variables set
    // harmless.
    expect(await m.auth.bootstrapAdminAccount()).toBe(null);
  });

  it("forces the bootstrap password to be changed on first use", async () => {
    const m = await boot(dir, {
      ADMIN_EMAILS: "boss@example.com",
      ADMIN_PASSWORD: "BootstrapPass28xx",
    });
    await m.auth.bootstrapAdminAccount();
    const row = m.db
      .getSqlite()
      .prepare(`SELECT must_change_password AS f FROM users WHERE email = ?`)
      .get("boss@example.com") as { f: number };
    // What makes a secret in a compose file tolerable: it stops being a
    // password the moment it is used once.
    expect(row.f).toBe(1);
  });

  it("does not bootstrap for several emails at once", async () => {
    const m = await boot(dir, {
      ADMIN_EMAILS: "one@example.com,two@example.com",
      ADMIN_PASSWORD: "BootstrapPass28xx",
    });
    // Handing the same password to several accounts would be worse than the
    // problem it solves. They get promoted when they register instead.
    expect(await m.auth.bootstrapAdminAccount()).toBe(null);
    expect(roleOf(m, "one@example.com")).toBeUndefined();
  });
});
