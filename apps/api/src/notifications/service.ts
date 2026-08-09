/**
 * In-memory, per-user Server-Sent Events fan-out for instant in-app
 * notifications (group invitations, auto-joins). Best-effort: only delivered
 * to currently-connected clients. The durable state (pending invitations,
 * group memberships) lives in the DB, so an offline user still sees the
 * invitation in their list on next load.
 */
interface Client {
  write: (chunk: string) => void;
}

const clients = new Map<string, Set<Client>>();

export function registerClient(userId: string, client: Client): () => void {
  let set = clients.get(userId);
  if (!set) {
    set = new Set();
    clients.set(userId, set);
  }
  set.add(client);
  return () => {
    const s = clients.get(userId);
    if (!s) return;
    s.delete(client);
    if (s.size === 0) clients.delete(userId);
  };
}

export interface Notification {
  type: "invitation" | "joined";
  groupId: string;
  groupName: string;
  invitedByEmail?: string;
}

export function pushNotification(userId: string, n: Notification): void {
  const set = clients.get(userId);
  if (!set) return;
  const payload = `data: ${JSON.stringify(n)}\n\n`;
  for (const c of set) {
    try {
      c.write(payload);
    } catch {
      /* dead connection; cleaned up on the socket 'close' event */
    }
  }
}
