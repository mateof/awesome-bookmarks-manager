import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().default(3001),
  DATA_DIR: z.string().default("./data"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3001"),

  MASTER_KEY: z.string().min(1, "MASTER_KEY is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 chars"),

  KEY_CACHE_IDLE_MIN: z.coerce.number().int().default(30),
  KEY_CACHE_HARD_MIN: z.coerce.number().int().default(1440),

  SNAPSHOT_CONCURRENCY: z.coerce.number().int().default(2),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  MS_CLIENT_ID: z.string().optional(),
  MS_CLIENT_SECRET: z.string().optional(),
  MS_REDIRECT_URI: z.string().optional(),
});

export type Env = z.infer<typeof Schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
