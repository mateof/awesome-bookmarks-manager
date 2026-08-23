import { expect, test } from "@playwright/test";
import { createFolder, seedSpanish, signup } from "../fixtures/app.js";

/**
 * The server clock, and the timestamps it exists to settle arguments about.
 *
 * Stored times used to come back as `2026-08-23 08:15:00`: UTC, and unmarked.
 * A browser reads that space-separated form as *local* time, so everything the
 * app showed was off by the reader's own offset. The runner is pinned to
 * Europe/Madrid, so the wrong answer here is two hours out in summer.
 */
test("la hora del servidor se ve, avanza, y las fechas guardadas dicen su zona", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, {
    email: "clock.e2e@example.com",
    nickname: "clockuser",
    password: "ServerClock28xxx",
  });

  // Anything the app stamps itself. A folder is the cheapest.
  const before = Date.now();
  await createFolder(page, "Con fecha");
  const folders = await (await page.request.get("/api/folders")).json();
  const mine = folders.find((f: { name: string }) => f.name === "Con fecha");

  // The marker is the whole point: without it the client has to guess, and it
  // guesses local.
  expect(mine.createdAt).toMatch(/Z$/);
  const stamped = new Date(mine.createdAt).getTime();
  // Created seconds ago, so anything near an hour out is the bug this catches.
  expect(Math.abs(stamped - before)).toBeLessThan(120_000);

  // The endpoint answers in the same shape the stored values use, so what the
  // clock renders and what a history row renders go through one path.
  const time = await (await page.request.get("/api/time")).json();
  expect(time.now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  expect(Math.abs(new Date(time.now).getTime() - Date.now())).toBeLessThan(
    120_000,
  );

  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Hora del servidor" }),
  ).toBeVisible();

  // It ticks on its own rather than sitting on the reading it fetched.
  const shown = () =>
    page.getByText(/\d{1,2}:\d{2}:\d{2}/).first().innerText();
  const first = await shown();
  await expect(async () => {
    expect(await shown()).not.toBe(first);
  }).toPass({ timeout: 10_000 });

  // Both clocks and the gap between them, which is what actually answers
  // "whose time is wrong".
  await expect(page.getByText("Servidor", { exact: true })).toBeVisible();
  await expect(page.getByText("La tuya", { exact: true })).toBeVisible();
  await expect(page.getByText("Diferencia", { exact: true })).toBeVisible();
  // Same machine in the tests, so the two clocks agree on the instant even
  // though they name it differently.
  await expect(page.getByText("En hora")).toBeVisible();

  await ctx.close();
});
