import { type APIRequestContext, expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Group management: sent-invitation status (pending/accepted/rejected), cancel
 * an unused invitation, reject an invitation, and the "shared by me" list with
 * revoke.
 */
const owner = {
  email: "lynn.conway@example.com",
  nickname: "lynnc",
  password: "GeneralizedDynamic1968",
};
const userA = {
  email: "katherine.johnson@example.com",
  nickname: "katj",
  password: "OrbitalMechanics1962",
};
const userB = {
  email: "dorothy.vaughan@example.com",
  nickname: "dorothyv",
  password: "FortranProgrammer1949",
};
const userC = {
  email: "mary.jackson@example.com",
  nickname: "maryj",
  password: "Aerospace1958Engineer",
};

test("gestión de grupo: estados de invitación, cancelar, rechazar, por mí", async ({
  browser,
}) => {
  const mk = async (u: {
    email: string;
    nickname: string;
    password: string;
  }): Promise<APIRequestContext> => {
    const ctx = await browser.newContext();
    await seedSpanish(ctx);
    const page = await ctx.newPage();
    await signup(page, u);
    return page.request;
  };

  const oreq = await mk(owner);
  const areq = await mk(userA);
  const breq = await mk(userB);
  const creq = await mk(userC);

  const group = await (
    await oreq.post("/api/groups", { data: { name: "Hidden Figures" } })
  ).json();
  const folder = await (
    await oreq.post("/api/folders", { data: { name: "Cálculos" } })
  ).json();

  const invite = async (who: { email: string }) =>
    (
      await oreq.post(`/api/groups/${group.id}/invitations`, {
        data: { email: who.email, expiresInDays: 7 },
      })
    ).json();

  const invA = await invite(userA);
  const invB = await invite(userB);
  const invC = await invite(userC);

  // A accepts, B rejects, C stays pending.
  expect((await areq.post(`/api/invitations/${invA.token}/accept`)).ok()).toBeTruthy();
  expect((await breq.post(`/api/invitations/${invB.token}/reject`)).ok()).toBeTruthy();

  // B's rejected invitation no longer shows in B's pending list.
  expect((await (await breq.get("/api/invitations")).json()).length).toBe(0);

  // Owner sees the statuses.
  const list = await (
    await oreq.get(`/api/groups/${group.id}/invitations`)
  ).json();
  const byEmail = (e: string) =>
    list.find((i: { email: string }) => i.email === e);
  expect(byEmail(userA.email).status).toBe("accepted");
  expect(byEmail(userB.email).status).toBe("rejected");
  expect(byEmail(userC.email).status).toBe("pending");
  // Pending invitations expose their token so the sender can re-copy the link.
  expect(byEmail(userC.email).token).toBe(invC.token);

  // Cancel the pending one; cannot cancel an accepted one.
  expect(
    (await oreq.delete(`/api/groups/${group.id}/invitations/${invC.id}`)).ok(),
  ).toBeTruthy();
  expect(
    (await oreq.delete(`/api/groups/${group.id}/invitations/${invA.id}`)).status(),
  ).toBe(400);

  // Share a folder as editor and see it under "shared by me" with a label.
  await oreq.post(`/api/groups/${group.id}/shares`, {
    data: { sourceType: "folder", sourceId: folder.id, access: "editor" },
  });
  let mine: {
    id: string;
    groupId: string;
    access: string;
    label: string | null;
  }[] = [];
  await expect(async () => {
    mine = await (await oreq.get("/api/shared/by-me")).json();
    expect(mine.length).toBe(1);
    expect(mine[0]!.label).toBe("Cálculos"); // sealed + decoded
  }).toPass({ timeout: 30_000 });
  expect(mine[0]!.access).toBe("editor");

  // Revoke it -> the list empties.
  expect(
    (
      await oreq.delete(`/api/groups/${group.id}/shares/${mine[0]!.id}`)
    ).ok(),
  ).toBeTruthy();
  expect((await (await oreq.get("/api/shared/by-me")).json()).length).toBe(0);
});
