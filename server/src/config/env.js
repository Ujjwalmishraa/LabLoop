import "dotenv/config";
import { z } from "zod";

// All configuration comes from the environment. Invalid config stops the process at boot.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5050),
  MONGO_URI: z.string().default("mongodb://127.0.0.1:27017/nidaansetu"),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  PUBLIC_API_URL: z.string().default("http://localhost:5000"),

  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  // "none" is needed when web and API are on different sites (e.g. Netlify + Render)
  COOKIE_SAMESITE: z.enum(["strict", "lax", "none"]).default("lax"),

  STORAGE_DRIVER: z.enum(["local", "s3", "cloudinary"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("storage/private"),
  FILE_URL_SECRET: z.string().min(32).optional(),
  OTP_SECRET: z.string().min(32).optional(),
  SIGNED_URL_TTL_SEC: z.coerce.number().default(600),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  CLOUDINARY_URL: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("LabLoop <no-reply@nidaansetu.in>"),

  // Routing for the collector's ETA. Optional: without a key the free OSRM demo is used, then a
  // straight-line estimate. ROUTING_OFFLINE=true skips the network entirely (no-internet demos).
  ORS_API_KEY: z.string().optional(),
  ROUTING_OFFLINE: z.enum(["true", "false"]).default("false"),

  RATE_LIMIT_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  SETTLEMENT_CRON: z.string().default("0 6 * * 1"),
  CRON_ENABLED: z.enum(["true", "false"]).default("true"),
  TZ_NAME: z.string().default("Asia/Kolkata"),
});

// Blank lines like "JWT_ACCESS_SECRET=" (as in .env.example) mean "not set", not "empty string".
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
const parsed = schema.safeParse(raw);
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  process.exit(1);
}

const e = parsed.data;
const isProd = e.NODE_ENV === "production";
const isTest = e.NODE_ENV === "test";

// Secrets are required in production. Dev/test get throwaway values so the app boots locally.
for (const key of ["JWT_ACCESS_SECRET", "FILE_URL_SECRET", "OTP_SECRET"]) {
  if (!e[key]) {
    if (isProd) {
      console.error(`${key} is required in production (min 32 chars)`);
      process.exit(1);
    }
    e[key] = `dev-only-${key}-not-for-production-use-0000`;
  }
}
if (isProd && e.BCRYPT_COST < 12) {
  console.error("BCRYPT_COST must be at least 12 in production");
  process.exit(1);
}

export const env = {
  ...e,
  isProd,
  isTest,
  rateLimitEnabled: e.RATE_LIMIT_ENABLED ?? !isTest,
  cronEnabled: e.CRON_ENABLED === "true" && !isTest,
};
