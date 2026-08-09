import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Build the two artifacts the E2E run serves/loads: the web SPA (the API
 * serves it from apps/web/dist) and the unpacked Chrome extension (Playwright
 * loads it from apps/extension/dist). Runs before every `playwright test` via
 * the npm scripts. Set SKIP_BUILD=1 to reuse existing builds while iterating.
 */
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

if (process.env.SKIP_BUILD) {
  console.log("SKIP_BUILD set — reusing existing web + extension builds.");
  process.exit(0);
}

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd: REPO_ROOT, stdio: "inherit" });
}

// The `...` suffix builds the package plus its workspace dependencies in order.
run("pnpm --filter @awesome-bookmarks/web... run build");
run("pnpm --filter @awesome-bookmarks/extension... run build");
console.log("\n✓ web + extension built");
