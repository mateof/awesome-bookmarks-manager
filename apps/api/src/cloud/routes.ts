import {
  ConnectSynologyBodySchema,
  CreateSynologyDirBodySchema,
  ListSynologyDirsBodySchema,
  SynologyCredentialsSchema,
  UpdateConnectionBodySchema,
} from "@awesome-bookmarks/shared";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { randomBytes } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { requireAuth } from "../auth/session.js";
import { getDb } from "../db/client.js";
import { cloudConnections } from "../db/schema.js";
import { getEnv } from "../env.js";
import { enqueue } from "../jobs/queue.js";
import { AppError, BadRequest, NotFound } from "../util/errors.js";
import { GDRIVE_SCOPES, gdriveOAuthClient } from "./gdrive.js";
import { ONEDRIVE_SCOPES } from "./onedrive.js";
import { packCredentials } from "./registry.js";
import {
  createSynologyDirectory,
  listSynologyDirectories,
  testSynologyConnection,
} from "./synology.js";

declare module "@fastify/secure-session" {
  interface SessionData {
    oauthState?: string;
    oauthLabel?: string;
  }
}

const IdParam = z.object({ id: z.string().uuid() });

function summary(row: typeof cloudConnections.$inferSelect) {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    backupScheduleCron: row.backupScheduleCron,
    lastBackupAt: row.lastBackupAt,
    lastStatus: row.lastStatus,
    createdAt: row.createdAt,
  };
}

