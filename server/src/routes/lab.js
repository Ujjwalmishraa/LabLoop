import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { Booking, LabTest, Lab, Settlement, Village } from "../models/index.js";
import { guard } from "../middleware/auth.js";
import { validate, idParams } from "../middleware/validate.js";
import { otpLimiter } from "../middleware/security.js";
import { listQuery, paginate } from "../lib/paginate.js";
import { transition, verifyOtp } from "../services/bookings.js";
import { computeB2b } from "../services/pricing.js";
import { audit, pick } from "../lib/audit.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { getStorage } from "../lib/storage/index.js";
import { randomToken } from "../lib/crypto.js";
import { financeRange, financeMatch, labFinanceSummary, financeLedger } from "../services/finance.js";
import { getRoute, mapsLink, latLng } from "../services/route.js";

const router = Router();
router.use(...guard("lab_staff"));

const LAB_POPULATE = [
  { path: "village", select: "name block" },
  { path: "patient", select: "name phone" },
  { path: "referredBy", select: "name" },
];

// Lab staff never see the OTP or our margin.
export function labBookingView(b) {
  const o = b.toJSON();
  delete o.platformMargin;
  delete o.otpAttempts;
  if (o.report) o.report = { name: o.report.name, mime: o.report.mime, uploadedAt: o.report.uploadedAt };
  return o;
}

async function ownBooking(req) {
  const b = await Booking.findOne({ _id: req.params.id, lab: req.user.lab });
  if (!b) throw notFound("Booking nahi mili");
  return b;
}

async function respond(res, b) {
  await b.populate(LAB_POPULATE);
  res.json(labBookingView(b));
}

