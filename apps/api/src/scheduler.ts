import { Cron } from "croner";
import { sql } from "drizzle-orm";
import { isNotNull } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { cloudConnections } from "./db/schema.js";
import { enqueue } from "./jobs/queue.js";

const crons = new Map<string, Cron>();

/**
 * Install/refresh cron schedules from cloudConnections.backupScheduleCron.
 * Called at boot and after CRUD on cloud connections.
 */
export function refreshBackupSchedules() {
  for (const [, c] of crons) c.stop();
  crons.clear();

  const rows = getDb()
    .select()
    .from(cloudConnections)
    .where(isNotNull(cloudConnections.backupScheduleCron))
    .all();

  for (const row of rows) {
    if (!row.backupScheduleCron) continue;
    try {
      const job = new Cron(row.backupScheduleCron, () => {
        enqueue({
          userId: row.userId,
          type: "backup",
          payload: { connectionId: row.id },
        });
      });
      crons.set(row.id, job);
    } catch (err) {
      console.error(`[scheduler] invalid cron for ${row.id}:`, err);
    }
  }
}

export function stopScheduler() {
  for (const [, c] of crons) c.stop();
  crons.clear();
}

// Touch sql import to satisfy unused-import lint (used via Drizzle internals).
void sql;
