import { Router } from "express";
import { z } from "zod";
import { Appointment, Doctor, Booking } from "../models/index.js";
import { DAYS } from "../models/common.js";
import { guard } from "../middleware/auth.js";
import { validate, objectId, idParams } from "../middleware/validate.js";
import { listQuery, paginate } from "../lib/paginate.js";
import { createBooking, BOOKING_POPULATE } from "../services/bookings.js";
import { labsForClinic } from "../services/geo.js";
import { deriveOtp } from "../lib/crypto.js";
import { phoneSchema } from "./auth.js";
import { verifyVisitCode } from "../services/appointments.js";
import { otpLimiter } from "../middleware/security.js";
import { todayIso, addDaysIso } from "../lib/dates.js";
import { audit, pick } from "../lib/audit.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { User } from "../models/index.js";

const router = Router();
router.use(...guard("doctor"));

// Every doctor route is scoped to the Doctor profile linked to the logged-in user.
router.use(async (req, _res, next) => {
  const doctor = await Doctor.findOne({ _id: req.user.doctor, user: req.user._id });
  if (!doctor) throw notFound("Doctor profile nahi mila");
  req.doctor = doctor;
  next();
});

const POP = [
  { path: "patient", select: "name phone" },
  { path: "familyMember", select: "name age relation" },
  { path: "village", select: "name block" },
  { path: "referredBooking", select: "code status items lab total date", populate: { path: "lab", select: "name" } },
];

// Doctors see the patient price only; internal B2B and margin stay hidden.
function apptView(a) {
  const o = a.toJSON();
  delete o.visitAttempts;
  if (o.referredBooking?.items) o.referredBooking.items = o.referredBooking.items.map(({ b2bPrice: _b, ...i }) => i);
  return o;
}

router.get("/profile", (req, res) => res.json(req.doctor));

router.get(
  "/appointments",
  validate({
    query: listQuery.extend({
      date: z.string().max(10).optional(),
      when: z.enum(["today", "upcoming", "past"]).optional(),
      status: z.enum(["booked", "seen", "cancelled", "no_show"]).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
    }),
  }),
  async (req, res) => {
    const filter = { doctor: req.doctor._id };
    const today = todayIso();
    if (req.q.date) filter.date = req.q.date;
    else if (req.q.when === "today") filter.date = today;
    else if (req.q.when === "upcoming") filter.date = { $gt: today };
    else if (req.q.when === "past") filter.date = { $lt: today };
    if (req.q.status) filter.status = req.q.status;
    const r = await paginate(Appointment, filter, req.q, { allowedSort: ["date", "token", "createdAt"], defaultSort: { date: 1, token: 1 }, populate: POP });
    res.json({ ...r, data: r.data.map(apptView) });
  }
);

async function ownAppt(req) {
  const a = await Appointment.findOne({ _id: req.params.id, doctor: req.doctor._id });
  if (!a) throw notFound("Appointment nahi mila");
  return a;
}

async function closeAppt(req, res, to, extra = {}) {
  const a = await ownAppt(req);
  if (a.status !== "booked") throw conflict("Yeh appointment ab badal nahi sakta", "INVALID_TRANSITION");
  if (a.date > todayIso()) throw conflict("Aane wale din ka appointment abhi mark nahi kar sakte", "INVALID_TRANSITION");
  if (to === "seen") await verifyVisitCode(a, req.body.code);
  a.status = to;
  Object.assign(a, extra);
  await a.save();
  await audit(req, { action: `appointment.${to}`, entityType: "Appointment", entityId: a._id, before: { status: "booked" }, after: { status: to } });
  await a.populate(POP);
  res.json(apptView(a));
}

// "Seen" only with the 4-digit code from the patient's receipt, so a visit can't be faked.
router.patch(
  "/appointments/:id/seen",
  otpLimiter,
  validate({ params: idParams, body: z.object({ code: z.string().regex(/^\d{4}$/, "Receipt ka 4 ank ka code daalein") }) }),
  (req, res) => closeAppt(req, res, "seen", { seenAt: new Date() })
);
router.patch("/appointments/:id/no-show", validate({ params: idParams }), (req, res) => closeAppt(req, res, "no_show"));

