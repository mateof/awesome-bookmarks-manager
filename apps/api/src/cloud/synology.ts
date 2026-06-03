import type { Readable } from "node:stream";
import { createClient, type WebDAVClient } from "webdav";
import type { CloudProvider, FileMeta, StoredCredentials } from "./types.js";

export interface SynologyAuth {
  url: string;
  username: string;
  password: string;
}

function buildClient(auth: SynologyAuth): WebDAVClient {
  return createClient(auth.url, {
    username: auth.username,
    password: auth.password,
  });
}

/** Probe credentials by calling PROPFIND on `/`. Returns a short status message. */
export async function testSynologyConnection(
  auth: SynologyAuth,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  try {
    const client = buildClient(auth);
    // getDirectoryContents on `/` is the most reliable PROPFIND test;
    // some Synology setups disallow listing the absolute root, so fall back
    // to "exists('/')" when listing fails.
    try {
      await client.getDirectoryContents("/", { deep: false });
      return { ok: true, message: "Conexión correcta" };
    } catch {
      const exists = await client.exists("/").catch(() => false);
      if (exists) return { ok: true, message: "Conexión correcta (exists)" };
      throw new Error("No se pudo listar el raíz");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: prettyDavError(msg) };
  }
}

export interface DirListError extends Error {
  /** HTTP status code from the WebDAV response, if known. */
  status?: number;
}

/** List immediate child directories of `path`. Returns names + absolute paths. */
export async function listSynologyDirectories(
  auth: SynologyAuth,
  path: string,
  timeoutMs = 10_000,
): Promise<Array<{ name: string; path: string }>> {
  const client = buildClient(auth);
  const target = path || "/";
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const entries = (await client.getDirectoryContents(target, {
      deep: false,
      signal: ac.signal,
    })) as Array<{
      filename: string;
      basename: string;
      type: string;
    }>;
    return entries
      .filter((e) => e.type === "directory")
      .map((e) => ({ name: e.basename, path: e.filename }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    const e = err as { status?: number; response?: { status?: number }; message?: string; name?: string };
    const status = e?.status ?? e?.response?.status;
    const wrapped: DirListError = new Error(
      ac.signal.aborted
        ? `Timeout (${timeoutMs}ms) tras ${timeoutMs / 1000}s sin respuesta del servidor`
        : e?.message ?? String(err),
    );
    wrapped.name = e?.name ?? "DirListError";
    if (typeof status === "number") wrapped.status = status;
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}

/** Create a directory (recursive). Used by the folder picker's "new folder" UX. */
export async function createSynologyDirectory(
  auth: SynologyAuth,
  path: string,
): Promise<void> {
  const client = buildClient(auth);
  await client.createDirectory(path, { recursive: true });
}

function prettyDavError(raw: string): string {
  if (raw.includes("401")) return "Credenciales incorrectas (401)";
  if (raw.includes("403")) return "Acceso denegado (403) — revisa permisos del usuario";
  if (raw.includes("404")) return "Servidor inaccesible (404)";
  if (raw.includes("ECONNREFUSED")) return "Conexión rechazada — ¿servicio WebDAV activo?";
  if (raw.includes("ENOTFOUND")) return "Host no encontrado — revisa la URL";
  if (raw.includes("self signed") || raw.includes("UNABLE_TO_VERIFY")) {
    return "Certificado TLS no válido (autofirmado)";
  }
  if (raw.includes("ETIMEDOUT")) return "Timeout — el servidor no responde";
  return raw.slice(0, 200);
}

export class SynologyWebDAVProvider implements CloudProvider {
  readonly id = "synology_webdav" as const;
  private readonly client: WebDAVClient;
  private readonly basePath: string;

  constructor(creds: Extract<StoredCredentials, { kind: "synology_webdav" }>) {
    this.client = createClient(creds.url, {
      username: creds.username,
      password: creds.password,
    });
    this.basePath = creds.basePath.replace(/\/$/, "");
  }

  private full(path: string) {
    return `${this.basePath}/${path.replace(/^\//, "")}`;
  }

  async upload(path: string, stream: Readable): Promise<void> {
    await this.ensureDir(this.basePath);
    const target = this.full(path);
    const dir = target.split("/").slice(0, -1).join("/");
    await this.ensureDir(dir);
    await this.client.putFileContents(target, stream as unknown as Buffer, {
      overwrite: true,
    });
  }

  async download(path: string): Promise<Readable> {
    const stream = this.client.createReadStream(this.full(path));
    return stream as unknown as Readable;
  }

  async list(prefix: string): Promise<FileMeta[]> {
    const dir = this.full(prefix);
    const entries = (await this.client.getDirectoryContents(dir, {
      deep: false,
    })) as Array<{
      filename: string;
      basename: string;
      size: number;
      lastmod: string;
      type: string;
    }>;
    return entries
      .filter((e) => e.type === "file")
      .map((e) => ({
        path: e.filename.replace(`${this.basePath}/`, ""),
        name: e.basename,
        size: e.size,
        modifiedAt: e.lastmod,
      }))
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  async delete(path: string): Promise<void> {
    await this.client.deleteFile(this.full(path));
  }

  private async ensureDir(path: string): Promise<void> {
    if (!path || path === "/") return;
    const exists = await this.client.exists(path).catch(() => false);
    if (exists) return;
    const parent = path.split("/").slice(0, -1).join("/");
    if (parent && parent !== this.basePath) await this.ensureDir(parent);
    await this.client.createDirectory(path, { recursive: true }).catch(() => {});
  }
}
