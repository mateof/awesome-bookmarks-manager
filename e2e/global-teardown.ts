import { rm } from "node:fs/promises";
import { DATA_DIR } from "./fixtures/config.js";

/** Drop the ephemeral test DB + blobs once the run finishes. */
export default async function globalTeardown() {
  await rm(DATA_DIR, { recursive: true, force: true });
}
