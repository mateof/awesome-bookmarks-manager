import { getEnv } from "../env.js";

interface Entry {
  dek: Buffer;
  loadedAt: number;
  lastUsedAt: number;
}

/**
 * In-memory DEK cache keyed by userId. The DEK never touches disk and is
 * cleared after idle/hard TTL. Multiple sessions of the same user share an
 * entry — a logout in one tab does not evict it for the others (TTL handles
 * eventual eviction).
 */
class KeyCache {
  private map = new Map<string, Entry>();
  private timer: NodeJS.Timeout | null = null;

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.sweep(), 60_000);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  put(userId: string, dek: Buffer) {
    const now = Date.now();
    this.map.set(userId, { dek, loadedAt: now, lastUsedAt: now });
  }

  get(userId: string): Buffer | undefined {
    const entry = this.map.get(userId);
    if (!entry) return undefined;
    const env = getEnv();
    const now = Date.now();
    if (now - entry.loadedAt > env.KEY_CACHE_HARD_MIN * 60_000) {
      this.evict(userId);
      return undefined;
    }
    if (now - entry.lastUsedAt > env.KEY_CACHE_IDLE_MIN * 60_000) {
      this.evict(userId);
      return undefined;
    }
    entry.lastUsedAt = now;
    return entry.dek;
  }

  evict(userId: string) {
    const entry = this.map.get(userId);
    if (entry) {
      entry.dek.fill(0);
      this.map.delete(userId);
    }
  }

  private sweep() {
    for (const userId of this.map.keys()) {
      this.get(userId);
    }
  }

  size() {
    return this.map.size;
  }
}

export const keyCache = new KeyCache();
