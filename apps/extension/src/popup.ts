import { quickAdd } from "./api.js";
import { loadConfig } from "./storage.js";

async function init() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) return;

  document.getElementById("title-display")!.textContent = tab.title ?? "";
  document.getElementById("url-display")!.textContent = tab.url ?? "";
  (document.getElementById("title-input") as HTMLInputElement).value =
    tab.title ?? "";

  document.getElementById("save-btn")!.addEventListener("click", async () => {
    const status = document.getElementById("status")!;
    status.className = "";
    status.textContent = "Guardando…";

    const cfg = await loadConfig();
    if (!cfg) {
      status.className = "err";
      status.textContent = "Configura el backend y el token primero";
      return;
    }

    const title = (document.getElementById("title-input") as HTMLInputElement)
      .value;
    const tagsRaw = (document.getElementById("tags-input") as HTMLInputElement)
      .value;
    const tags = tagsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await quickAdd(cfg, {
        url: tab.url ?? "",
        title,
        tags: tags.length > 0 ? tags : undefined,
      });
      status.className = "ok";
      status.textContent = "Guardado ✓";
      setTimeout(() => window.close(), 600);
    } catch (e) {
      status.className = "err";
      status.textContent = String(e instanceof Error ? e.message : e);
    }
  });

  document.getElementById("options-link")!.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

void init();
