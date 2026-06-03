import * as esbuild from "esbuild";
import { copyFileSync, cpSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");
const outdir = "dist";

mkdirSync(outdir, { recursive: true });

const ctx = await esbuild.context({
  entryPoints: [
    "src/popup.ts",
    "src/options.ts",
    "src/background.ts",
  ],
  bundle: true,
  format: "iife",
  target: "chrome120",
  outdir,
  sourcemap: true,
  logLevel: "info",
});

cpSync("public", outdir, { recursive: true });

if (watch) {
  await ctx.watch();
  console.log("watching extension sources…");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
