export interface ExtConfig {
  endpoint: string;
  token: string;
}

export async function loadConfig(): Promise<ExtConfig | null> {
  const r = await chrome.storage.local.get(["endpoint", "token"]);
  if (!r.endpoint || !r.token) return null;
  return { endpoint: r.endpoint, token: r.token };
}

export async function saveConfig(cfg: ExtConfig): Promise<void> {
  await chrome.storage.local.set(cfg);
}

/** Remember the folder last used, so the popup and the shortcut agree. */
export async function getLastFolderId(): Promise<string | null> {
  const r = await chrome.storage.local.get(["lastFolderId"]);
  return typeof r.lastFolderId === "string" ? r.lastFolderId : null;
}

export async function setLastFolderId(id: string | null): Promise<void> {
  await chrome.storage.local.set({ lastFolderId: id ?? "" });
}
