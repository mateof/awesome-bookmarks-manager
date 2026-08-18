import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * The MCP + /api/v1 surface for library maintenance: smart folders, the trash
 * and duplicate merging.
 *
 * Beyond "the tools work", this pins the guard on the one irreversible action.
 * Emptying the trash demands the caller state how many items it expects to
 * destroy, so an assistant that never looked cannot supply it — that refusal
 * is asserted here, because a guard nobody tests is a guard that quietly rots.
 */
const user = {
  email: "mcp.library.e2e@example.com",
  nickname: "mcplibraryuser",
  password: "AiLibraryChores26x",
};

/** The MCP text payload, parsed. Tools answer with a single JSON text block. */
function payload(body: {
  result?: { content?: Array<{ text?: string }>; isError?: boolean };
}) {
  const text = body.result?.content?.[0]?.text ?? "{}";
  return { data: JSON.parse(text), isError: body.result?.isError === true };
}

test("MCP + API v1: carpetas inteligentes, papelera y duplicados", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, user);
  const req = page.request;

  const token = (
    await (
      await req.post("/api/extension/tokens", { data: { label: "mcp-library" } })
    ).json()
  ).token as string;
  expect(token).toBeTruthy();

  const bearer = { authorization: `Bearer ${token}` };
  const mcp = async (name: string, args: unknown) => {
    const res = await req.post("/api/mcp", {
      headers: {
        ...bearer,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      data: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name, arguments: args },
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    return payload(await res.json());
  };

  /* ---- smart folders ---------------------------------------------------- */

  const leer = await (
    await req.post("/api/tags", { data: { name: "leer", color: "#0ea5e9" } })
  ).json();
  await req.post("/api/bookmarks", {
    data: {
      url: "https://pendiente.example/uno",
      title: "Pendiente uno",
      tagIds: [leer.id],
      fetchSnapshot: false,
    },
  });
  await req.post("/api/bookmarks", {
    data: {
      url: "https://ajeno.example/",
      title: "Ajeno",
      fetchSnapshot: false,
    },
  });

  // Preview first, which is what an assistant should do before saving.
  const preview = await mcp("preview_smart_query", {
    tagIds: [leer.id],
    match: "any",
    text: "",
    favorite: false,
  });
  expect(preview.data.bookmarks).toHaveLength(1);
  expect(preview.data.bookmarks[0].title).toBe("Pendiente uno");

  const created = await mcp("create_smart_folder", {
    name: "Cola IA",
    color: "#10b981",
    tagIds: [leer.id],
    match: "any",
    text: "",
    favorite: false,
  });
  expect(created.data.name).toBe("Cola IA");

  // It is a live query: a newly tagged bookmark joins without touching it.
  const ajeno = (await (await req.get("/api/v1/bookmarks", { headers: bearer })).json()).find(
    (b: { title: string }) => b.title === "Ajeno",
  );
  await req.patch(`/api/bookmarks/${ajeno.id}`, { data: { tagIds: [leer.id] } });

  const items = await mcp("get_smart_folder_items", { id: created.data.id });
  expect(items.data.bookmarks).toHaveLength(2);
  expect(items.data.smartFolder.name).toBe("Cola IA");

  // The same folder resolves over the public REST API.
  const viaRest = await req.get(`/api/v1/smart-folders/${created.data.id}/items`, {
    headers: bearer,
  });
  expect(viaRest.ok()).toBeTruthy();
  expect((await viaRest.json()).bookmarks).toHaveLength(2);

  /* ---- duplicates ------------------------------------------------------- */

  const original = await (
    await req.post("/api/bookmarks", {
      data: {
        url: "https://repetida.example/doc",
        title: "Doc original",
        fetchSnapshot: false,
      },
    })
  ).json();
  const copy = await (
    await req.post("/api/bookmarks", {
      data: {
        url: "https://repetida.example/doc/#top",
        title: "Doc copia",
        tagIds: [leer.id],
        fetchSnapshot: false,
      },
    })
  ).json();

  const dupes = await mcp("find_duplicate_bookmarks", {});
  expect(dupes.data).toHaveLength(1);
  expect(dupes.data[0].bookmarks).toHaveLength(2);

  const merged = await mcp("merge_duplicate_bookmarks", {
    keepId: original.id,
    mergeIds: [copy.id],
  });
  expect(merged.data.merged).toBe(1);
  expect(merged.data.tagsAdded).toBe(1);

  const kept = await (
    await req.get(`/api/v1/bookmarks/${original.id}`, { headers: bearer })
  ).json();
  expect(kept.tagIds).toContain(leer.id);

  // Merging different URLs is refused rather than silently losing a bookmark.
  const bad = await req.post("/api/v1/bookmarks/merge", {
    headers: bearer,
    data: { keepId: original.id, mergeIds: [ajeno.id] },
  });
  expect(bad.status()).toBe(400);

  /* ---- trash ------------------------------------------------------------ */

  const trash = await mcp("list_trash", {});
  expect(trash.data).toHaveLength(1);
  expect(trash.data[0].title).toBe("Doc copia");

  // A merge is undoable through MCP too.
  const restored = await mcp("restore_from_trash", {
    type: "bookmark",
    id: copy.id,
  });
  expect(restored.data.bookmarks).toBe(1);
  expect((await mcp("count_trash", {})).data.count).toBe(0);

  // Put it back in the trash to exercise the destructive path.
  await req.delete(`/api/bookmarks/${copy.id}`);
  expect((await mcp("count_trash", {})).data.count).toBe(1);

  // Emptying with a stale expectation destroys nothing and says why.
  const refused = await mcp("empty_trash", {
    confirm: true,
    expectedItemCount: 7,
  });
  expect(refused.isError).toBe(true);
  expect(refused.data.actualItemCount).toBe(1);
  expect((await mcp("count_trash", {})).data.count).toBe(1);

  // With the real number it goes through, and the row is gone for good.
  const emptied = await mcp("empty_trash", {
    confirm: true,
    expectedItemCount: 1,
  });
  expect(emptied.isError).toBe(false);
  expect(emptied.data.destroyed).toBe(1);
  expect((await mcp("count_trash", {})).data.count).toBe(0);
  expect(
    (await req.get(`/api/v1/bookmarks/${copy.id}`, { headers: bearer })).status(),
  ).toBe(404);

  /* ---- cleanup of the saved query --------------------------------------- */

  await mcp("delete_smart_folder", { id: created.data.id });
  expect((await mcp("list_smart_folders", {})).data).toHaveLength(0);
  // Deleting the query left the bookmarks alone.
  expect(
    (await (await req.get("/api/v1/bookmarks", { headers: bearer })).json()).length,
  ).toBeGreaterThan(0);
});
