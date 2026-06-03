import type { JobType } from "@awesome-bookmarks/shared";
import { keyCache } from "../auth/key-cache.js";
import { getEnv } from "../env.js";
import { runBackupJob } from "./handlers/backup.js";
import { runFaviconJob } from "./handlers/favicon.js";
import { runGroupShareSealJob } from "./handlers/group_share_seal.js";
import { runImportJob } from "./handlers/import.js";
import { runShareSealJob } from "./handlers/share_seal.js";
import {
  closeBrowser,
  markSnapshotError,
  runSnapshotJob,
} from "./handlers/snapshot.js";
import {
  type ClaimedJob,
  claimNext,
  complete,
  deferForUserKey,
  fail,
  failTerminal,
} from "./queue.js";

let stopped = false;
let activeJobs = 0;
let pollTimer: NodeJS.Timeout | null = null;

export function startWorker() {
  if (pollTimer) return;
  stopped = false;
  pollTimer = setInterval(() => {
    void tick();
  }, 1000);
  if (typeof pollTimer.unref === "function") pollTimer.unref();
}

export async function stopWorker() {
  stopped = true;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  await closeBrowser();
}

async function tick() {
  if (stopped) return;
  const concurrency = getEnv().SNAPSHOT_CONCURRENCY;
  while (activeJobs < concurrency) {
    const job = claimNext();
    if (!job) return;
    activeJobs++;
    void runOne(job).finally(() => {
      activeJobs--;
    });
  }
}

/**
 * Errors that won't recover with a retry. We mark the job as `error` directly
 * to avoid wasting Playwright + queue capacity on URLs that simply aren't
 * reachable from the server (intranet without VPN, broken hosts, dead certs).
 */
const TERMINAL_PATTERNS = [
  "ERR_NAME_NOT_RESOLVED",
  "ERR_CONNECTION_REFUSED",
  "ERR_CONNECTION_RESET",
  "ERR_CONNECTION_CLOSED",
  "ERR_ADDRESS_UNREACHABLE",
  "ERR_INVALID_URL",
  "ERR_BLOCKED_BY_CLIENT",
  "ERR_CERT_AUTHORITY_INVALID",
  "ERR_CERT_COMMON_NAME_INVALID",
  "ERR_CERT_DATE_INVALID",
  "ERR_SSL_PROTOCOL_ERROR",
  "ENOTFOUND",
  "ECONNREFUSED",
];

function isTerminalError(msg: string): boolean {
  return TERMINAL_PATTERNS.some((p) => msg.includes(p));
}

/** Translate raw browser errors into something the user can act on. */
function friendlyMessage(raw: string): string {
  if (raw.includes("ERR_NAME_NOT_RESOLVED") || raw.includes("ENOTFOUND")) {
    return "Host no resoluble — ¿requiere VPN o es una URL interna?";
  }
  if (raw.includes("ERR_CONNECTION_REFUSED") || raw.includes("ECONNREFUSED")) {
    return "Conexión rechazada por el servidor";
  }
  if (raw.includes("ERR_CONNECTION_RESET")) return "Conexión cerrada por el servidor";
  if (raw.includes("ERR_ADDRESS_UNREACHABLE")) return "Dirección inaccesible";
  if (raw.includes("ERR_CERT_")) return "Certificado TLS inválido";
  if (raw.includes("ERR_SSL_PROTOCOL_ERROR")) return "Error de protocolo TLS";
  if (raw.includes("ERR_INVALID_URL")) return "URL inválida";
  if (raw.includes("Timeout") || raw.includes("timeout")) {
    return "Timeout: la página tarda demasiado en cargar";
  }
  // Take just the first line to avoid pasting Playwright's giant call log.
  const firstLine = raw.split("\n")[0]?.trim() ?? raw;
  return firstLine.slice(0, 240);
}

async function runOne(job: ClaimedJob) {
  try {
    await dispatch(job);
    complete(job.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("DEK not in cache")) {
      deferForUserKey(job.id);
      return;
    }
    const terminal = isTerminalError(msg);
    const human = friendlyMessage(msg);

    // Keep the full stack in stderr for operators; the user-facing message
    // and the jobs table get the friendly summary.
    console.error(
      `[worker] job ${job.type} ${job.id} (attempt ${job.attempts}) ${
        terminal ? "TERMINAL" : "transient"
      } error:`,
      err instanceof Error ? err.stack ?? err.message : err,
    );
    if (job.type === "snapshot") {
      const payload = job.payload as { bookmarkId?: string };
      if (payload.bookmarkId) markSnapshotError(payload.bookmarkId, human);
    }
    if (terminal) {
      failTerminal(job.id, human);
    } else {
      fail(job.id, human);
    }
  }
}

async function dispatch(job: ClaimedJob): Promise<void> {
  const type = job.type as JobType;
  switch (type) {
    case "snapshot": {
      const dek = keyCache.get(job.userId);
      if (!dek) throw new Error("DEK not in cache");
      await runSnapshotJob(job.userId, dek, job.payload as { bookmarkId: string });
      return;
    }
    case "favicon": {
      const dek = keyCache.get(job.userId);
      if (!dek) throw new Error("DEK not in cache");
      await runFaviconJob(job.userId, dek, job.payload as { bookmarkId: string });
      return;
    }
    case "import": {
      const dek = keyCache.get(job.userId);
      if (!dek) throw new Error("DEK not in cache");
      await runImportJob(job.userId, dek, job.payload as { html: string });
      return;
    }
    case "share_seal": {
      const dek = keyCache.get(job.userId);
      if (!dek) throw new Error("DEK not in cache");
      await runShareSealJob(job.userId, dek, job.payload as { shareId: string });
      return;
    }
    case "group_share_seal": {
      const dek = keyCache.get(job.userId);
      if (!dek) throw new Error("DEK not in cache");
      await runGroupShareSealJob(
        job.userId,
        dek,
        job.payload as { groupShareId: string },
      );
      return;
    }
    case "backup": {
      await runBackupJob(job.userId, job.payload as { connectionId: string });
      return;
    }
  }
}
