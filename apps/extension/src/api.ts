import type { ExtConfig } from "./storage.js";

export interface QuickAddInput {
  url: string;
  title?: string;
  tags?: string[];
  folderId?: string | null;
}

export async function quickAdd(cfg: ExtConfig, input: QuickAddInput) {
  const res = await fetch(`${cfg.endpoint.replace(/\/$/, "")}/ext/quick-add`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json();
}