export const cloudRoutes: FastifyPluginAsync = async (app) => {
  app.get("/cloud/connections", async (req) => {
    const ctx = requireAuth(req);
    return getDb()
      .select()
      .from(cloudConnections)
      .where(eq(cloudConnections.userId, ctx.userId))
      .all()
      .map(summary);
  });

  // Probe credentials before saving — body carries url/username/password
  // and is never persisted. Auth required so an attacker can't pivot us into
  // an arbitrary internal WebDAV scanner.
  app.post(
    "/cloud/synology/test",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req) => {
      requireAuth(req);
      const body = SynologyCredentialsSchema.parse(req.body);
      return testSynologyConnection(body);
    },
  );

  app.post(
    "/cloud/synology/list-dirs",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      requireAuth(req);
      const body = ListSynologyDirsBodySchema.parse(req.body);
      try {
        const entries = await listSynologyDirectories(body, body.path);
        return { entries };
      } catch (err) {
        const e = err as { status?: number; message?: string };
        const status = e.status;
        const raw = e.message ?? String(err);
        req.log.warn(
          { status, path: body.path, message: raw },
          "synology list-dirs failed",
        );
        // 404/405 on a sub-path means it doesn't exist yet (Synology often
        // returns 405 instead of 404). Distinguish from 405 on root which
        // means the user has no access to list shares.
        if ((status === 404 || status === 405) && body.path !== "/") {
          throw new AppError(
            404,
            "path_missing",
            `La ruta "${body.path}" no existe en el servidor. Crea la carpeta o vuelve a la raíz.`,
          );
        }
        if (status === 401) {
          throw new AppError(
            401,
            "unauthorized",
            "Credenciales rechazadas (401). Comprueba usuario y contraseña.",
          );
        }
        if (status === 403 || (status === 405 && body.path === "/")) {
          throw new AppError(
            403,
            "forbidden",
            "Acceso denegado al listar (403/405 en raíz). Probablemente el usuario no tiene WebDAV habilitado en sus aplicaciones, o no tiene permiso sobre la carpeta. Prueba con una ruta concreta de una carpeta compartida (p.ej. /home).",
          );
        }
        if (raw.toLowerCase().includes("timeout") || raw.toLowerCase().includes("aborted")) {
          throw new AppError(
            504,
            "timeout",
            `${raw}. Comprueba la URL/puerto, el firewall del NAS y que el WebDAV server esté activo.`,
          );
        }
        if (raw.includes("ECONNREFUSED")) {
          throw new AppError(
            502,
            "refused",
            "Conexión rechazada — el WebDAV server no está escuchando en ese puerto.",
          );
        }
        if (raw.includes("ENOTFOUND")) {
          throw new AppError(
            502,
            "host_not_found",
            "Host no encontrado — revisa la URL.",
          );
        }
        if (raw.includes("self signed") || raw.includes("UNABLE_TO_VERIFY")) {
          throw new AppError(
            502,
            "tls_error",
            "Certificado TLS no válido (autofirmado). Usa HTTPS con cert válido o HTTP en LAN.",
          );
        }
        throw BadRequest(`No se pudo listar "${body.path}": ${raw.slice(0, 200)}`);
      }
    },
  );

  app.post(
    "/cloud/synology/create-dir",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req) => {
      requireAuth(req);
      const body = CreateSynologyDirBodySchema.parse(req.body);
      try {
        await createSynologyDirectory(body, body.path);
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw BadRequest(`No se pudo crear "${body.path}": ${msg.slice(0, 200)}`);
      }
    },
  );

  app.post("/cloud/connect/synology", async (req, reply) => {
    const ctx = requireAuth(req);
    const body = ConnectSynologyBodySchema.parse(req.body);
    const id = uuidv4();
    const blob = packCredentials(ctx.dek, ctx.userId, {
      kind: "synology_webdav",
      url: body.url,
      username: body.username,
      password: body.password,
      basePath: body.basePath,
    });
    getDb()
      .insert(cloudConnections)
      .values({
        id,
        userId: ctx.userId,
        provider: "synology_webdav",
        label: body.label,
        credentialsCt: blob,
      })
      .run();
    reply.code(201);
    return { id, provider: "synology_webdav" as const, label: body.label };
  });

  app.get("/cloud/connect/gdrive", async (req, reply) => {
    requireAuth(req); // ensure logged in; OAuth state held in session
    const env = getEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
      throw BadRequest("Google OAuth not configured");
    }
    const state = randomBytes(16).toString("base64url");
    req.session.set("oauthState", state);
    const oauth = gdriveOAuthClient();
    const url = oauth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GDRIVE_SCOPES,
      state,
    });
    reply.redirect(url);
  });

  app.get("/cloud/connect/gdrive/callback", async (req, reply) => {
    const ctx = requireAuth(req);
    const Q = z.object({ code: z.string(), state: z.string() }).parse(req.query);
    const expected = req.session.get("oauthState");
    if (!expected || expected !== Q.state) throw BadRequest("Invalid OAuth state");
    req.session.set("oauthState", undefined);
    const oauth = gdriveOAuthClient();
    const { tokens } = await oauth.getToken(Q.code);
    if (!tokens.refresh_token) {
      throw BadRequest("Google did not return a refresh_token; revoke and retry with prompt=consent");
    }
    const id = uuidv4();
    const blob = packCredentials(ctx.dek, ctx.userId, {
      kind: "gdrive",
      accessToken: tokens.access_token ?? "",
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date ?? Date.now() + 3600_000,
    });
    getDb()
      .insert(cloudConnections)
      .values({
        id,
        userId: ctx.userId,
        provider: "gdrive",
        label: "Google Drive",
        credentialsCt: blob,
      })
      .run();
    reply.redirect(`${getEnv().CORS_ORIGIN}/settings/cloud?connected=gdrive`);
  });

  app.get("/cloud/connect/onedrive", async (req, reply) => {
    requireAuth(req);
    const env = getEnv();
    if (!env.MS_CLIENT_ID || !env.MS_REDIRECT_URI) {
      throw BadRequest("Microsoft OAuth not configured");
    }
    const state = randomBytes(16).toString("base64url");
    req.session.set("oauthState", state);
    const params = new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      response_type: "code",
      redirect_uri: env.MS_REDIRECT_URI,
      response_mode: "query",
      scope: ONEDRIVE_SCOPES.join(" "),
      state,
    });
    reply.redirect(
      `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`,
    );
  });

  app.get("/cloud/connect/onedrive/callback", async (req, reply) => {
    const ctx = requireAuth(req);
    const Q = z.object({ code: z.string(), state: z.string() }).parse(req.query);
    const expected = req.session.get("oauthState");
    if (!expected || expected !== Q.state) throw BadRequest("Invalid OAuth state");
    req.session.set("oauthState", undefined);

    const env = getEnv();
    const tokenRes = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.MS_CLIENT_ID ?? "",
          client_secret: env.MS_CLIENT_SECRET ?? "",
          grant_type: "authorization_code",
          code: Q.code,
          redirect_uri: env.MS_REDIRECT_URI ?? "",
        }).toString(),
      },
    );
    if (!tokenRes.ok) throw BadRequest("Microsoft token exchange failed");
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    const id = uuidv4();
    const blob = packCredentials(ctx.dek, ctx.userId, {
      kind: "onedrive",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: Date.now() + tokens.expires_in * 1000,
    });
    getDb()
      .insert(cloudConnections)
      .values({
        id,
        userId: ctx.userId,
        provider: "onedrive",
        label: "OneDrive",
        credentialsCt: blob,
      })
      .run();
    reply.redirect(`${env.CORS_ORIGIN}/settings/cloud?connected=onedrive`);
  });

  app.patch("/cloud/connections/:id", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const body = UpdateConnectionBodySchema.parse(req.body);
    const row = getDb()
      .select()
      .from(cloudConnections)
      .where(eq(cloudConnections.id, id))
      .get();
    if (!row || row.userId !== ctx.userId) throw NotFound("Connection not found");
    const update: Record<string, unknown> = {};
    if (body.label !== undefined) update.label = body.label;
    if (body.backupScheduleCron !== undefined) {
      update.backupScheduleCron = body.backupScheduleCron;
    }
    if (Object.keys(update).length > 0) {
      getDb().update(cloudConnections).set(update).where(eq(cloudConnections.id, id)).run();
    }
    return { ok: true };
  });

  app.delete("/cloud/connections/:id", async (req, reply) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const row = getDb()
      .select({ id: cloudConnections.id, userId: cloudConnections.userId })
      .from(cloudConnections)
      .where(eq(cloudConnections.id, id))
      .get();
    if (!row || row.userId !== ctx.userId) throw NotFound("Connection not found");
    getDb().delete(cloudConnections).where(eq(cloudConnections.id, id)).run();
    reply.code(204);
  });

  app.post("/cloud/connections/:id/backup", async (req) => {
    const ctx = requireAuth(req);
    const { id } = IdParam.parse(req.params);
    const row = getDb()
      .select({ id: cloudConnections.id, userId: cloudConnections.userId })
      .from(cloudConnections)
      .where(eq(cloudConnections.id, id))
      .get();
    if (!row || row.userId !== ctx.userId) throw NotFound("Connection not found");
    const jobId = enqueue({
      userId: ctx.userId,
      type: "backup",
      payload: { connectionId: id },
    });
    return { jobId };
  });
};
