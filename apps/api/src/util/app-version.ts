import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The product version, the one the release tags and the Docker image use.
 *
 * In the container it arrives as APP_VERSION, baked in by the Dockerfile from
 * a build argument. In a source checkout it is read from the workspace root
 * package.json, walking up because the API runs from apps/api. The API's own
 * package.json is not it: that one is an internal workspace version.
 */
function resolve(): string {
  const fromEnv = process.env.APP_VERSION?.trim();
  if (fromEnv) return fromEnv;

  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      // The root is the only package.json with the workspace declaration.
      if (pkg.workspaces || pkg.name === "awesome-bookmarks") return pkg.version ?? "unknown";
    } catch {
      // Keep walking: not every level has a package.json.
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "unknown";
}

export const APP_VERSION = resolve();
