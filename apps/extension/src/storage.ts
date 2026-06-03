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
