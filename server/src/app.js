import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { sanitize, apiLimiter } from "./middleware/security.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { langMiddleware } from "./lib/i18n.js";
import authRoutes from "./routes/auth.js";
import publicRoutes from "./routes/public.js";
import patientRoutes from "./routes/patient.js";
import labRoutes from "./routes/lab.js";
import doctorRoutes from "./routes/doctor.js";
import agentRoutes from "./routes/agent.js";
import adminRoutes from "./routes/admin.js";
import fileRoutes from "./routes/files.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.isProd ? 1 : false); // behind Render/Railway/ALB proxy in production

  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  const origins = env.CLIENT_ORIGIN.split(",").map((s) => s.trim());
  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());
  app.use(sanitize);
  app.use(langMiddleware); // req.lang = "hi" | "en" from Accept-Language

  app.get("/api/health", (_req, res) => res.json({ ok: true, app: "LabLoop" }));

  const v1 = express.Router();
  v1.use(apiLimiter);
  v1.use("/auth", authRoutes);
  v1.use("/files", fileRoutes);
  v1.use("/lab", labRoutes);
  v1.use("/doctor", doctorRoutes);
  v1.use("/agent", agentRoutes);
  v1.use("/admin", adminRoutes);
  v1.use("/", publicRoutes);
  v1.use("/", patientRoutes);
  app.use("/api/v1", v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
