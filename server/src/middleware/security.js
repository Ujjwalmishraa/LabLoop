import { translateError } from "../lib/i18n.js";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env.js";

// Remove keys that MongoDB would read as operators ($gt, $where) or paths (a.b).
// Runs on body and params; query values are only ever read through zod schemas.
function clean(value, depth = 0) {
  if (depth > 10) return undefined;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  if (value && typeof value === "object" && !(value instanceof Buffer)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith("$") || k.includes(".") || k === "__proto__" || k === "constructor") continue;
      out[k] = clean(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function sanitize(req, _res, next) {
  if (req.body && typeof req.body === "object") req.body = clean(req.body);
  next();
}

function limiter({ windowMin, max, message, ...extra }) {
  return rateLimit({
    ...extra,
    windowMs: windowMin * 60 * 1000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => !env.rateLimitEnabled,
    handler: (req, res) => res.status(429).json({ error: { code: "RATE_LIMITED", message: translateError(req.lang || "hi", "RATE_LIMITED", message) } }),
  });
}

const wait = "Bahut zyada koshish ho gayi. Thodi der baad dobara karein.";
// Only failed logins count, and per account + IP: correct logins never get blocked, and one
// person's wrong passwords don't lock out everyone else on the same network (shared clinic Wi-Fi).
export const loginLimiter = limiter({
  windowMin: 15,
  max: 10,
  message: "Bahut baar galat password daala gaya. 15 minute baad dobara koshish karein ya 'Password bhool gaye' use karein.",
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.identifier ?? "").trim().toLowerCase()}`,
});
export const signupLimiter = limiter({ windowMin: 60, max: 10, message: wait });
export const forgotLimiter = limiter({ windowMin: 60, max: 5, message: wait });
export const otpLimiter = limiter({ windowMin: 15, max: 30, message: wait });
export const apiLimiter = limiter({ windowMin: 1, max: 300, message: wait });
