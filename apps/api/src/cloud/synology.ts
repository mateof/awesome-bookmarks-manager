import type { Readable } from "node:stream";
import { createClient, type WebDAVClient } from "webdav";
import { agentFor } from "./tls.js";
import type { CloudProvider, FileMeta, StoredCredentials } from "./types.js";

export interface SynologyAuth {
  url: string;
  username: string;
  password: string;
  /**
   * Fingerprint of a certificate the user accepted explicitly. Without one the
   * connection keeps standard verification, so a properly-signed server is
   * unaffected by any of this.
   */
  certFingerprint?: string;
}

function buildClient(auth: SynologyAuth): WebDAVClient {
  return createClient(auth.url, {
    username: auth.username,
    password: auth.password,
    httpsAgent: agentFor(auth.certFingerprint),
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
    } catch (listErr) {
      const exists = await client.exists("/").catch(() => false);
      if (exists) return { ok: true, message: "Conexión correcta (exists)" };
      // Re-throw the original failure rather than a generic one. Swallowing it
      // turned every TLS problem into "no se pudo listar el raíz", which tells
      // the user nothing and hides the one thing they can act on.
      throw listErr instanceof Error
        ? listErr
        : new Error("No se pudo listar el raíz");
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

/**
 * Create a directory and any missing parent, tolerating the ones that are
 * already there.
 *
 * The library's own `recursive: true` issues MKCOL for every ancestor and
 * throws on the first that already exists, because Synology answers 405 for
 * that. Since the common case is "the share exists, the subfolder does not",
 * that made creating a folder fail almost always. Doing it a segment at a time
 * and checking the outcome is both more predictable and gives a usable error.
 */
export async function ensureDirectory(
  client: WebDAVClient,
  path: string,
): Promise<void> {
  const clean = path.replace(/\/+$/, "");
  if (!clean || clean === "/") return;

  const segments = clean.split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current += `/${segment}`;
    if (await client.exists(current).catch(() => false)) continue;
    try {
      await client.createDirectory(current);
    } catch (err) {
      // 405/409/301 all mean "it is already a collection" on one server or
      // another. Only a genuinely absent directory is an error.
      if (!(await client.exists(current).catch(() => false))) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`No se pudo crear "${current}": ${prettyDavError(msg)}`);
      }
    }
  }
}

/** Create a directory (recursive). Used by the folder picker's "new folder" UX. */
export async function createSynologyDirectory(
  auth: SynologyAuth,
  path: string,
): Promise<void> {
  await ensureDirectory(buildClient(auth), path);
}

function prettyDavError(raw: string): string {
  if (raw.includes("401")) return "Credenciales incorrectas (401)";
  if (raw.includes("403")) return "Acceso denegado (403) — revisa permisos del usuario";
  if (raw.includes("404")) return "Servidor inaccesible (404)";
  if (raw.includes("ECONNREFUSED")) return "Conexión rechazada — ¿servicio WebDAV activo?";
  if (raw.includes("ENOTFOUND")) return "Host no encontrado — revisa la URL";
  if (raw.includes("PINNED_CERT_MISMATCH")) {
    return (
      "El certificado del servidor ha cambiado y no coincide con el aceptado. " +
      "Vuelve a aceptarlo si lo has renovado tú."
    );
  }
  if (
    raw.includes("self signed") ||
    raw.includes("self-signed") ||
    raw.includes("UNABLE_TO_VERIFY") ||
    raw.includes("ALTNAME")
  ) {
    return (
      "Certificado no verificable (autofirmado o emitido para otro nombre). " +
      "Puedes revisarlo y aceptarlo desde el formulario."
    );
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
      httpsAgent: agentFor(creds.certFingerprint),
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

  /**
   * Files in the vault whose name starts with `prefix`.
   *
   * `prefix` filters the *file name*; it is not a subdirectory. The previous
   * version resolved it as a path and asked the server for the contents of
   * "<base>/awesome-bookmarks-", which of course does not exist, so listing
   * always failed. Nothing called this until the vault screen existed, so the
   * bug sat here unnoticed.
   */
  async list(prefix: string): Promise<FileMeta[]> {
    const entries = (await this.client.getDirectoryContents(this.basePath, {
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
      .filter((e) => !prefix || e.basename.startsWith(prefix))
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
    // Shared with the folder picker so both behave the same. It used to
    // swallow every failure, which is why a broken destination surfaced much
    // later as a confusing upload error instead of a clear one here.
    await ensureDirectory(this.client, path);
  }
}
