import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../auth/session.js";
import { enqueue } from "../jobs/queue.js";
import { importArchive } from "../exports/archive.js";
import { BadRequest } from "../util/errors.js";

const MAX_IMPORT_BYTES = 32 * 1024 * 1024; // 32 MB
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const importRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Import an `.abz` into a chosen folder.
   *
   * Runs inline rather than as a job: unlike the HTML importer this does not
   * fetch anything from the network, so it finishes in the request and the
   * user gets a real count back instead of a job id to go and watch.
   */
  app.post("/import/archive", async (req) => {
    const ctx = requireAuth(req);
    if (!req.isMultipart()) throw BadRequest("multipart/form-data expected");

    let bytes: Buffer | null = null;
    let parentId: string | null = null;
    let passphrase: string | undefined;

    for await (const part of req.parts()) {
      if (part.type === "file") {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of part.file) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buf.length;
          if (size > MAX_IMPORT_BYTES) throw BadRequest("Archivo demasiado grande");
          chunks.push(buf);
        }
        bytes = Buffer.concat(chunks);
        continue;
      }
      const value = String(part.value ?? "");
      if (part.fieldname === "parentId") {
        parentId = UUID_RE.test(value) ? value : null;
      } else if (part.fieldname === "passphrase" && value) {
        passphrase = value;
      }
    }

    if (!bytes) throw BadRequest("Falta el archivo");
    return importArchive(ctx, bytes, { parentId, passphrase });
  });

  app.post("/import/html", async (req) => {
    const ctx = requireAuth(req);
    if (!req.isMultipart()) throw BadRequest("multipart/form-data expected");

    let html: string | null = null;
    // Defaults off: see the note on the import form. A caller has to ask.
    let fetchSnapshots = false;
    let parentId: string | null = null;
    let wrapperFolderName: string | undefined;

    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "file") {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of part.file) {
          const buf = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk as Uint8Array);
          chunks.push(buf);
          size += buf.length;
          if (size > MAX_IMPORT_BYTES) throw BadRequest("file too large");
        }
        html = Buffer.concat(chunks).toString("utf8");
      } else if (part.type === "field") {
        const v = String(part.value);
        switch (part.fieldname) {
          case "fetchSnapshots":
            fetchSnapshots =
              v.toLowerCase() === "true" ||
              v === "1" ||
              v.toLowerCase() === "yes";
            break;
          case "parentId":
            if (v && UUID_RE.test(v)) parentId = v;
            break;
          case "wrapperFolderName": {
            const trimmed = v.trim();
            if (trimmed.length > 0) {
              if (trimmed.length > 256) throw BadRequest("wrapper name too long");
              wrapperFolderName = trimmed;
            }
            break;
          }
        }
      }
    }

    if (!html) throw BadRequest("file part missing");

    const jobId = enqueue({
      userId: ctx.userId,
      type: "import",
      payload: { html, fetchSnapshots, parentId, wrapperFolderName },
    });
    return { jobId };
  });
};
