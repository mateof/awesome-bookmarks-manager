import { createFolder, listFolders, quickAdd, type FolderLite } from "./api.js";
import {
  getLastFolderId,
  loadConfig,
  setLastFolderId,
} from "./storage.js";

const ROOT_LABEL = "📁 Raíz";

let folders: FolderLite[] = [];

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** Depth-first list of folders with indentation, for the <select>. */
function buildOptions(list: FolderLite[]): { id: string; label: string }[] {
  const byParent = new Map<string | null, FolderLite[]>();
  for (const f of list) {
    const arr = byParent.get(f.parentId) ?? [];
    arr.push(f);
    byParent.set(f.parentId, arr);
  }
  const out: { id: string; label: string }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const k of byParent.get(parent) ?? []) {
      const indent = "  ".repeat(depth);
      out.push({ id: k.id, label: `${indent}${depth > 0 ? "↳ " : ""}${k.name}` });
      walk(k.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Human path of a folder id ("A / B / C"), or "Raíz" for the root. */
function pathOf(id: string | null): string {
  if (!id) return "Raíz";
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: string[] = [];
  let cur: string | null = id;
  let guard = 0;
  while (cur && guard++ < 50) {
    const f = byId.get(cur);
    if (!f) break;
    parts.unshift(f.name);
    cur = f.parentId;
  }
  return parts.join(" / ") || "Raíz";
}

function renderSelect(selectedId: string) {
  const select = el<HTMLSelectElement>("folder-select");
  const opts = [`<option value="">${ROOT_LABEL}</option>`];
  for (const o of buildOptions(folders)) {
    opts.push(`<option value="${o.id}">${o.label}</option>`);
  }
  select.innerHTML = opts.join("");
  select.value = selectedId;
}

function updateHint() {
  const select = el<HTMLSelectElement>("folder-select");
  el("new-folder-hint").textContent = `Se creará dentro de: ${pathOf(
    select.value || null,
  )}`;
}

async function init() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) return;

  el("title-display").textContent = tab.title ?? "";
  el("url-display").textContent = tab.url ?? "";
  el<HTMLInputElement>("title-input").value = tab.title ?? "";

  const status = el("status");
  const select = el<HTMLSelectElement>("folder-select");
  renderSelect("");

  const cfg = await loadConfig();

  // Populate the folder picker from the server (needs config).
  if (cfg) {
    try {
      folders = await listFolders(cfg);
      const last = await getLastFolderId();
      const keep = last && folders.some((f) => f.id === last) ? last : "";
      renderSelect(keep);
    } catch (e) {
      status.className = "err";
      status.textContent = `No se pudieron cargar las carpetas: ${
        e instanceof Error ? e.message : e
      }`;
    }
  }

  select.addEventListener("change", () => {
    void setLastFolderId(select.value || null);
    updateHint();
  });

  // Toggle the "new folder" area.
  el("new-folder-toggle").addEventListener("click", (e) => {
    e.preventDefault();
    const row = el("new-folder-row");
    const open = row.style.display !== "none";
    row.style.display = open ? "none" : "block";
    if (!open) {
      updateHint();
      el<HTMLInputElement>("new-folder-name").focus();
    }
  });

  // Create a folder under the currently selected folder (or root).
  el("new-folder-create").addEventListener("click", async () => {
    const name = el<HTMLInputElement>("new-folder-name").value.trim();
    if (!name) return;
    if (!cfg) {
      status.className = "err";
      status.textContent = "Configura el backend y el token primero";
      return;
    }
    const parentId = select.value || null;
    status.className = "";
    status.textContent = "Creando carpeta…";
    try {
      const created = await createFolder(cfg, { name, parentId });
      folders.push(created);
      renderSelect(created.id);
      void setLastFolderId(created.id);
      el<HTMLInputElement>("new-folder-name").value = "";
      el("new-folder-row").style.display = "none";
      status.className = "ok";
      status.textContent = `Carpeta "${created.name}" creada`;
    } catch (e) {
      status.className = "err";
      status.textContent = String(e instanceof Error ? e.message : e);
    }
  });

  el("save-btn").addEventListener("click", async () => {
    status.className = "";
    status.textContent = "Guardando…";

    if (!cfg) {
      status.className = "err";
      status.textContent = "Configura el backend y el token primero";
      return;
    }

    const title = el<HTMLInputElement>("title-input").value;
    const tagsRaw = el<HTMLInputElement>("tags-input").value;
    const tags = tagsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const folderId = select.value || null;

    try {
      await quickAdd(cfg, {
        url: tab.url ?? "",
        title,
        tags: tags.length > 0 ? tags : undefined,
        folderId,
      });
      void setLastFolderId(folderId);
      status.className = "ok";
      status.textContent = "Guardado ✓";
      setTimeout(() => window.close(), 600);
    } catch (e) {
      status.className = "err";
      status.textContent = String(e instanceof Error ? e.message : e);
    }
  });

  el("options-link").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

void init();
