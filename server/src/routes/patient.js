import { Router } from "express";
import { z } from "zod";
import { Booking, Appointment, FamilyMember, Village } from "../models/index.js";
import { env } from "../config/env.js";
import { guard } from "../middleware/auth.js";
import { validate, objectId, idParams } from "../middleware/validate.js";
import { listQuery, paginate } from "../lib/paginate.js";
import { createBooking, transition, BOOKING_POPULATE } from "../services/bookings.js";
import { takeToken, APPT_POPULATE, patientApptView } from "../services/appointments.js";
import { deriveOtp } from "../lib/crypto.js";
import { todayIso } from "../lib/dates.js";
import { audit, pick } from "../lib/audit.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { getStorage } from "../lib/storage/index.js";
import { meView, nameSchema, emailSchema, langSchema } from "./auth.js";

const router = Router();
const patientOnly = guard("patient");

// What the patient sees of their own booking: no hashes, no internal finance; OTP only until collection.
export function patientBookingView(b) {
  const o = b.toJSON();
  delete o.labPayout;
  delete o.platformMargin;
  delete o.otpAttempts;
  delete o.settlement;
  o.items = (o.items || []).map(({ b2bPrice: _b, ...i }) => i);
  if (["requested", "confirmed"].includes(b.status) && !b.otpLocked) o.otp = deriveOtp(b.code);
  if (o.report) o.report = { name: o.report.name, mime: o.report.mime, uploadedAt: o.report.uploadedAt };
  return o;
}

// ---------- profile ----------
router.patch(
  "/me",
  ...patientOnly,
  validate({ body: z.object({ name: nameSchema.optional(), email: emailSchema.optional(), villageId: objectId.optional(), lang: langSchema.optional() }) }),
  async (req, res) => {
    const user = req.user;
    const before = pick(user, ["name", "email", "village", "lang"]);
    if (req.body.villageId) {
      if (!(await Village.exists({ _id: req.body.villageId }))) throw notFound("Gaon nahi mila", "VILLAGE_NOT_FOUND");
      user.village = req.body.villageId;
    }
    if (req.body.name) user.name = req.body.name;
    if (req.body.email) user.email = req.body.email;
    if (req.body.lang) Object.assign(user, { lang: req.body.lang, langChosen: true });
    await user.save();
    await audit(req, { action: "user.update_profile", entityType: "User", entityId: user._id, before, after: pick(user, ["name", "email", "village", "lang"]) });
    res.json({ user: await meView(user) });
  }
);

// ---------- family ----------
const familyBody = z.object({
  name: nameSchema,
  age: z.coerce.number().int().min(0).max(120).optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  relation: z.string().trim().max(40).optional(),
});

router.get("/me/family", ...patientOnly, async (req, res) => {
  const data = await FamilyMember.find({ owner: req.user._id }).sort({ createdAt: 1 });
  res.json({ data, meta: { page: 1, limit: data.length, total: data.length, pages: 1 } });
});

router.post("/me/family", ...patientOnly, validate({ body: familyBody }), async (req, res) => {
  if ((await FamilyMember.countDocuments({ owner: req.user._id })) >= 20) throw badRequest("Zyada se zyada 20 sadasya jod sakte hain");
  const m = await FamilyMember.create({ ...req.body, owner: req.user._id });
  await audit(req, { action: "family.create", entityType: "FamilyMember", entityId: m._id, after: pick(m, ["name", "age", "relation"]) });
  res.status(201).json(m);
});

router.patch("/me/family/:id", ...patientOnly, validate({ params: idParams, body: familyBody.partial() }), async (req, res) => {
  const m = await FamilyMember.findOne({ _id: req.params.id, owner: req.user._id });
  if (!m) throw notFound("Sadasya nahi mila");
  const before = pick(m, ["name", "age", "gender", "relation"]);
  Object.assign(m, req.body);
  await m.save();
  await audit(req, { action: "family.update", entityType: "FamilyMember", entityId: m._id, before, after: pick(m, ["name", "age", "gender", "relation"]) });
  res.json(m);
});

router.delete("/me/family/:id", ...patientOnly, validate({ params: idParams }), async (req, res) => {
  const m = await FamilyMember.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
  if (!m) throw notFound("Sadasya nahi mila");
  await audit(req, { action: "family.delete", entityType: "FamilyMember", entityId: m._id, before: pick(m, ["name", "age", "relation"]) });
  res.json({ ok: true });
});