// Referral = a lab booking created for the appointment's patient, source "doctor".
router.post(
  "/referrals",
  validate({
    body: z.object({
      appointmentId: objectId,
      labId: objectId,
      testIds: z.array(objectId).min(1, "Kam se kam ek test chunein").max(30),
      date: z.string().max(10).optional(),
      address: z.string().trim().max(200).optional(),
    }),
  }),
  async (req, res) => {
    const a = await Appointment.findOne({ _id: req.body.appointmentId, doctor: req.doctor._id });
    if (!a) throw notFound("Appointment nahi mila");
    if (a.status === "cancelled") throw conflict("Cancel hue appointment pe test nahi likh sakte");
    if (a.referredBooking) throw conflict("Is appointment pe test pehle se likha ja chuka hai", "ALREADY_REFERRED");
    const patient = await User.findOne({ _id: a.patient, role: "patient" });
    if (!patient) throw notFound("Mareez nahi mila");
    const villageId = a.village || patient.village;
    if (!villageId) throw badRequest("Mareez ka gaon pata nahi hai", "NO_VILLAGE");
    const today = todayIso();
    const date = req.body.date || (a.date >= today ? addDaysIso(a.date, 1) : addDaysIso(today, 1));
    const { booking } = await createBooking(req, {
      patient,
      familyMemberId: a.familyMember,
      villageId,
      labId: req.body.labId,
      testIds: req.body.testIds,
      date: date > addDaysIso(today, 7) ? addDaysIso(today, 1) : date,
      slot: "lab_decides",
      address: req.body.address || "Lab phone karke pata lega",
      source: "doctor",
      referredBy: req.doctor._id,
      appointment: a._id,
      // The referring doctor is one of "mere doctor" named in the consent text.
      consent: true,
    });
    a.referredBooking = booking._id;
    await a.save();
    await audit(req, { action: "referral.create", entityType: "Appointment", entityId: a._id, after: { referredBooking: booking._id } });
    await booking.populate(BOOKING_POPULATE);
    const o = booking.toJSON();
    delete o.labPayout;
    delete o.platformMargin;
    o.items = o.items.map(({ b2bPrice: _b, ...i }) => i);
    res.status(201).json(o);
  }
);

router.get("/referrals", validate({ query: listQuery }), async (req, res) => {
  const r = await paginate(Booking, { referredBy: req.doctor._id }, req.q, {
    populate: BOOKING_POPULATE,
    select: "-labPayout -platformMargin -otpAttempts -report.key",
  });
  res.json(r);
});

// ---------- sample requests (clinic pickup or home) ----------
// What the doctor sees of a booking they ordered: patient price only, no internal finance.
// The pickup OTP is shown for clinic pickups (the patient is at the clinic, maybe without a phone);
// lab staff never get it.
export function doctorBookingView(b) {
  const o = b.toJSON();
  delete o.labPayout;
  delete o.platformMargin;
  delete o.otpAttempts;
  delete o.settlement;
  o.items = (o.items || []).map(({ b2bPrice: _b, ...i }) => i);
  if (o.report) o.report = { name: o.report.name, mime: o.report.mime, uploadedAt: o.report.uploadedAt };
  if (b.collectionPoint === "clinic" && ["requested", "confirmed"].includes(b.status) && !b.otpLocked) o.otp = deriveOtp(b.code);
  return o;
}

const DOC_BOOKING_POPULATE = [...BOOKING_POPULATE, { path: "patient", select: "name phone" }];

// Labs that collect at this doctor's clinic, nearest first.
router.get("/clinic-labs", async (req, res) => {
  res.json({ data: await labsForClinic(req.doctor), clinic: { name: req.doctor.clinicName, address: req.doctor.clinicAddress } });
});

const walkInSchema = z.object({
  name: z.string().trim().min(2, "Walk-in mareez ka naam likhein").max(80),
  age: z.coerce.number().int().min(0).max(120).optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
});

