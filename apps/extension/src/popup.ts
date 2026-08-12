import {
  createFolder,
  createTag,
  listFolders,
  listTags,
  quickAdd,
  type FolderLite,
  type TagLite,
} from "./api.js";
import {
  type ExtConfig,
  getLastFolderId,
  loadConfig,
  setLastFolderId,
} from "./storage.js";

const ROOT_LABEL = "📁 Raíz";
const PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];
const DEFAULT_TAG_COLOR = "#3b82f6";

let folders: FolderLite[] = [];
let allTags: TagLite[] = [];
let selectedFolderId: string | null = null; // null = root
const expanded = new Set<string>();
const chosenTags: { name: string; color: string; id?: string }[] = [];
let cfg: ExtConfig | null = null;
let tabUrl = "";

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/* ---------------------------------------------------------------- */
/* Folders                                                          */
/* ---------------------------------------------------------------- */

function childrenOf(parent: string | null): FolderLite[] {
  return folders
    .filter((f) => f.parentId === parent)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function ancestorsOf(id: string): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: string[] = [];
  let cur: string | null = byId.get(id)?.parentId ?? null;
  let guard = 0;
  while (cur && guard++ < 50) {
    out.push(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  return out;
}

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

function rowEl(opts: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  chevron?: "open" | "closed" | null;
  onChevron?: () => void;
  indent?: number;
  path?: string;
}): HTMLElement {
  const row = document.createElement("div");
  row.className = `tree-row${opts.selected ? " sel" : ""}`;
  if (opts.indent) row.style.marginLeft = `${opts.indent * 14}px`;
  const chev = document.createElement("span");
  chev.className = "tree-chevron";
  if (opts.chevron) {
    chev.textContent = opts.chevron === "open" ? "▾" : "▸";
    chev.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onChevron?.();
    });
  }
  row.appendChild(chev);
  const name = document.createElement("span");
  name.className = "tree-name";
  name.textContent = opts.label;
  row.appendChild(name);
  if (opts.path) {
    const p = document.createElement("span");
    p.className = "tree-path";
    p.textContent = opts.path;
    row.appendChild(p);
  }
  row.addEventListener("click", opts.onSelect);
  return row;
}

function renderTree() {
  const container = el("folder-tree");
  container.innerHTML = "";
  const q = el<HTMLInputElement>("folder-search").value.trim().toLowerCase();

  container.appendChild(
    rowEl({
      label: ROOT_LABEL,
      selected: selectedFolderId === null,
      onSelect: () => selectFolder(null),
    }),
  );

  if (q) {
    // Flat, path-annotated list of matches (folders can be found without
    // expanding the whole tree).
    const matches = folders
      .filter((f) => f.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (matches.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tree-empty";
      empty.textContent = "Sin coincidencias";
      container.appendChild(empty);
    }
    for (const f of matches) {
      container.appendChild(
        rowEl({
          label: f.name,
          selected: selectedFolderId === f.id,
          onSelect: () => selectFolder(f.id),
          path: pathOf(f.parentId),
        }),
      );
    }
    return;
  }

  // Collapsed tree: children appear only when their parent is expanded.
  const walk = (parent: string | null, depth: number) => {
    for (const f of childrenOf(parent)) {
      const kids = childrenOf(f.id);
      const open = expanded.has(f.id);
      container.appendChild(
        rowEl({
          label: f.name,
          selected: selectedFolderId === f.id,
          onSelect: () => selectFolder(f.id),
          chevron: kids.length > 0 ? (open ? "open" : "closed") : null,
          onChevron: () => {
            if (open) expanded.delete(f.id);
            else expanded.add(f.id);
            renderTree();
          },
          indent: depth,
        }),
      );
      if (kids.length > 0 && open) walk(f.id, depth + 1);
    }
  };
  walk(null, 1);
}

function selectFolder(id: string | null) {
  selectedFolderId = id;
  void setLastFolderId(id);
  updateHint();
  renderTree();
}

function updateHint() {
  el("new-folder-hint").textContent = `Se creará dentro de: ${pathOf(
    selectedFolderId,
  )}`;
}

/* ---------------------------------------------------------------- */
/* Tags                                                             */
/* ---------------------------------------------------------------- */

function alreadyChosen(name: string): boolean {
  return chosenTags.some((c) => c.name.toLowerCase() === name.toLowerCase());
}

function renderChips() {
  const box = el("tag-chips");
  box.innerHTML = "";
  chosenTags.forEach((c, idx) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    const dot = document.createElement("span");
    dot.className = "tag-dot";
    dot.style.background = c.color;
    if (!c.id) {
      dot.title = "Clic para cambiar el color";
      dot.addEventListener("click", () => {
        const i = PALETTE.indexOf(c.color);
        c.color = PALETTE[(i + 1) % PALETTE.length]!;
        renderChips();
      });
    } else {
      dot.style.cursor = "default";
    }
    chip.appendChild(dot);
    const label = document.createElement("span");
    label.textContent = c.name;
    chip.appendChild(label);
    const rm = document.createElement("button");
    rm.className = "rm";
    rm.textContent = "×";
    rm.title = "Quitar";
    rm.addEventListener("click", () => {
      chosenTags.splice(idx, 1);
      renderChips();
      renderSuggest();
    });
    chip.appendChild(rm);
    box.appendChild(chip);
  });
}

