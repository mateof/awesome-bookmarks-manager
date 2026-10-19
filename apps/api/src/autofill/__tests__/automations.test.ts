import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    autofill: await import("../service.js"),
    bookmarks: await import("../../bookmarks/service.js"),
    tokens: await import("../../extension/service.js"),
    apiAuth: await import("../../auth/api-auth.js"),
    shared: await import("@awesome-bookmarks/shared"),
  };
}

const USER = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const OTHER = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
const VAR_ID = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";

function seed(m: Awaited<ReturnType<typeof boot>>) {
  const sqlite = m.db.getSqlite();
  for (const [id, email] of [
    [USER, "user@example.com"],
    [OTHER, "other@example.com"],
  ]) {
    sqlite
      .prepare(
        `INSERT INTO users (id, email, nickname, password_hash, kdf_salt, master_wrap, auto_snapshots)
         VALUES (?, ?, ?, 'x', x'00', x'00', 0)`,
      )
      .run(id, email, email!.split("@")[0]);
  }
  const ctx = { userId: USER, dek: Buffer.alloc(32, 1) };
  const otherCtx = { userId: OTHER, dek: Buffer.alloc(32, 2) };
  const bookmark = m.bookmarks.createBookmark(ctx, {
    url: "https://sede.example.gob.es/tramite/alta",
    title: "Alta",
    folderId: null,
    fetchSnapshot: false,
  });
  m.autofill.saveVariables(ctx, [
    {
      id: VAR_ID,
      key: "dni",
      label: "DNI",
      description: "Documento nacional",
      value: "12345678Z",
    },
  ]);
  return { ctx, otherCtx, bookmark };
}

const steps = (selector = "#nif") =>
  ({
    enabled: true,
    trigger: "open" as const,
    timeoutMs: 10000,
    steps: [{ action: "fill" as const, selector, value: "{{dni}}" }],
    script: "",
  });

