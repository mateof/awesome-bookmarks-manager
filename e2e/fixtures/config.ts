import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root: e2e/fixtures -> e2e -> root. */
export const REPO_ROOT = path.resolve(here, "../..");

/** Everything runs on a single isolated port, mirroring the prod container
 * (the API serves the SPA from disk and exposes /api on the same origin). */
export const PORT = 4310;
export const BASE_URL = `http://localhost:${PORT}`;

export const WEB_DIST = path.join(REPO_ROOT, "apps/web/dist");
export const EXT_DIST = path.join(REPO_ROOT, "apps/extension/dist");
export const DATA_DIR = path.join(REPO_ROOT, "e2e/.data-test");
export const IMAGES_DIR = path.join(REPO_ROOT, "doc/images");

/**
 * Throwaway test secrets. The SQLite DB under DATA_DIR is wiped on every run,
 * so these protect nothing real; hardcoding them keeps runs reproducible with
 * no secret files to manage. MASTER_KEY is 32 random bytes, base64.
 */
export const MASTER_KEY = "ny7OWoXAzcRRijCxSEZ8UPDF+xLTreQNG/PFZOUZW/w=";
export const SESSION_SECRET =
  "SAw4qodDCSQjdYueJSt8f7NNE536+CY3U5OZyxsV7TOoeWq4bH3cUdf8GOgXHWGO";

/** Env handed to the API process by Playwright's webServer. */
export const serverEnv: Record<string, string> = {
  NODE_ENV: "production",
  API_PORT: String(PORT),
  DATA_DIR,
  PUBLIC_DIR: WEB_DIST,
  CORS_ORIGIN: BASE_URL,
  PUBLIC_BASE_URL: BASE_URL,
  MASTER_KEY,
  SESSION_SECRET,
  COOKIE_SECURE: "false",
};

const tsxBin = path.join(REPO_ROOT, "apps/api/node_modules/.bin/tsx");
const apiEntry = path.join(REPO_ROOT, "apps/api/src/server.ts");

/** Wipe the data dir (fresh DB) then boot the API via tsx. darwin/linux shell. */
export const serverCommand = `rm -rf "${DATA_DIR}" && mkdir -p "${DATA_DIR}" && "${tsxBin}" "${apiEntry}"`;
