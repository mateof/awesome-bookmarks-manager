import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../auth/session.js";
import { registerClient } from "./service.js";

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  // SSE stream of this user's notifications. EventSource sends the session
  // cookie automatically (same origin), so this is session-authenticated.
  app.get("/notifications/stream", async (req, reply) => {
    const ctx = requireAuth(req);
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx) so events arrive instantly.
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(": connected\n\n");

    const unregister = registerClient(ctx.userId, {
      write: (chunk) => reply.raw.write(chunk),
    });
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(": ping\n\n");
      } catch {
        /* ignore */
      }
    }, 25_000);

    req.raw.on("close", () => {
      clearInterval(heartbeat);
      unregister();
    });
  });
};
