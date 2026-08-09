import * as esbuild from "esbuild";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

const watch = process.argv.includes("--watch");

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const base = JSON.parse(readFileSync("public/manifest.json", "utf8"));
base.version = pkg.version;

// Chrome + Opera (both Chromium/MV3): background is a service worker. The code
// is bundled as an IIFE, so it needs no `type: module`.
const chromeManifest = {
  ...base,
  background: { service_worker: "background.js" },
};

// Firefox (MV3): uses an event-page background (scripts) and requires an
// add-on id under browser_specific_settings.
const firefoxManifest = {
  ...base,
  background: { scripts: ["background.js"] },
  browser_specific_settings: {
    gecko: { id: "awesomebookmarks@mateof", strict_min_version: "121.0" },
  },
};

const entryPoints = ["src/popup.ts", "src/options.ts", "src/background.ts"];
const buildOpts = {
  entryPoints,
  bundle: true,
  format: "iife",
  target: "chrome120",
  sourcemap: true,
  logLevel: "info",
};

/** Copy the static assets in public/ except the manifest (we write per-target). */
function copyAssets(dir) {
  cpSync("public", dir, {
    recursive: true,
    filter: (src) => !src.endsWith("manifest.json"),
  });
}

async function buildTarget(dir, manifest) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await esbuild.build({ ...buildOpts, outdir: dir });
  copyAssets(dir);
  writeFileSync(`${dir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (watch) {
  // Dev loads the Chromium build from dist/; watch just that target.
  mkdirSync("dist", { recursive: true });
  copyAssets("dist");
  writeFileSync(
    "dist/manifest.json",
    `${JSON.stringify(chromeManifest, null, 2)}\n`,
  );
  const ctx = await esbuild.context({ ...buildOpts, outdir: "dist" });
  await ctx.watch();
  console.log("watching extension sources… (dist/, Chromium)");
} else {
  await buildTarget("dist", chromeManifest); // Chrome + Opera
  await buildTarget("dist-firefox", firefoxManifest); // Firefox
  console.log("built dist/ (Chrome/Opera) and dist-firefox/ (Firefox)");
}
