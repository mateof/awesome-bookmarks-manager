import type { ExtConfig } from "./storage.js";

export interface QuickAddInput {
  url: string;
  title?: string;
  tags?: string[];
  folderId?: string | null;
}

export interface FolderLite {
  id: string;
  parentId: string | null;
  name: string;
}

function base(cfg: ExtConfig): string {
  return cfg.endpoint.replace(/\/$/, "");
}

async function req(cfg: ExtConfig, path: string, init: RequestInit) {
  const res = await fetch(`${base(cfg)}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

export async function quickAdd(cfg: ExtConfig, input: QuickAddInput) {
  return req(cfg, "/ext/quick-add", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listFolders(cfg: ExtConfig): Promise<FolderLite[]> {
  return req(cfg, "/ext/folders", { method: "GET" });
}

export async function createFolder(
  cfg: ExtConfig,
  input: { name: string; parentId?: string | null },
): Promise<FolderLite> {
  return req(cfg, "/ext/folders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
