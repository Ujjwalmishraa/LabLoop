import multer from "multer";
import { AppError } from "../lib/errors.js";
import { env } from "../config/env.js";
import { translateError } from "../lib/i18n.js";

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: translateError(req.lang, "ROUTE_NOT_FOUND", "Yeh raasta nahi mila") } });
}

// Error codes are stable; the message is translated to the request's language (req.lang, from Accept-Language).
export function errorHandler(err, req, res, _next) {
  const tr = (code, message) => translateError(req.lang || "hi", code, message);
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: tr(err.code, err.message), details: err.details } });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? tr("FILE_TOO_LARGE", "File 5 MB se badi hai") : tr("UPLOAD_ERROR", "File upload nahi hui");
    return res.status(400).json({ error: { code: "UPLOAD_ERROR", message } });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "BAD_JSON", message: tr("BAD_JSON", "Galat request") } });
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0];
    const message =
      field === "email"
        ? tr("DUPLICATE_EMAIL", "Yeh email pehle se registered hai")
        : field === "phone"
          ? tr("DUPLICATE_PHONE", "Yeh mobile number pehle se registered hai")
          : tr("DUPLICATE", "Yeh pehle se maujood hai");
    return res.status(409).json({ error: { code: "DUPLICATE", message } });
  }
  if (err?.name === "ValidationError" || err?.name === "CastError") {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: tr("VALIDATION_ERROR", err.message) } });
  }
  console.error(err);
  res.status(500).json({
    error: { code: "SERVER_ERROR", message: tr("SERVER_ERROR", "Kuch galat hua, dobara koshish karein"), ...(env.isProd ? {} : { debug: err?.message }) },
  });
}
