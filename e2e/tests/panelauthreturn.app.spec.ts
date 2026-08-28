import { expect, test } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";

/**
 * Logging in from a private panel leaves you in the panel.
 *
 * A panel restricted to certain accounts asks whoever opens it to log in, and
 * afterwards it sent them to their own home instead: the link somebody had
 * given them was simply gone from the screen, with no way back but to find the
 * message again. `LoginPage` already knew how to return to where the visitor
 * was headed; this door was the one that did not say where it came from.
 */
test("panel privado: iniciar sesión devuelve al panel, no al inicio", async ({
  browser,
}) => {
  // The owner, who makes the panel and lets one other account in.
  const ownerCtx = await browser.newContext();
  await seedSpanish(ownerCtx);
  const owner = await ownerCtx.newPage();
  await signup(owner, {
    email: "panel.owner.e2e@example.com",
    nickname: "panelowner",
    password: "PanelOwner27xxx",
  });

  const invitado = {
    email: "panel.guest.e2e@example.com",
    nickname: "panelguest",
    password: "PanelGuest27xxx",
  };

  // The guest registers *before* the panel names them: the server turns the
  // list of emails into accounts when the panel is saved, and an email with no
  // account behind it is dropped there and then.
  const guestCtx = await browser.newContext();
  await seedSpanish(guestCtx);
  const guest = await guestCtx.newPage();
  await signup(guest, invitado);
  await guest.context().clearCookies();

  const root = await (
    await owner.request.post("/api/folders", { data: { name: "Privado" } })
  ).json();
  await owner.request.post("/api/bookmarks", {
    data: {
      url: "https://privado.example/uno",
      title: "SoloParaInvitados",
      folderId: root.id,
      fetchSnapshot: false,
    },
  });
  await owner.request.post("/api/panels", {
    data: {
      title: "Privado",
      slug: "panelprivado",
      folderId: root.id,
      accessMode: "users",
      userEmails: [invitado.email],
    },
  });

  // Arrives at the panel with no session, the way anybody following a link
  // does.
  await guest.goto("/panel/panelprivado");
  await expect(guest.getByText(/Este panel es privado/)).toBeVisible({
    timeout: 20_000,
  });
  await guest.getByRole("link", { name: "Iniciar sesión" }).click();
  await expect(guest).toHaveURL(/\/login/);

  await guest.getByPlaceholder("Email o nickname").fill(invitado.email);
  await guest.getByPlaceholder("Contraseña", { exact: true }).fill(invitado.password);
  await guest.getByRole("button", { name: "Entrar", exact: true }).click();

  // Back at the panel, showing it — not at the visitor's own home.
  await expect(guest).toHaveURL(/\/panel\/panelprivado/);
  await expect(guest.getByText("SoloParaInvitados", { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  await guestCtx.close();
  await ownerCtx.close();
});

/**
 * The same journey for somebody who has no account yet.
 *
 * panel → «iniciar sesión» → «crear cuenta» is three steps, and the destination
 * used to survive the first and be dropped at the third: signing up always
 * landed on the app's home. Whether the new account is allowed into the panel
 * is a separate question — being *taken back to it* is the promise, and the
 * panel says the rest itself.
 */
test("panel privado: registrarse por el camino también devuelve al panel", async ({
  browser,
}) => {
  const ownerCtx = await browser.newContext();
  await seedSpanish(ownerCtx);
  const owner = await ownerCtx.newPage();
  await signup(owner, {
    email: "panel.owner2.e2e@example.com",
    nickname: "panelowner2",
    password: "PanelOwner2-27xx",
  });

  const root = await (
    await owner.request.post("/api/folders", { data: { name: "Privado2" } })
  ).json();
  await owner.request.post("/api/panels", {
    data: {
      title: "Privado2",
      slug: "panelprivado2",
      folderId: root.id,
      accessMode: "users",
      userEmails: ["panel.owner2.e2e@example.com"],
    },
  });

  const visitorCtx = await browser.newContext();
  await seedSpanish(visitorCtx);
  const visitor = await visitorCtx.newPage();

  await visitor.goto("/panel/panelprivado2");
  await visitor.getByRole("link", { name: "Iniciar sesión" }).click();
  await visitor.getByRole("link", { name: /Crear cuenta|¿No tienes cuenta/ }).click();
  await expect(visitor).toHaveURL(/\/signup/);

  await visitor.getByPlaceholder("Email", { exact: true }).fill("panel.newbie.e2e@example.com");
  await visitor.getByPlaceholder(/^Nickname/).fill("panelnewbie");
  await visitor.getByPlaceholder(/^Contraseña/).fill("PanelNewbie27xx");
  await visitor.getByRole("button", { name: "Crear cuenta" }).click();

  await expect(visitor).toHaveURL(/\/panel\/panelprivado2/);

  await visitorCtx.close();
  await ownerCtx.close();
});