// ---------- test bookings ----------
// Only test IDs are accepted. Any price the client sends is stripped by the schema.
router.post(
  "/bookings",
  ...patientOnly,
  validate({
    body: z.object({
      labId: objectId,
      testIds: z.array(objectId).min(1, "Kam se kam ek test chunein").max(30),
      villageId: objectId.optional(),
      familyMemberId: objectId.optional(),
      address: z.string().trim().min(3, "Ghar ka pata likhein").max(200),
      date: z.string().max(10),
      slot: z.string().trim().min(1).max(40),
      paymentMode: z.enum(["cash", "upi"]).default("cash"),
      consent: z.literal(true, { message: "Report dekhne ki anumati par tick karein" }),
    }),
  }),
  async (req, res) => {
    const villageId = req.body.villageId || req.user.village;
    if (!villageId) throw badRequest("Pehle apna gaon chunein", "NO_VILLAGE");
    const { booking } = await createBooking(req, { ...req.body, villageId, patient: req.user });
    await booking.populate(BOOKING_POPULATE);
    res.status(201).json(patientBookingView(booking));
  }
);

router.get(
  "/me/bookings",
  ...patientOnly,
  validate({ query: listQuery.extend({ status: z.enum(["requested", "confirmed", "collected", "report_ready", "cancelled"]).optional() }) }),
  async (req, res) => {
    const filter = { patient: req.user._id };
    if (req.q.status) filter.status = req.q.status;
    const r = await paginate(Booking, filter, req.q, { allowedSort: ["createdAt", "date"], populate: BOOKING_POPULATE });
    res.json({ ...r, data: r.data.map(patientBookingView) });
  }
);

router.post(
  "/bookings/:id/cancel",
  ...patientOnly,
  validate({ params: idParams, body: z.object({ reason: z.string().trim().max(200).optional() }) }),
  async (req, res) => {
    const b = await Booking.findOne({ _id: req.params.id, patient: req.user._id });
    if (!b) throw notFound("Booking nahi mili");
    if (!["requested", "confirmed"].includes(b.status)) throw conflict("Sample lene ke baad booking cancel nahi ho sakti", "INVALID_TRANSITION");
    const before = b.status;
    transition(b, "cancelled", req.user._id, req.body.reason || "Patient ne cancel kiya");
    await b.save();
    await audit(req, { action: "booking.cancel", entityType: "Booking", entityId: b._id, before: { status: before }, after: { status: b.status } });
    await b.populate(BOOKING_POPULATE);
    res.json(patientBookingView(b));
  }
);

// Report access: the patient, staff of the booking's lab, the referring doctor (with consent),
// and super admin. Everyone else gets 404.
router.get("/bookings/:id/report", ...guard("patient", "lab_staff", "doctor", "super_admin"), validate({ params: idParams }), async (req, res) => {
  const filter = { _id: req.params.id };
  const u = req.user;
  if (u.role === "patient") filter.patient = u._id;
  else if (u.role === "lab_staff") filter.lab = u.lab;
  else if (u.role === "doctor") {
    filter.referredBy = u.doctor ?? null;
    filter.consent = true;
  }
  const b = await Booking.findOne(filter);
  if (!b || !b.report?.key) throw notFound("Report nahi mili", "REPORT_NOT_FOUND");
  const storage = await getStorage();
  const url = await storage.signedUrl({ key: b.report.key, name: b.report.name, mime: b.report.mime });
  await audit(req, { action: "report.view", entityType: "Booking", entityId: b._id });
  res.json({ url, name: b.report.name, mime: b.report.mime, expiresInSec: env.SIGNED_URL_TTL_SEC });
});

// ---------- doctor tokens ----------
router.post(
  "/appointments",
  ...patientOnly,
  validate({ body: z.object({ doctorId: objectId, date: z.string().max(10), familyMemberId: objectId.optional(), villageId: objectId.optional() }) }),
  async (req, res) => {
    const appt = await takeToken(req, { ...req.body, patient: req.user });
    await appt.populate(APPT_POPULATE);
    res.status(201).json(patientApptView(appt));
  }
);

router.get(
  "/me/appointments",
  ...patientOnly,
  validate({ query: listQuery.extend({ upcoming: z.enum(["true", "false"]).optional() }) }),
  async (req, res) => {
    const filter = { patient: req.user._id };
    if (req.q.upcoming === "true") filter.date = { $gte: todayIso() };
    const r = await paginate(Appointment, filter, req.q, { allowedSort: ["createdAt", "date"], populate: APPT_POPULATE });
    res.json({ ...r, data: r.data.map(patientApptView) });
  }
);

router.post("/appointments/:id/cancel", ...patientOnly, validate({ params: idParams }), async (req, res) => {
  const a = await Appointment.findOne({ _id: req.params.id, patient: req.user._id });
  if (!a) throw notFound("Number nahi mila");
  if (a.status !== "booked") throw conflict("Yeh number ab cancel nahi ho sakta", "INVALID_TRANSITION");
  if (a.date < todayIso()) throw conflict("Purana number cancel nahi ho sakta", "INVALID_TRANSITION");
  a.status = "cancelled";
  await a.save();
  await audit(req, { action: "appointment.cancel", entityType: "Appointment", entityId: a._id, before: { status: "booked" }, after: { status: "cancelled" } });
  await a.populate(APPT_POPULATE);
  res.json(patientApptView(a));
});

export default router;
