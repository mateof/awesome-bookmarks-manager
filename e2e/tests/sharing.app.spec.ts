import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Shared editing. What a member may do is their **role in the group**; the
 * share itself no longer carries a level. Owner shares a folder as
 * "editor"; a group member edits a node in the live shared copy; a "viewer"
 * share rejects edits (403); a stale rev is rejected (409). API-level, using
 * the two users' session cookies.
 */
const marie = {
  email: "marie.curie@example.com",
  nickname: "marie",
  password: "Radioactivity1898",
};
const pierre = {
  email: "pierre.curie@example.com",
  nickname: "pierre",
  password: "Polonium1898Radium",
};

test("compartir con edición: editor edita, viewer 403, rev 409", async ({
  browser,
}) => {
  const ownerCtx = await browser.newContext();
  await seedSpanish(ownerCtx);
  const owner = await ownerCtx.newPage();
  await signup(owner, marie);
  const oreq = owner.request;

  const collabCtx = await browser.newContext();
  await seedSpanish(collabCtx);
  const collab = await collabCtx.newPage();
  await signup(collab, pierre);
  const creq = collab.request;

  // Owner: folder + bookmark to share.
  const folder = await (
    await oreq.post("/api/folders", { data: { name: "Compartida" } })
  ).json();
  await oreq.post("/api/bookmarks", {
    data: {
      url: "https://example.net/",
      title: "Original",
      folderId: folder.id,
      fetchSnapshot: false,
    },
  });

  // Owner: group + invite pierre; pierre accepts.
  const group = await (
    await oreq.post("/api/groups", { data: { name: "Equipo Curie" } })
  ).json();
  const inv = await (
    await oreq.post(`/api/groups/${group.id}/invitations`, {
      data: { email: pierre.email, expiresInDays: 7 },
    })
  ).json();
  expect(
    (await creq.post(`/api/invitations/${inv.token}/accept`)).ok(),
  ).toBeTruthy();

  // Helper: share the folder and wait until the collaborator can read it.
  const shareAndRead = async (label: string) => {
    void label;
    const share = await (
      await oreq.post(`/api/groups/${group.id}/shares`, {
        // No access level: the member's role in the group decides.
        data: { sourceType: "folder", sourceId: folder.id },
      })
    ).json();
    let content: {
      content: { bookmarks: { id: string; title: string }[] };
      access: string;
      rev: number;
    } | null = null;
    await expect(async () => {
      const j = await (await creq.get(`/api/shared/${share.id}`)).json();
      expect(j.content).toBeTruthy();
      content = j;
    }).toPass({ timeout: 30_000 });
    return { shareId: share.id as string, ...content! };
  };

  // Editor share: collaborator edits the bookmark node.
  const ed = await shareAndRead("editor");
  // Joining a group makes you an editor, so the share is editable.
  expect(ed.access).toBe("editor");
  const nodeId = ed.content.bookmarks[0]!.id;

  const patched = await creq.patch(`/api/shared/${ed.shareId}/node/${nodeId}`, {
    data: { title: "Editado por Pierre", baseRev: ed.rev },
  });
  expect(patched.ok(), await patched.text()).toBeTruthy();
  expect((await patched.json()).rev).toBe(ed.rev + 1);

  const after = await (await creq.get(`/api/shared/${ed.shareId}`)).json();
  expect(after.content.bookmarks[0].title).toBe("Editado por Pierre");

  // Replaying the old rev is a stale write -> 409.
  const stale = await creq.patch(`/api/shared/${ed.shareId}/node/${nodeId}`, {
    data: { title: "otra", baseRev: ed.rev },
  });
  expect(stale.status()).toBe(409);

  // Read-only is now a property of the person, not of the share: demote them
  // in the group and the same share stops accepting writes.
  const members = await (
    await oreq.get(`/api/groups/${group.id}/members`)
  ).json();
  const them = members.find(
    (x: { email: string }) => x.email === pierre.email,
  );
  const demoted = await oreq.patch(
    `/api/groups/${group.id}/members/${them.userId}/role`,
    { data: { role: "viewer" } },
  );
  expect(demoted.ok(), await demoted.text()).toBeTruthy();

  const vw = await shareAndRead("viewer");
  const forbidden = await creq.patch(
    `/api/shared/${vw.shareId}/node/${vw.content.bookmarks[0]!.id}`,
    { data: { title: "nope", baseRev: vw.rev } },
  );
  expect(forbidden.status()).toBe(403);

  await ownerCtx.close();
  await collabCtx.close();
});
