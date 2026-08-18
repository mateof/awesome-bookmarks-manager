import { test as setup } from "@playwright/test";
import { seedSpanish, signup } from "../fixtures/app.js";
import { admin } from "../fixtures/data.js";

/**
 * Register the instance's admin before any spec runs.
 *
 * The server grants the admin role to whoever signs up first. Left to chance
 * that is simply whichever spec file happens to sort first, which is both
 * invisible and liable to change the next time a file is added — the kind of
 * coupling that fails months later for no apparent reason. Claiming the role
 * here makes it deterministic and gives admin-only specs a known account.
 *
 * Wired as a `setup` project that the test projects depend on, so it runs once
 * per run, after the server is up.
 */
setup("register the instance admin", async ({ browser }) => {
  const ctx = await browser.newContext();
  await seedSpanish(ctx);
  const page = await ctx.newPage();
  await signup(page, admin);
  await ctx.close();
});
