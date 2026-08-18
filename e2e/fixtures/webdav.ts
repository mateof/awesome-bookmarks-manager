import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:https";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A small in-memory WebDAV server over HTTPS with a self-signed certificate.
 *
 * Real enough to be worth having: it speaks PROPFIND, MKCOL, PUT and GET, and
 * it answers MKCOL on an existing collection with 405, which is exactly what
 * Synology does and exactly the response that used to make folder creation
 * fail. A mock that just returned success would have hidden that.
 */

export interface FakeDav {
  server: Server;
  url: string;
  fingerprintOf: () => string;
  /** Paths that exist, as "/a/b" for collections and files. */
  dirs: Set<string>;
  files: Map<string, { size: number; body: Buffer }>;
  /** MKCOL calls seen, in order, for asserting the create path. */
  mkcols: string[];
}

export function selfSignedCert(cn = "nas.local") {
  const dir = mkdtempSync(join(tmpdir(), "dav-cert-"));
  execFileSync(
    "openssl",
    [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"),
      "-days", "2", "-subj", `/CN=${cn}`,
    ],
    { stdio: "ignore" },
  );
  return {
    key: readFileSync(join(dir, "k.pem")),
    cert: readFileSync(join(dir, "c.pem")),
  };
}

function xmlEntry(href: string, isDir: boolean, size = 0): string {
  const modified = new Date("2026-08-18T22:33:53Z").toUTCString();
  return `<D:response>
    <D:href>${href}</D:href>
    <D:propstat><D:prop>
      <D:resourcetype>${isDir ? "<D:collection/>" : ""}</D:resourcetype>
      <D:getcontentlength>${size}</D:getcontentlength>
      <D:getlastmodified>${modified}</D:getlastmodified>
      <D:displayname>${href.split("/").filter(Boolean).pop() ?? "/"}</D:displayname>
    </D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
  </D:response>`;
}

export async function startFakeDav(
  creds = selfSignedCert(),
  seed: { dirs?: string[]; files?: Record<string, number> } = {},
): Promise<FakeDav> {
  const dirs = new Set<string>(["/", ...(seed.dirs ?? [])]);
  const files = new Map<string, { size: number; body: Buffer }>();
  for (const [path, size] of Object.entries(seed.files ?? {})) {
    files.set(path, { size, body: Buffer.alloc(size) });
  }
  const mkcols: string[] = [];

  const server = createServer(creds, (req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    const clean = path.length > 1 ? path.replace(/\/$/, "") : "/";

    if (req.method === "PROPFIND") {
      if (!dirs.has(clean)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const prefix = clean === "/" ? "" : clean;
      const children = [
        ...[...dirs].filter(
          (d) => d !== clean && d.startsWith(`${prefix}/`) &&
            !d.slice(prefix.length + 1).includes("/"),
        ).map((d) => xmlEntry(d, true)),
        ...[...files.entries()]
          .filter(
            ([f]) => f.startsWith(`${prefix}/`) &&
              !f.slice(prefix.length + 1).includes("/"),
          )
          .map(([f, meta]) => xmlEntry(f, false, meta.size)),
      ];
      res.writeHead(207, { "content-type": "application/xml; charset=utf-8" });
      res.end(
        `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${
          xmlEntry(clean === "/" ? "/" : clean, true)
        }${children.join("")}</D:multistatus>`,
      );
      return;
    }

    if (req.method === "MKCOL") {
      mkcols.push(clean);
      if (dirs.has(clean)) {
        // What Synology answers, and what broke the library's recursive mode.
        res.writeHead(405);
        res.end();
        return;
      }
      const parent = clean.split("/").slice(0, -1).join("/") || "/";
      if (!dirs.has(parent)) {
        res.writeHead(409);
        res.end();
        return;
      }
      dirs.add(clean);
      res.writeHead(201);
      res.end();
      return;
    }

    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(Buffer.from(c)));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        files.set(clean, { size: body.length, body });
        res.writeHead(201);
        res.end();
      });
      return;
    }

    if (req.method === "GET") {
      const file = files.get(clean);
      if (!file) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "content-length": String(file.size) });
      res.end(file.body);
      return;
    }

    if (req.method === "OPTIONS" || req.method === "HEAD") {
      res.writeHead(200, { dav: "1,2" });
      res.end();
      return;
    }

    res.writeHead(405);
    res.end();
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  return {
    server,
    url: `https://127.0.0.1:${port}`,
    fingerprintOf: () => "",
    dirs,
    files,
    mkcols,
  };
}