function bearer(token: string, sessionUserId?: string): FastifyRequest {
  return {
    headers: { authorization: `Bearer ${token}` },
    session: { get: () => sessionUserId },
  } as unknown as FastifyRequest;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ab-autofill-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("autofill automations", () => {
  it("saved from the web app run straight away, because the person saving them is the owner looking at them", async () => {
    const m = await boot(dir);
    const { ctx, bookmark } = seed(m);
    const saved = m.autofill.setAutomation(ctx, bookmark.id, steps(), { approve: true });
    expect(saved.status).toBe("approved");
    expect(m.autofill.autofillRuntime(ctx).automations).toHaveLength(1);
  });

  it("written through the API or MCP stay pending and never reach the runtime until approved", async () => {
    const m = await boot(dir);
    const { ctx, bookmark } = seed(m);
    const saved = m.autofill.setAutomation(ctx, bookmark.id, steps(), { approve: false });
    expect(saved.status).toBe("pending");
    expect(m.autofill.autofillRuntime(ctx).automations).toHaveLength(0);

    const approved = m.autofill.approveAutomation(ctx, bookmark.id, saved.fingerprint);
    expect(approved.status).toBe("approved");
    expect(m.autofill.autofillRuntime(ctx).automations).toHaveLength(1);
  });

  it("an API edit to an approved automation takes the approval away instead of inheriting it", async () => {
    const m = await boot(dir);
    const { ctx, bookmark } = seed(m);
    m.autofill.setAutomation(ctx, bookmark.id, steps(), { approve: true });
    const edited = m.autofill.setAutomation(ctx, bookmark.id, steps("#evil"), {
      approve: false,
    });
    expect(edited.status).toBe("pending");
    expect(m.autofill.autofillRuntime(ctx).automations).toHaveLength(0);
  });

  it("moving the bookmark to another site revokes the approval, so a filled DNI cannot be redirected to a different origin", async () => {
    const m = await boot(dir);
    const { ctx, bookmark } = seed(m);
    m.autofill.setAutomation(ctx, bookmark.id, steps(), { approve: true });
    m.bookmarks.updateBookmark(ctx, bookmark.id, {
      url: "https://attacker.example.com/tramite/alta",
    });
    expect(m.autofill.getAutomation(ctx, bookmark.id)!.status).toBe("pending");
    expect(m.autofill.autofillRuntime(ctx).automations).toHaveLength(0);
  });

  it("a path change on the same site keeps the approval", async () => {
    const m = await boot(dir);
    const { ctx, bookmark } = seed(m);
    m.autofill.setAutomation(ctx, bookmark.id, steps(), { approve: true });
    m.bookmarks.updateBookmark(ctx, bookmark.id, {
      url: "https://sede.example.gob.es/tramite/alta-v2",
    });
    expect(m.autofill.getAutomation(ctx, bookmark.id)!.status).toBe("approved");
  });

  it("approving refuses a fingerprint that is not what the server now holds, so a change made after the review is not approved blind", async () => {
    const m = await boot(dir);
    const { ctx, bookmark } = seed(m);
    const shown = m.autofill.setAutomation(ctx, bookmark.id, steps(), { approve: false });
    m.autofill.setAutomation(ctx, bookmark.id, steps("#swapped"), { approve: false });
    expect(() =>
      m.autofill.approveAutomation(ctx, bookmark.id, shown.fingerprint),
    ).toThrow(/changed/);
  });

  it("belong to one person: someone else gets nothing for the same bookmark id", async () => {
    const m = await boot(dir);
    const { ctx, otherCtx, bookmark } = seed(m);
    m.autofill.setAutomation(ctx, bookmark.id, steps(), { approve: true });
    expect(() => m.autofill.getAutomation(otherCtx, bookmark.id)).toThrow(/not found/i);
    expect(m.autofill.autofillRuntime(otherCtx).automations).toHaveLength(0);
  });

  it("refuse bookmarks that are not http or https", async () => {
    const m = await boot(dir);
    const { ctx } = seed(m);
    const js = m.bookmarks.createBookmark(ctx, {
      url: "javascript:alert(1)",
      title: "Bookmarklet",
      folderId: null,
      fetchSnapshot: false,
    });
    expect(() =>
      m.autofill.setAutomation(ctx, js.id, steps(), { approve: true }),
    ).toThrow(/http/);
  });

  it("report variables the steps use but the profile does not define", async () => {
    const m = await boot(dir);
    const { ctx, bookmark } = seed(m);
    const saved = m.autofill.setAutomation(
      ctx,
      bookmark.id,
      {
        ...steps(),
        steps: [{ action: "fill", selector: "#x", value: "{{dni}} {{pasaporte}}" }],
        script: "use(ab.vars.telefono)",
      },
      { approve: true },
    );
    expect(saved.unknownVariables).toEqual(["pasaporte", "telefono"]);
  });
});

describe("autofill variables", () => {
  it("are described to API and MCP clients without their values", async () => {
    const m = await boot(dir);
    const { ctx } = seed(m);
    const info = m.autofill.listVariableInfo(ctx);
    expect(info).toEqual([
      { id: VAR_ID, key: "dni", label: "DNI", description: "Documento nacional", hasValue: true },
    ]);
    expect(JSON.stringify(info)).not.toContain("12345678Z");
  });

  it("are only readable with a token minted for autofill, so an MCP token cannot fetch them over HTTP", async () => {
    const m = await boot(dir);
    const { ctx } = seed(m);
    const plain = m.tokens.createToken(USER, "mcp", ctx.dek);
    const scoped = m.tokens.createToken(USER, "extension", ctx.dek, true);
    expect(() => m.apiAuth.requireAutofillAuth(bearer(plain))).toThrow(/not allowed/);
    expect(m.apiAuth.requireAutofillAuth(bearer(scoped)).userId).toBe(USER);
  });

  it("judge a request by its token even when it also carries a logged-in cookie", async () => {
    const m = await boot(dir);
    const { ctx } = seed(m);
    const { keyCache } = await import("../../auth/key-cache.js");
    keyCache.put(USER, ctx.dek);
    const plain = m.tokens.createToken(USER, "mcp", ctx.dek);
    expect(() => m.apiAuth.requireAutofillAuth(bearer(plain, USER))).toThrow(/not allowed/);
  });

  it("reject duplicate keys", async () => {
    const m = await boot(dir);
    const parsed = m.shared.SaveAutofillVariablesBodySchema.safeParse({
      variables: [
        { id: VAR_ID, key: "dni", label: "DNI" },
        { id: "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4", key: "dni", label: "Otro" },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
