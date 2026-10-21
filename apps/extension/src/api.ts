import type {
  AutofillRuntime,
  CaptureFormBody,
  CaptureFormResult,
} from "@awesome-bookmarks/shared";
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

export interface TagLite {
  id: string;
  name: string;
  color: string;
}

function base(cfg: ExtConfig): string {
  // The backend serves the API under `/api`. Be forgiving about how the user
  // typed the endpoint: accept both the plain server origin
  // (`https://host`) and the full API base (`https://host/api`), so a missing
  // `/api` doesn't send requests into the SPA (which returns index.html and
  // breaks JSON parsing with "Unexpected token '<'").
  const e = cfg.endpoint.trim().replace(/\/+$/, "");
  return /\/api$/.test(e) ? e : `${e}/api`;
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
    throw new HttpError(res.status, `HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function appOrigin(cfg: ExtConfig): string | null {
  try {
    return new URL(base(cfg)).origin;
  } catch {
    return null;
  }
}

export async function fetchAutofill(cfg: ExtConfig): Promise<AutofillRuntime> {
  return req(cfg, "/ext/autofill", { method: "GET" });
}

export async function captureForm(
  cfg: ExtConfig,
  body: CaptureFormBody,
): Promise<CaptureFormResult> {
  try {
    return await req(cfg, "/ext/autofill/capture", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof HttpError && e.status === 403) {
      throw new Error("Este token no tiene permiso de autorrelleno: crea uno con esa casilla marcada");
    }
    throw e;
  }
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

export async function listTags(cfg: ExtConfig): Promise<TagLite[]> {
  return req(cfg, "/ext/tags", { method: "GET" });
}

export async function createTag(
  cfg: ExtConfig,
  input: { name: string; color: string },
): Promise<TagLite> {
  return req(cfg, "/ext/tags", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
