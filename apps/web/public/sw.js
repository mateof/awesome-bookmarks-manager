/*
 * Minimal service worker.
 *
 * It exists for two reasons and no others: Chrome only treats the app as
 * installable (and therefore only offers it in the Android share sheet) when a
 * service worker is registered, and a navigation that arrives with no network
 * should show the app shell rather than the browser's dinosaur.
 *
 * It deliberately does NOT cache API responses. Everything under /api is
 * per-user, session-scoped and often encrypted; a stale cached copy would be
 * both wrong and a privacy problem.
 */

const SHELL_CACHE = "ab-shell-v1";
const SHELL_URL = "/index.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(SHELL_URL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navigations are network-first so a deploy is picked up immediately; the
  // cached shell is only a fallback for being offline. Vite fingerprints the
  // assets, so nothing else needs caching to stay consistent.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches
            .open(SHELL_CACHE)
            .then((cache) => cache.put(SHELL_URL, copy))
            .catch(() => {});
          return res;
        })
        .catch(() =>
          caches
            .match(SHELL_URL)
            .then((cached) => cached ?? Response.error()),
        ),
    );
  }
});
