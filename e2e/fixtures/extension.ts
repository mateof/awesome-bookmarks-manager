import { test as base, chromium, type BrowserContext } from "@playwright/test";
import { EXT_DIST } from "./config.js";

/**
 * Chrome can only load an unpacked extension through a persistent context, so
 * extension specs use this fixture instead of the default page/context. The
 * extension id is read from the MV3 service worker URL.
 */
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    // The default headless build is the "headless shell", which does not run
    // MV3 service workers. `channel: "chromium"` uses the full Chromium binary,
    // whose headless mode (--headless=new) loads extensions properly.
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${EXT_DIST}`,
        `--load-extension=${EXT_DIST}`,
      ],
    });
    await context.addInitScript(() => {
      try {
        localStorage.setItem("language", "es");
      } catch {
        /* ignore */
      }
    });
    context.on("page", (page) => {
      page.on("dialog", (d) => d.accept().catch(() => {}));
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent("serviceworker");
    const id = sw.url().split("/")[2];
    await use(id);
  },
});

export const expect = test.expect;
