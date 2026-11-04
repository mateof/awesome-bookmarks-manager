import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dir: string;

async function boot(dataDir: string) {
  process.env.DATA_DIR = dataDir;
  process.env.MASTER_KEY = Buffer.alloc(32, 11).toString("base64");
  process.env.SESSION_SECRET = Buffer.alloc(48, 12).toString("base64");
  vi.resetModules();
  const { ensureSchema } = await import("../../db/bootstrap.js");
  ensureSchema();
  return {
    db: await import("../../db/client.js"),
    bookmarks: await import("../../bookmarks/service.js"),
    tags: await import("../../tags/service.js"),
    search: await import("../service.js"),
  };
}

const USER = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const ctx = { userId: USER, dek: Buffer.alloc(32, 1) };

async function seeded() {
  const m = await boot(dir);
  const sqlite = m.db.getSqlite();
  sqlite
    .prepare(
      `INSERT INTO users (id, email, nickname, password_hash, kdf_salt, master_wrap, role)
       VALUES (?, 'search@example.com', 'search', 'x', x'00', x'00', 'user')`,
    )
    .run(USER);
  const add = (title: string, createdAt: string, extra: object = {}) => {
    const b = m.bookmarks.createBookmark(ctx, {
      title,
      url: `https://example.com/${encodeURIComponent(title)}`,
      fetchSnapshot: false,
      ...extra,
    });
    sqlite.prepare(`UPDATE bookmarks SET created_at = ? WHERE id = ?`).run(createdAt, b.id);
    return b;
  };
  return { m, add };
}

const titles = (rows: Array<{ bookmark: { title: string } }>) =>
  rows.map((r) => r.bookmark.title);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ab-search-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("search ordering and narrowing", () => {
  it("sorts the whole match set before applying the limit, not just the most relevant page", async () => {
    const { m, add } = await seeded();
    add("kubernetes viejo", "2020-01-01T00:00:00.000Z");
    add("kubernetes medio", "2022-01-01T00:00:00.000Z");
    add("guia kubernetes nuevo", "2026-01-01T00:00:00.000Z");

    expect(titles(m.search.search(ctx, "kubernetes", 1, { sort: "newest" }))).toEqual([
      "guia kubernetes nuevo",
    ]);
    expect(titles(m.search.search(ctx, "kubernetes", 1, { sort: "oldest" }))).toEqual([
      "kubernetes viejo",
    ]);
  });

  it("keeps typo matches behind exact ones even when they are newer", async () => {
    const { m, add } = await seeded();
    add("kubernetes", "2020-01-01T00:00:00.000Z");
    add("kubernetas", "2026-01-01T00:00:00.000Z");

    expect(titles(m.search.search(ctx, "kubernetes", 10, { sort: "newest" }))).toEqual([
      "kubernetes",
      "kubernetas",
    ]);
  });

  it("requires every requested tag and honours favourites and the date window", async () => {
    const { m, add } = await seeded();
    const a = m.tags.createTag(ctx, { name: "a", color: "#111111" });
    const b = m.tags.createTag(ctx, { name: "b", color: "#222222" });
    add("nota ambos", new Date().toISOString(), { tagIds: [a.id, b.id], favorite: true });
    add("nota uno", new Date().toISOString(), { tagIds: [a.id] });
    add("nota vieja", "2020-01-01T00:00:00.000Z", { tagIds: [a.id, b.id], favorite: true });

    expect(titles(m.search.search(ctx, "nota", 10, { tagIds: [a.id, b.id], since: "week" }))).toEqual([
      "nota ambos",
    ]);
    expect(
      titles(m.search.search(ctx, "nota", 10, { favorite: true, sort: "name" })),
    ).toEqual(["nota ambos", "nota vieja"]);
  });

  it("finds snapshot text beyond the relevance cap once a filter narrows the results", async () => {
    const { m, add } = await seeded();
    const tag = m.tags.createTag(ctx, { name: "t", color: "#111111" });
    const wanted = add("objetivo", "2026-01-01T00:00:00.000Z", { tagIds: [tag.id] });
    m.search.upsertSnapshotIndex(USER, wanted.id, "palabra");
    for (let i = 0; i < 3; i++) {
      const other = add(`ruido ${i}`, "2026-01-01T00:00:00.000Z");
      m.search.upsertSnapshotIndex(USER, other.id, "palabra palabra palabra palabra");
    }

    expect(titles(m.search.search(ctx, "palabra", 1, { tagIds: [tag.id] }))).toEqual(["objetivo"]);
  });
});
