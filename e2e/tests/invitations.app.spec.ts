import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Invitations: auto-accept from settings, invite by nickname, pending flow,
 * and instant SSE notification.
 */
const owner = {
  email: "ada.byron@example.com",
  nickname: "adab",
  password: "AnalyticalNotes1843",
};
const autoJoiner = {
  email: "charles.babbage@example.com",
  nickname: "charlesb",
  password: "DifferenceEngine1822",
};
const manual = {
  email: "john.vonneumann@example.com",
  nickname: "johnv",
  password: "StoredProgram1945x",
};

test("invitaciones: auto-aceptar por nickname y flujo pendiente", async ({
  browser,
}) => {
  const oCtx = await browser.newContext();
  await seedSpanish(oCtx);
  const oPage = await oCtx.newPage();
  await signup(oPage, owner);
  const oreq = oPage.request;

  // Auto-joiner enables auto-accept in their settings.
  const aCtx = await browser.newContext();
  await seedSpanish(aCtx);
  const aPage = await aCtx.newPage();
  await signup(aPage, autoJoiner);
  await aPage.request.patch("/api/me", {
    data: { autoAcceptInvitations: true },
  });

  const group = await (
    await oreq.post("/api/groups", { data: { name: "Motores" } })
  ).json();

  // Invite by NICKNAME -> auto-accepted (no pending, is a member).
  const inv = await (
    await oreq.post(`/api/groups/${group.id}/invitations`, {
      data: { email: autoJoiner.nickname, expiresInDays: 7 },
    })
  ).json();
  expect(inv.autoAccepted).toBe(true);

  const myGroups = await (await aPage.request.get("/api/groups")).json();
  expect(myGroups.some((g: { id: string }) => g.id === group.id)).toBeTruthy();
  const pending = await (await aPage.request.get("/api/invitations")).json();
  expect(pending.length).toBe(0);

  // A user WITHOUT auto-accept -> pending, then accepts.
  const mCtx = await browser.newContext();
  await seedSpanish(mCtx);
  const mPage = await mCtx.newPage();
  await signup(mPage, manual);
  const invM = await (
    await oreq.post(`/api/groups/${group.id}/invitations`, {
      data: { email: manual.email, expiresInDays: 7 },
    })
  ).json();
  expect(invM.autoAccepted).toBe(false);
  let pendingM = await (await mPage.request.get("/api/invitations")).json();
  expect(pendingM.length).toBe(1);
  expect(
    (await mPage.request.post(`/api/invitations/${invM.token}/accept`)).ok(),
  ).toBeTruthy();
  pendingM = await (await mPage.request.get("/api/invitations")).json();
  expect(pendingM.length).toBe(0);

  await oCtx.close();
  await aCtx.close();
  await mCtx.close();
});

test("invitaciones: notificación instantánea por SSE", async ({ browser }) => {
  const sseOwner = {
    email: "ada.sse@example.com",
    nickname: "adasse",
    password: "InstantNotify2026",
  };
  const sseInvitee = {
    email: "grace.sse@example.com",
    nickname: "gracesse",
    password: "EventStream2026x",
  };

  const oCtx = await browser.newContext();
  await seedSpanish(oCtx);
  const oPage = await oCtx.newPage();
  await signup(oPage, sseOwner);
  const group = await (
    await oPage.request.post("/api/groups", { data: { name: "SSE" } })
  ).json();

  const iCtx = await browser.newContext();
  await seedSpanish(iCtx);
  const iPage = await iCtx.newPage();
  await signup(iPage, sseInvitee);

  // Listen on the invitee's browser (cookies flow to the SSE endpoint).
  const got = iPage.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const es = new EventSource("/api/notifications/stream");
        es.onmessage = (e) => {
          es.close();
          resolve(e.data);
        };
        setTimeout(() => {
          es.close();
          resolve(null);
        }, 8000);
      }),
  );
  await iPage.waitForTimeout(600); // let the SSE connection register

  await oPage.request.post(`/api/groups/${group.id}/invitations`, {
    data: { email: sseInvitee.email, expiresInDays: 7 },
  });

  const data = await got;
  expect(data, "expected an SSE notification").toBeTruthy();
  const n = JSON.parse(data!);
  expect(n.type).toBe("invitation");
  expect(n.groupName).toBe("SSE");

  await oCtx.close();
  await iCtx.close();
});
