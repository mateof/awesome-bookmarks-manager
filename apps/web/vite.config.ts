import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * The release the SPA was built from, baked in at build time.
 *
 * Read from the monorepo's root package.json, which is the one version that is
 * bumped per release, so the footer cannot drift from the image it shipped in.
 */
const version = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"),
).version as string;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    proxy: {
      // Forward `/api/*` straight to the Fastify server. Routes there are
      // registered under the `/api` prefix, so no path rewrite.
      "/api": {
        target: process.env.VITE_API_URL ?? "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
