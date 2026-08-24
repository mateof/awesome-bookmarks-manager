import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stopping a share has to stop the access.
 *
 * What makes content visible to a group is a **key scope grant**, not the row
 * in `group_shares`: `visibleTo` matches on `key_scope_id`, and the share row
 * is only the record of who handed it over and when. Deleting that row without
 * taking the grant away removes the entry from the sharing screen and changes
 * nothing about what the group can read — a revoke that reports success and
 * revokes nothing, which is the worst shape a security control can take.
 */

let dir: string;

async function boot(dataDir: string) {
  process.env.DATA_DIR = dataDir;
  process.env.MASTER_KEY = Buffer.alloc(32, 41).toString("base64");
  process.env.SESSION_SECRET = Buffer.alloc(48, 42).toString("base64");
  vi.resetModules();
  const { ensureSchema } = await import("../../db/bootstrap.js");
  ensureSchema();
  return {
    db: await import("../../db/client.js"),
    groups: await import("../service.js"),
    keys: await import("../keys.js"),
    folders: await import("../../folders/service.js"),
    databases: await import("../../databases/service.js"),
    userKeys: await import("../../auth/userKeys.js"),
  };
}

const OWNER = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";
const MEMBER = "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2";
const GROUP = "f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3";

function seed(m: Awaited<ReturnType<typeof boot>>) {
  const sqlite = m.db.getSqlite();
  for (const [id, email] of [
    [OWNER, "owner@example.com"],
    [MEMBER, "member@example.com"],
  ]) {
    sqlite
      .prepare(
        `INSERT INTO users (id, email, nickname, password_hash, kdf_salt, master_wrap)
         VALUES (?, ?, ?, 'x', x'00', x'00')`,
      )
      .run(id, email, email!.split("@")[0]);
  }
  const ownerCtx = { userId: OWNER, dek: Buffer.alloc(32, 1) };
  const memberCtx = { userId: MEMBER, dek: Buffer.alloc(32, 2) };
  m.userKeys.ensureUserKeys(OWNER, ownerCtx.dek);
  m.userKeys.ensureUserKeys(MEMBER, memberCtx.dek);
  sqlite
    .prepare(
      `INSERT INTO groups (id, owner_id, name, group_dek_wrapped, key_version, recoverable)
       VALUES (?, ?, 'Equipo', NULL, 1, 0)`,
    )
    .run(GROUP, OWNER);
  sqlite
    .prepare(
      `INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner'), (?, ?, 'editor')`,
    )
    .run(GROUP, OWNER, GROUP, MEMBER);
  m.keys.createGroupKey(GROUP, false);
  return { ownerCtx, memberCtx };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ab-revoke-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("revoking a share", () => {
  it("takes the group's access to a table away", async () => {
    const m = await boot(dir);
    const { ownerCtx, memberCtx } = seed(m);
    const table = m.databases.createDatabase(ownerCtx, "Precios");

    const share = m.groups.shareToGroup(ownerCtx, GROUP, {
      sourceType: "database",
      sourceId: table.id,
    });
    expect(
      m.databases.listDatabases(memberCtx).map((d) => d.name),
    ).toContain("Precios");

    m.groups.deleteShare(ownerCtx, share.id);

    // The point. Before, the share row went and the key scope grant stayed, so
    // the table was still in the member's list.
    expect(
      m.databases.listDatabases(memberCtx).map((d) => d.name),
    ).not.toContain("Precios");
    // And it is gone from the grants, not merely filtered out somewhere.
    const grants = m.db
      .getSqlite()
      .prepare(`SELECT count(*) AS n FROM key_scope_grants WHERE group_id = ?`)
      .get(GROUP) as { n: number };
    expect(grants.n).toBe(0);
  });

  it("takes it away for a folder and everything under it", async () => {
    const m = await boot(dir);
    const { ownerCtx, memberCtx } = seed(m);
    const folder = m.folders.createFolder(ownerCtx, { name: "Carpeta" });
    const share = m.groups.shareToGroup(ownerCtx, GROUP, {
      sourceType: "folder",
      sourceId: folder.id,
    });
    expect(m.folders.listFolders(memberCtx).map((f) => f.name)).toContain(
      "Carpeta",
    );

    m.groups.deleteShare(ownerCtx, share.id);
    expect(m.folders.listFolders(memberCtx).map((f) => f.name)).not.toContain(
      "Carpeta",
    );
  });

  it("leaves the other groups alone", async () => {
    const m = await boot(dir);
    const { ownerCtx, memberCtx } = seed(m);
    const sqlite = m.db.getSqlite();
    const OTHER = "a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4";
    sqlite
      .prepare(
        `INSERT INTO groups (id, owner_id, name, group_dek_wrapped, key_version, recoverable)
         VALUES (?, ?, 'Otro', NULL, 1, 0)`,
      )
      .run(OTHER, OWNER);
    sqlite
      .prepare(
        `INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'owner'), (?, ?, 'editor')`,
      )
      .run(OTHER, OWNER, OTHER, MEMBER);
    m.keys.createGroupKey(OTHER, false);

    const table = m.databases.createDatabase(ownerCtx, "Compartida");
    const first = m.groups.shareToGroup(ownerCtx, GROUP, {
      sourceType: "database",
      sourceId: table.id,
    });
    m.groups.shareToGroup(ownerCtx, OTHER, {
      sourceType: "database",
      sourceId: table.id,
    });

    // Stopping one share must not cut the audience that is still meant to see
    // it: the member reaches this table through the second group as well.
    m.groups.deleteShare(ownerCtx, first.id);
    expect(
      m.databases.listDatabases(memberCtx).map((d) => d.name),
    ).toContain("Compartida");
  });
});