router.get(
  "/bookings",
  validate({
    query: listQuery.extend({
      status: z.enum(["requested", "confirmed", "collected", "report_ready", "cancelled"]).optional(),
      date: z.string().max(10).optional(),
      collectionPoint: z.enum(["home", "clinic"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  }),
  async (req, res) => {
    const filter = { lab: req.user.lab };
    if (req.q.status) filter.status = req.q.status;
    if (req.q.collectionPoint) filter.collectionPoint = req.q.collectionPoint;
    if (req.q.date) filter.date = req.q.date;
    const r = await paginate(Booking, filter, req.q, { allowedSort: ["createdAt", "date"], populate: LAB_POPULATE });
    // Tab counts for the panel header
    const counts = await Booking.aggregate([{ $match: { lab: req.user.lab } }, { $group: { _id: "$status", n: { $sum: 1 } } }]);
    res.json({ ...r, data: r.data.map(labBookingView), counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) });
  }
);

// Clinic pickups still to collect, grouped by clinic, so one trip can pick up every sample waiting there.
router.get("/clinic-pickups", async (req, res) => {
  const list = await Booking.find({ lab: req.user.lab, collectionPoint: "clinic", status: { $in: ["requested", "confirmed"] } })
    .sort({ date: 1, createdAt: 1 })
    .populate(LAB_POPULATE);
  const groups = new Map();
  for (const b of list) {
    const key = String(b.clinic?.doctor || b.clinic?.name);
    if (!groups.has(key)) groups.set(key, { clinic: { doctor: b.clinic?.doctor, name: b.clinic?.name, address: b.clinic?.address, location: b.clinic?.location }, waiting: 0, requested: 0, confirmed: 0, bookings: [] });
    const g = groups.get(key);
    g.waiting += 1;
    g[b.status] += 1;
    g.bookings.push(labBookingView(b));
  }
  res.json({ data: [...groups.values()].sort((a, b) => b.waiting - a.waiting) });
});

router.patch(
  "/bookings/:id/confirm",
  validate({ params: idParams, body: z.object({ collectionTime: z.string().trim().min(1, "Collector ka samay chunein").max(40) }) }),
  async (req, res) => {
    const b = await ownBooking(req);
    transition(b, "confirmed", req.user._id, `Collector ${req.body.collectionTime} aayega`);
    b.collectionTime = req.body.collectionTime;
    await b.save();
    await audit(req, { action: "booking.confirm", entityType: "Booking", entityId: b._id, before: { status: "requested" }, after: { status: "confirmed", collectionTime: b.collectionTime } });
    await respond(res, b);
  }
);

router.patch(
  "/bookings/:id/reject",
  validate({ params: idParams, body: z.object({ reason: z.string().trim().max(200).optional() }) }),
  async (req, res) => {
    const b = await ownBooking(req);
    const before = b.status;
    transition(b, "cancelled", req.user._id, req.body.reason || "Lab ne mana kiya");
    await b.save();
    await audit(req, { action: "booking.reject", entityType: "Booking", entityId: b._id, before: { status: before }, after: { status: "cancelled", reason: req.body.reason } });
    await respond(res, b);
  }
);

router.patch(
  "/bookings/:id/collect",
  otpLimiter,
  validate({
    params: idParams,
    body: z.object({ otp: z.string().regex(/^\d{4}$/, "4 ank ka OTP daalein"), paymentMode: z.enum(["cash", "upi"]).optional() }),
  }),
  async (req, res) => {
    const b = await ownBooking(req);
    if (b.status !== "confirmed") throw conflict("Pehle booking confirm karein", "INVALID_TRANSITION");
    await verifyOtp(b, req.body.otp);
    transition(b, "collected", req.user._id, "Sample le liya gaya (OTP sahi)");
    b.collectedAt = new Date();
    if (req.body.paymentMode) b.payment.mode = req.body.paymentMode;
    b.payment.status = "paid";
    await b.save();
    await audit(req, { action: "booking.collect", entityType: "Booking", entityId: b._id, before: { status: "confirmed" }, after: { status: "collected", payment: b.payment } });
    await respond(res, b);
  }
);

// ---------- route + ETA ----------
// Origin: the collector's live position if they shared it, else the lab. Destination: the clinic for
// clinic pickups; for home, the pin the patient shared, else their village.
const fromQuery = z.object({
  fromLat: z.coerce.number().min(-90).max(90).optional(),
  fromLng: z.coerce.number().min(-180).max(180).optional(),
});

async function tripFor(req, b, from) {
  let to = b.collectionPoint === "clinic" ? latLng(b.clinic?.location) : latLng(b.location);
  if (!to && b.village) to = latLng((await Village.findById(b.village).select("location"))?.location);
  let origin = from?.fromLat !== undefined && from?.fromLng !== undefined ? { lat: from.fromLat, lng: from.fromLng } : null;
  if (!origin) origin = latLng((await Lab.findById(req.user.lab).select("location"))?.location);
  if (!to || !origin) throw notFound("Raasta nahi mila", "NO_ROUTE");
  const route = await getRoute({ from: origin, to });
  return { ...route, from: origin, to, originIsLab: !from?.fromLat, mapsUrl: mapsLink(origin, to) };
}

router.get("/bookings/:id/route", validate({ params: idParams, query: fromQuery }), async (req, res) => {
  const b = await ownBooking(req);
  res.json(await tripFor(req, b, req.q));
});

// "I'm leaving now": stores the ETA once; the booking stays "confirmed" (no new status).
router.patch("/bookings/:id/depart", validate({ params: idParams, body: fromQuery }), async (req, res) => {
  const b = await ownBooking(req);
  if (b.status !== "confirmed") throw conflict("Sirf confirm booking ke liye nikal sakte hain", "NOT_DEPARTABLE");
  if (b.departedAt) throw conflict("Collector pehle hi nikal chuka hai", "ALREADY_DEPARTED");
  const trip = await tripFor(req, b, req.body);
  const now = new Date();
  b.departedAt = now;
  b.eta = { minutes: trip.durationMin, at: new Date(now.getTime() + trip.durationMin * 60000), approximate: trip.approximate, distanceKm: trip.distanceKm };
  b.history.push({ status: b.status, at: now, by: req.user._id, note: "Collector left / कलेक्टर निकल गया" });
  await b.save();
  await audit(req, { action: "booking.depart", entityType: "Booking", entityId: b._id, after: { departedAt: now, eta: b.eta } });
  await respond(res, b);
});

// Reports: PDF/JPG/PNG, max 5 MB, kept in memory only until written to private storage.
const ALLOWED = {
  "application/pdf": { ext: "pdf", magic: (b) => b.subarray(0, 4).toString() === "%PDF" },
  "image/png": { ext: "png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (ALLOWED[file.mimetype] ? cb(null, true) : cb(badRequest("Sirf PDF, JPG ya PNG file daalein", "BAD_FILE_TYPE"))),
});

router.post("/bookings/:id/report", validate({ params: idParams }), upload.single("report"), async (req, res) => {
  const b = await ownBooking(req);
  if (b.status !== "collected") throw conflict("Report sirf sample lene ke baad daal sakte hain", "INVALID_TRANSITION");
  if (!req.file) throw badRequest("Report file chunein", "NO_FILE");
  const kind = ALLOWED[req.file.mimetype];
  // Check the actual bytes, not just the browser-supplied type.
  if (!kind.magic(req.file.buffer)) throw badRequest("File kharab hai ya PDF/JPG/PNG nahi hai", "BAD_FILE_TYPE");

  const key = `reports/${b.lab}/${b.code}-${randomToken(8)}.${kind.ext}`;
  await (await getStorage()).put({ key, buffer: req.file.buffer, mime: req.file.mimetype });
  const name = req.file.originalname.replace(/[^\w.\- ]/g, "_").slice(0, 100) || `report.${kind.ext}`;
  b.report = { key, name, mime: req.file.mimetype, size: req.file.size, uploadedAt: new Date() };
  transition(b, "report_ready", req.user._id, "Report upload hui");
  await b.save();
  await audit(req, { action: "booking.report_upload", entityType: "Booking", entityId: b._id, before: { status: "collected" }, after: { status: "report_ready", report: { name, size: req.file.size } } });
  await respond(res, b);
});

router.get("/settlements", validate({ query: listQuery }), async (req, res) => {
  res.json(await paginate(Settlement, { lab: req.user.lab }, req.q, { allowedSort: ["weekStart"], defaultSort: { weekStart: -1 }, select: "-bookings" }));
});

// The lab's own ledger: same numbers the admin sees, so both sides know who pays whom.
router.get("/finance", validate({ query: financeRange }), async (req, res) => {
  const { range, match } = financeMatch(req.q);
  const [lab, totals, data, pending] = await Promise.all([
    Lab.findById(req.user.lab).select("name commissionPercent collectionFee freeCollectionAbove"),
    labFinanceSummary(req.user.lab, match),
    financeLedger(req.user.lab, match),
    Settlement.find({ lab: req.user.lab, status: "pending" }).select("netPayable"),
  ]);
  if (!lab) throw notFound("Lab nahi mila");
  // Weekly settlements already made but not yet paid, across all time.
  const pendingSettlements = { count: pending.length, net: pending.reduce((s, x) => s + (x.netPayable || 0), 0) };
  res.json({ range, lab, totals, data, pendingSettlements });
});

// ---------- price list ----------
router.get("/tests", validate({ query: z.object({ q: z.string().trim().max(60).optional() }) }), async (req, res) => {
  const filter = { lab: req.user.lab };
  if (req.q.q) filter.name = new RegExp(req.q.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const [lab, data] = await Promise.all([
    Lab.findById(req.user.lab).select("name commissionPercent collectionFee freeCollectionAbove minOrderValue"),
    LabTest.find(filter).sort({ name: 1 }).collation({ locale: "en" }),
  ]);
  res.json({ lab, data });
});

// Lab can change its own walk-in rate, the patient price and availability.
router.patch(
  "/tests/:id",
  validate({
    params: idParams,
    body: z
      .object({
        walkInPrice: z.coerce.number().int().min(1).max(100000).optional(),
        listingPrice: z.coerce.number().int().min(1).max(100000).optional(),
        active: z.boolean().optional(),
        fastingRequired: z.boolean().optional(),
        reportTimeHours: z.coerce.number().int().min(1).max(720).optional(),
      })
      .refine((o) => Object.keys(o).length > 0, "Kuch badlav bhejein"),
  }),
  async (req, res) => {
    const t = await LabTest.findOne({ _id: req.params.id, lab: req.user.lab });
    if (!t) throw notFound("Test nahi mila");
    const lab = await Lab.findById(req.user.lab).select("commissionPercent");
    const FIELDS = ["walkInPrice", "listingPrice", "b2bPrice", "active", "fastingRequired", "reportTimeHours"];
    const before = pick(t, FIELDS);
    const { walkInPrice, listingPrice } = req.body;
    Object.assign(t, req.body);
    if (walkInPrice !== undefined) {
      if (!t.b2bOverridden) t.b2bPrice = computeB2b(walkInPrice, lab.commissionPercent);
      // If the patient price tracked the walk-in price, keep it in step.
      if (listingPrice === undefined && before.listingPrice === before.walkInPrice) t.listingPrice = walkInPrice;
    }
    if (t.listingPrice < t.b2bPrice) throw badRequest(`Patient rate ₹${t.b2bPrice} (B2B) se kam nahi ho sakta`, "PRICE_TOO_LOW");
    await t.save();
    await audit(req, { action: "labtest.update", entityType: "LabTest", entityId: t._id, before, after: pick(t, FIELDS) });
    res.json(t);
  }
);

export default router;
