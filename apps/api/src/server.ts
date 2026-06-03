import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { adminRoutes } from "./admin/routes.js";
import { authRoutes } from "./auth/routes.js";
import { keyCache } from "./auth/key-cache.js";
import { registerSession } from "./auth/session.js";
import { bookmarkRoutes } from "./bookmarks/routes.js";
import { snapshotRoutes } from "./bookmarks/snapshot-routes.js";
import { cloudRoutes } from "./cloud/routes.js";
import { groupRoutes } from "./groups/routes.js";
import { ensureSchema } from "./db/bootstrap.js";
import { closeDb, getDb } from "./db/client.js";
import { getEnv } from "./env.js";
import { exportRoutes } from "./exports/routes.js";
import { extensionRoutes } from "./extension/routes.js";
import { folderRoutes } from "./folders/routes.js";
import { iconRoutes } from "./icons/routes.js";
import { importRoutes } from "./imports/routes.js";
import { jobRoutes } from "./jobs/routes.js";
import { reawakenForUser } from "./jobs/queue.js";
import { startWorker, stopWorker } from "./jobs/worker.js";
import { refreshBackupSchedules, stopScheduler } from "./scheduler.js";
import { searchRoutes } from "./search/routes.js";
import { shareRoutes } from "./shares/routes.js";
import { tagRoutes } from "./tags/routes.js";
import { AppError } from "./util/errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where the SPA build lives. Defaults to /app/public inside the production
 * Docker image (set there via ENV). In dev there is no build — Vite serves
 * the web app on :3000 and we just skip static serving here.
 */
function resolvePublicDir(): string | null {
  const envDir = process.env.PUBLIC_DIR;
  if (envDir && existsSync(envDir)) return envDir;
  // Sibling guess: when running from apps/api/dist/server.js, check
  // /app/public (image layout) and ../../web/dist (monorepo layout).
  const candidates = [
    "/app/public",
    path.resolve(__dirname, "../../web/dist"),
    path.resolve(__dirname, "../public"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export async function buildServer() {
  const env = getEnv();
  const app = Fastify({
    logger: { level: env.NODE_ENV === "production" ? "info" : "debug" },
    bodyLimit: 64 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  });
  await app.register(cookie);
  await registerSession(app);
  await app.register(multipart, {
    limits: { fileSize: 64 * 1024 * 1024 },
  });
  await app.register(rateLimit, {
    global: false,
    max: 60,
    timeWindow: "1 minute",
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      reply.code(err.statusCode).send({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof ZodError) {
      reply
        .code(400)
        .send({ error: "Invalid request", code: "validation", details: err.issues });
      return;
    }
    req.log.error(err);
    reply.code(500).send({ error: "Internal error", code: "internal" });
  });

  // /health stays at root so HEALTHCHECK can hit it without auth or prefix.
  app.get("/health", async () => ({ ok: true }));

  // Re-arm any deferred jobs whenever the user authenticates successfully.
  app.addHook("onResponse", async (req) => {
    if (
      req.url.startsWith("/api/auth/login") ||
      req.url.startsWith("/api/auth/signup")
    ) {
      const userId = req.session.get("userId");
      if (userId) reawakenForUser(userId);
    }
  });

  // All backend routes live under /api so the same Fastify instance can
  // also serve the SPA from / without route collisions.
  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(folderRoutes);
      await api.register(bookmarkRoutes);
      await api.register(snapshotRoutes);
      await api.register(iconRoutes);
      await api.register(tagRoutes);
      await api.register(searchRoutes);
      await api.register(importRoutes);
      await api.register(exportRoutes);
      await api.register(cloudRoutes);
      await api.register(shareRoutes);
      await api.register(groupRoutes);
      await api.register(extensionRoutes);
      await api.register(adminRoutes);
      await api.register(jobRoutes);
    },
    { prefix: "/api" },
  );

  // Serve the SPA build (production / single-container mode). Dev skips
  // this because Vite owns :3000.
  const publicDir = resolvePublicDir();
  if (publicDir) {
    app.log.info({ publicDir }, "serving SPA from disk");
    await app.register(fastifyStatic, {
      root: publicDir,
      wildcard: false,
    });

    // SPA fallback: any non-/api, non-/health, non-asset request gets
    // index.html so client-side routing can take over.
    app.setNotFoundHandler((req, reply) => {
      const url = req.url;
      if (url.startsWith("/api/") || url === "/health") {
        return reply
          .code(404)
          .send({ error: "Not found", code: "not_found" });
      }
      return reply.type("text/html").sendFile("index.html");
    });
  }

  return app;
}

async function start() {
  const env = getEnv();
  // ensure DB exists & schema is up-to-date before anything else touches it
  getDb();
  ensureSchema();

  const app = await buildServer();

  startWorker();
  refreshBackupSchedules();
  keyCache.start();

  const close = async () => {
    app.log.info("shutting down");
    await app.close();
    await stopWorker();
    stopScheduler();
    keyCache.stop();
    closeDb();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);

  await app.listen({ host: "0.0.0.0", port: env.API_PORT });
  printListeningBanner(env.API_PORT);
}

function printListeningBanner(port: number) {
  const lines: string[] = [
    "",
    "  AwesomeBookmarks API",
    `  ➜  Local:    http://localhost:${port}/`,
  ];
  for (const [, addrs] of Object.entries(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        lines.push(`  ➜  Network:  http://${addr.address}:${port}/`);
      }
    }
  }
  lines.push("");
  console.log(lines.join("\n"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
