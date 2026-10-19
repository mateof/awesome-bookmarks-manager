document.documentElement.dataset.abExtension = chrome.runtime.getManifest().version;

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data as {
    source?: unknown;
    type?: unknown;
    bookmarkId?: unknown;
    url?: unknown;
    active?: unknown;
  } | null;
  if (!data || data.source !== "ab-web") return;
  if (data.type === "automations-changed") {
    void chrome.runtime.sendMessage({ type: "autofill-changed" });
    return;
  }
  if (data.type !== "open-bookmark") return;
  if (typeof data.bookmarkId !== "string") return;
  void chrome.runtime.sendMessage({
    type: "open-bookmark",
    bookmarkId: data.bookmarkId,
    url: typeof data.url === "string" ? data.url : null,
    active: data.active !== false,
  });
});