function addTag(name: string, color: string, id?: string) {
  const n = name.trim();
  if (!n || alreadyChosen(n)) return;
  chosenTags.push({ name: n, color, id });
  el<HTMLInputElement>("tags-input").value = "";
  renderChips();
  renderSuggest();
  el<HTMLInputElement>("tags-input").focus();
}

function renderSuggest() {
  const box = el("tag-suggest");
  box.innerHTML = "";
  const input = el<HTMLInputElement>("tags-input");
  const raw = input.value.trim();
  const q = raw.toLowerCase();
  if (!q) return;

  const matches = allTags
    .filter((t) => t.name.toLowerCase().includes(q) && !alreadyChosen(t.name))
    .slice(0, 6);
  for (const t of matches) {
    const row = document.createElement("div");
    row.className = "suggest-row";
    const dot = document.createElement("span");
    dot.className = "tag-dot";
    dot.style.background = t.color;
    dot.style.cursor = "default";
    row.appendChild(dot);
    const label = document.createElement("span");
    label.textContent = t.name;
    row.appendChild(label);
    row.addEventListener("click", () => addTag(t.name, t.color, t.id));
    box.appendChild(row);
  }

  // Offer to create a brand-new tag with a colour of your choice.
  const exact = allTags.some((t) => t.name.toLowerCase() === q);
  if (!exact && !alreadyChosen(raw)) {
    const row = document.createElement("div");
    row.className = "suggest-row";
    const label = document.createElement("span");
    label.textContent = `Crear «${raw}»`;
    row.appendChild(label);
    const sw = document.createElement("span");
    sw.className = "swatches";
    for (const color of PALETTE) {
      const s = document.createElement("span");
      s.className = "swatch";
      s.style.background = color;
      s.title = color;
      s.addEventListener("click", (e) => {
        e.stopPropagation();
        addTag(raw, color);
      });
      sw.appendChild(s);
    }
    row.appendChild(sw);
    row.addEventListener("click", () => addTag(raw, DEFAULT_TAG_COLOR));
    box.appendChild(row);
  }
}

/* ---------------------------------------------------------------- */
/* Init                                                             */
/* ---------------------------------------------------------------- */

async function init() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) return;
  tabUrl = tab.url ?? "";

  el("title-display").textContent = tab.title ?? "";
  el("url-display").textContent = tab.url ?? "";
  el<HTMLInputElement>("title-input").value = tab.title ?? "";

  const status = el("status");
  cfg = await loadConfig();

  if (cfg) {
    try {
      [folders, allTags] = await Promise.all([listFolders(cfg), listTags(cfg)]);
      const last = await getLastFolderId();
      if (last && folders.some((f) => f.id === last)) {
        selectedFolderId = last;
        for (const a of ancestorsOf(last)) expanded.add(a);
      }
    } catch (e) {
      status.className = "err";
      status.textContent = `No se pudieron cargar las carpetas: ${
        e instanceof Error ? e.message : e
      }`;
    }
  }

  renderTree();
  renderChips();
  updateHint();

  el<HTMLInputElement>("folder-search").addEventListener("input", renderTree);

  const tagsInput = el<HTMLInputElement>("tags-input");
  tagsInput.addEventListener("input", renderSuggest);
  tagsInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== ",") return;
    const v = tagsInput.value.trim();
    if (!v) return;
    e.preventDefault();
    const existing = allTags.find((t) => t.name.toLowerCase() === v.toLowerCase());
    if (existing) addTag(existing.name, existing.color, existing.id);
    else addTag(v, DEFAULT_TAG_COLOR);
  });

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

  el("new-folder-create").addEventListener("click", async () => {
    const name = el<HTMLInputElement>("new-folder-name").value.trim();
    if (!name) return;
    if (!cfg) {
      status.className = "err";
      status.textContent = "Configura el backend y el token primero";
      return;
    }
    const parentId = selectedFolderId;
    status.className = "";
    status.textContent = "Creando carpeta…";
    try {
      const created = await createFolder(cfg, { name, parentId });
      folders.push(created);
      for (const a of ancestorsOf(created.id)) expanded.add(a);
      el<HTMLInputElement>("folder-search").value = "";
      selectFolder(created.id);
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
    try {
      // Ensure brand-new tags exist with the chosen colour before saving.
      for (const c of chosenTags.filter((t) => !t.id)) {
        const t = await createTag(cfg, { name: c.name, color: c.color });
        c.id = t.id;
      }
      await quickAdd(cfg, {
        url: tabUrl,
        title,
        tags: chosenTags.length > 0 ? chosenTags.map((c) => c.name) : undefined,
        folderId: selectedFolderId,
      });
      void setLastFolderId(selectedFolderId);
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