router.post(
  "/sample-requests",
  validate({
    body: z
      .object({
        appointmentId: objectId.optional(),
        walkIn: walkInSchema.optional(),
        labId: objectId,
        testIds: z.array(objectId).min(1, "Kam se kam ek test chunein").max(30),
        collectionPoint: z.enum(["clinic", "home"]).default("clinic"),
        note: z.string().trim().max(200).optional(),
        address: z.string().trim().max(200).optional(),
        date: z.string().max(10).optional(),
      })
      .refine((o) => Boolean(o.appointmentId) !== Boolean(o.walkIn), { message: "Appointment ya walk-in mareez mein se ek chunein", path: ["appointmentId"] }),
  }),
  async (req, res) => {
    const { appointmentId, walkIn, labId, testIds, collectionPoint, note } = req.body;
    const today = todayIso();
    let a, patient;
    if (appointmentId) {
      // Only this doctor's own appointments; anything else is "not found".
      a = await Appointment.findOne({ _id: appointmentId, doctor: req.doctor._id });
      if (!a) throw notFound("Appointment nahi mila");
      if (a.status === "cancelled") throw conflict("Cancel hue appointment pe test nahi likh sakte");
      if (a.referredBooking) throw conflict("Is appointment pe test pehle se likha ja chuka hai", "ALREADY_REFERRED");
      patient = await User.findOne({ _id: a.patient, role: "patient" });
      if (!patient) throw notFound("Mareez nahi mila");
    }
    const home = collectionPoint === "home";
    if (home && !patient) throw badRequest("Ghar se sample ke liye mareez ka account chahiye", "NEEDS_ACCOUNT");
    const villageId = a?.village || patient?.village;
    if (home && !villageId) throw badRequest("Mareez ka gaon pata nahi hai", "NO_VILLAGE");
    // Clinic: today by default (patient is here now). Home: the day after the visit.
    let date = req.body.date || (home ? addDaysIso(a.date >= today ? a.date : today, 1) : today);
    if (date > addDaysIso(today, 7)) date = addDaysIso(today, 1);

    const { booking } = await createBooking(req, {
      patient,
      familyMemberId: a?.familyMember,
      villageId,
      labId,
      testIds,
      date,
      slot: "lab_decides",
      address: home ? req.body.address || "Lab phone karke pata lega" : undefined,
      source: "doctor",
      referredBy: req.doctor._id,
      appointment: a?._id,
      // The doctor ordered it, so the doctor may see the report.
      consent: true,
      collectionPoint,
      clinicDoctor: home ? undefined : req.doctor,
      walkIn,
      note,
    });
    if (a) {
      a.referredBooking = booking._id;
      await a.save();
    }
    await audit(req, { action: "sample_request.create", entityType: "Booking", entityId: booking._id, after: { collectionPoint, appointment: a?._id, walkIn: Boolean(walkIn) } });
    await booking.populate(DOC_BOOKING_POPULATE);
    res.status(201).json(doctorBookingView(booking));
  }
);


router.get(
  "/sample-requests",
  validate({ query: listQuery.extend({ collectionPoint: z.enum(["clinic", "home"]).optional(), status: z.enum(["requested", "confirmed", "collected", "report_ready", "cancelled"]).optional() }) }),
  async (req, res) => {
    const filter = { referredBy: req.doctor._id };
    if (req.q.collectionPoint) filter.collectionPoint = req.q.collectionPoint;
    if (req.q.status) filter.status = req.q.status;
    const r = await paginate(Booking, filter, req.q, { allowedSort: ["createdAt", "date"], populate: DOC_BOOKING_POPULATE });
    res.json({ ...r, data: r.data.map(doctorBookingView) });
  }
);

// ---------- schedule ----------
export const scheduleSchema = z
  .array(
    z
      .object({
        day: z.enum(DAYS),
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Samay HH:MM mein likhein"),
        end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Samay HH:MM mein likhein"),
        maxTokens: z.coerce.number().int().min(1).max(500),
      })
      .refine((s) => s.start < s.end, "Shuru ka samay khatam se pehle ho")
  )
  .max(7)
  .refine((arr) => new Set(arr.map((s) => s.day)).size === arr.length, "Ek din ek hi baar likhein");

router.get("/schedule", (req, res) => res.json({ schedule: req.doctor.schedule, fee: req.doctor.fee }));

router.patch(
  "/schedule",
  validate({ body: z.object({ schedule: scheduleSchema, fee: z.coerce.number().int().min(0).max(10000).optional() }) }),
  async (req, res) => {
    const d = req.doctor;
    const before = pick(d, ["schedule", "fee"]);
    d.schedule = req.body.schedule;
    if (req.body.fee !== undefined) d.fee = req.body.fee;
    await d.save();
    await audit(req, { action: "doctor.schedule_update", entityType: "Doctor", entityId: d._id, before, after: pick(d, ["schedule", "fee"]) });
    res.json({ schedule: d.schedule, fee: d.fee });
  }
);

export default router;
