import { z } from "zod";
import mongoose from "mongoose";
import { badRequest } from "../lib/errors.js";
import { translateIssue, fieldName } from "../lib/i18n.js";

export const objectId = z.string().refine((v) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(v), {
  message: "Galat ID",
});

// Validates and replaces req.body / req.params, and puts the parsed query on req.q
// (Express 5 makes req.query read-only). Unknown keys are stripped by zod.
export function validate({ body, query, params }) {
  return (req, _res, next) => {
    try {
      const lang = req.lang || "hi";
      if (params) req.params = parse(params, req.params, lang);
      if (query) req.q = parse(query, req.query, lang);
      if (body) {
        // Kept so PATCH handlers can tell "not sent" apart from a schema default.
        req.rawBody = req.body ?? {};
        req.body = parse(body, req.body ?? {}, lang);
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

// Messages are translated here (details[].path is unchanged), so the error handler passes them through.
function parse(schema, data, lang) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const details = r.error.issues.map((i) => ({ path: i.path.join("."), message: translateIssue(lang, i) }));
    const first = r.error.issues[0];
    const field = first.path.length ? fieldName(lang, String(first.path[first.path.length - 1])) : "";
    throw badRequest(field ? `${field}: ${details[0].message}` : details[0].message, "VALIDATION_ERROR", details);
  }
  return r.data;
}

export const idParams = z.object({ id: objectId });
