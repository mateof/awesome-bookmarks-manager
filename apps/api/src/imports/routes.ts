import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../auth/session.js";
import { enqueue } from "../jobs/queue.js";
import { BadRequest } from "../util/errors.js";

const MAX_IMPORT_BYTES = 32 * 1024 * 1024; // 32 MB
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const importRoutes: FastifyPluginAsync = async (app) => {
  app.post("/import/html", async (req) => {
    const ctx = requireAuth(req);
    if (!req.isMultipart()) throw BadRequest("multipart/form-data expected");

    let html: string | null = null;
    let fetchSnapshots = true;
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
