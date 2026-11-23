import { Router } from "express";
import { z } from "zod";
import { User, Lab, LabTest, Doctor, Village, Booking, Appointment, Settlement, AuditLog } from "../models/index.js";
import { ROLES } from "../models/common.js";
import { guard } from "../middleware/auth.js";
import { validate, objectId, idParams } from "../middleware/validate.js";
import { listQuery, paginate } from "../lib/paginate.js";
import { createStaffUser, setUserStatus, resetUserPassword } from "../services/users.js";
import { generateSettlements } from "../services/settlements.js";
import { istWeekStart, lastWeekRange, todayIso, addDaysIso, isValidIso } from "../lib/dates.js";
import { audit, pick } from "../lib/audit.js";
import { revokeAllForUser } from "../lib/tokens.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { nameSchema, emailSchema, phoneSchema } from "./auth.js";
import { withPriceDefaults } from "../services/pricing.js";
import { financeRange, financeMatch, financeGroupStages, financeLedger, FINANCE_ZERO } from "../services/finance.js";

const router = Router();
router.use(...guard("super_admin"));

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const statusEnum = z.enum(["active", "disabled"]);
const bookingStatus = z.enum(["requested", "confirmed", "collected", "report_ready", "cancelled"]);

// ---------- users ----------
router.get(
  "/users",
  validate({ query: listQuery.extend({ role: z.enum(ROLES).optional(), status: statusEnum.optional(), q: z.string().trim().max(60).optional(), lab: objectId.optional() }) }),
  async (req, res) => {
    const { role, status, q, lab } = req.q;
    const filter = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (lab) filter.lab = lab;
    if (q) {
      const re = new RegExp(escapeRe(q), "i");
      filter.$or = [{ name: re }, { email: re }, { phone: re }];
    }
    res.json(
      await paginate(User, filter, req.q, {
        allowedSort: ["createdAt", "name", "lastLoginAt"],
        populate: [{ path: "lab", select: "name" }, { path: "doctor", select: "name" }, { path: "createdBy", select: "name role" }],
      })
    );
  }
);

// Only agents are created here. Lab staff and doctors are created through the onboarding routes
// (which super admin can also use); super admins only via the CLI script.
router.post(
  "/users",
  validate({ body: z.object({ name: nameSchema, email: emailSchema, phone: phoneSchema.optional(), role: z.literal("agent", { message: "Yahan sirf agent bana sakte hain" }) }) }),
  async (req, res) => {
    const { user, tempPassword } = await createStaffUser(req, req.body);
    res.status(201).json({ user, tempPassword });
  }
);

// Field agents with how much each one has onboarded.
router.get("/agents", async (req, res) => {
  const agents = await User.find({ role: "agent" }).select("name email phone status lastLoginAt createdAt mustChangePassword").sort({ createdAt: -1 }).lean();
  const ids = agents.map((a) => a._id);
  const [labs, doctors] = await Promise.all([
    Lab.aggregate([{ $match: { onboardedBy: { $in: ids } } }, { $group: { _id: "$onboardedBy", n: { $sum: 1 } } }]),
    Doctor.aggregate([{ $match: { onboardedBy: { $in: ids } } }, { $group: { _id: "$onboardedBy", n: { $sum: 1 } } }]),
  ]);
  const count = (rows) => Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
  const lc = count(labs);
  const dc = count(doctors);
  res.json({ data: agents.map((a) => ({ ...a, labs: lc[String(a._id)] || 0, doctors: dc[String(a._id)] || 0 })) });
});

router.patch("/users/:id/status", validate({ params: idParams, body: z.object({ status: statusEnum }) }), async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw badRequest("Apna khud ka account band nahi kar sakte");
  const user = await User.findById(req.params.id);
  if (!user) throw notFound("User nahi mila");
  res.json(await setUserStatus(req, user, req.body.status));
});

router.post("/users/:id/reset-password", validate({ params: idParams }), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw notFound("User nahi mila");
  const { tempPassword } = await resetUserPassword(req, user);
  res.json({ user, tempPassword });
});

// ---------- catalog ----------
router.get("/labs", validate({ query: listQuery.extend({ status: statusEnum.optional(), q: z.string().trim().max(60).optional(), onboardedBy: objectId.optional() }) }), async (req, res) => {
  const filter = {};
  if (req.q.status) filter.status = req.q.status;
  if (req.q.onboardedBy) filter.onboardedBy = req.q.onboardedBy;
  if (req.q.q) filter.name = new RegExp(escapeRe(req.q.q), "i");
  res.json(await paginate(Lab, filter, req.q, { allowedSort: ["createdAt", "name"], populate: { path: "onboardedBy", select: "name" } }));
});

router.get("/doctors", validate({ query: listQuery.extend({ status: statusEnum.optional(), q: z.string().trim().max(60).optional(), specialty: z.string().max(60).optional() }) }), async (req, res) => {
  const filter = {};
  if (req.q.status) filter.status = req.q.status;
  if (req.q.specialty) filter.specialty = req.q.specialty;
  if (req.q.q) filter.name = new RegExp(escapeRe(req.q.q), "i");
  res.json(
    await paginate(Doctor, filter, req.q, {
      allowedSort: ["createdAt", "name"],
      populate: [{ path: "onboardedBy", select: "name" }, { path: "user", select: "email status lastLoginAt" }],
    })
  );
});

router.get("/villages", validate({ query: listQuery.extend({ block: z.string().max(60).optional(), q: z.string().trim().max(60).optional() }) }), async (req, res) => {
  const filter = {};
  if (req.q.block) filter.block = req.q.block;
  if (req.q.q) filter.name = new RegExp(escapeRe(req.q.q), "i");
  res.json(await paginate(Village, filter, req.q, { allowedSort: ["createdAt", "name"], defaultSort: { name: 1 }, populate: { path: "createdBy", select: "name" } }));
});

// Delete is admin-only. Labs/doctors with patient history can't be deleted, because that would orphan
// medical records and settlements; they can be switched off ("disabled") instead.
router.delete("/labs/:id", validate({ params: idParams }), async (req, res) => {
  const lab = await Lab.findById(req.params.id);
  if (!lab) throw notFound("Lab nahi mila");
  const n = await Booking.countDocuments({ lab: lab._id });
  if (n) throw conflict(`Is lab ki ${n} booking hain. Mareezon ka record bachane ke liye delete nahi hoga, "Band karein" use karein.`, "HAS_HISTORY");
  const staff = await User.find({ lab: lab._id, role: "lab_staff" }).select("_id");
  await Promise.all(staff.map((u) => revokeAllForUser(u._id)));
  await User.deleteMany({ _id: { $in: staff.map((u) => u._id) } });
  await LabTest.deleteMany({ lab: lab._id });
  await Settlement.deleteMany({ lab: lab._id });
  await lab.deleteOne();
  await audit(req, { action: "lab.delete", entityType: "Lab", entityId: lab._id, before: { ...pick(lab, ["name", "address", "onboardedBy"]), staffDeleted: staff.length } });
  res.json({ ok: true });
});

router.delete("/doctors/:id", validate({ params: idParams }), async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) throw notFound("Doctor nahi mile");
  const n = (await Appointment.countDocuments({ doctor: doctor._id })) + (await Booking.countDocuments({ referredBy: doctor._id }));
  if (n) throw conflict(`Is doctor ke ${n} appointment/referral hain. Record bachane ke liye delete nahi hoga, "Band karein" use karein.`, "HAS_HISTORY");
  if (doctor.user) {
    await revokeAllForUser(doctor.user);
    await User.deleteOne({ _id: doctor.user });
  }
  await doctor.deleteOne();
  await audit(req, { action: "doctor.delete", entityType: "Doctor", entityId: doctor._id, before: pick(doctor, ["name", "specialty", "onboardedBy"]) });
  res.json({ ok: true });
});

// ---------- bookings & appointments ----------
const dateRange = { from: z.string().max(10).optional(), to: z.string().max(10).optional() };
router.get(
  "/bookings",
  validate({ query: listQuery.extend({ status: bookingStatus.optional(), lab: objectId.optional(), village: objectId.optional(), source: z.enum(["patient", "doctor"]).optional(), code: z.string().max(20).optional(), ...dateRange }) }),
  async (req, res) => {
    const { status, lab, village, source, code, from, to } = req.q;
    const filter = {};
    if (status) filter.status = status;
    if (lab) filter.lab = lab;
    if (village) filter.village = village;
    if (source) filter.source = source;
    if (code) filter.code = code.toUpperCase();
    if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    res.json(
      await paginate(Booking, filter, req.q, {
        allowedSort: ["createdAt", "date", "total"],
        select: "-report.key",
        populate: [{ path: "lab", select: "name" }, { path: "village", select: "name" }, { path: "patient", select: "name phone" }, { path: "referredBy", select: "name" }],
      })
    );
  }
);

router.get(
  "/appointments",
  validate({ query: listQuery.extend({ status: z.enum(["booked", "seen", "cancelled", "no_show"]).optional(), doctor: objectId.optional(), date: z.string().max(10).optional(), ...dateRange }) }),
  async (req, res) => {
    const { status, doctor, date, from, to } = req.q;
    const filter = {};
    if (status) filter.status = status;
    if (doctor) filter.doctor = doctor;
    if (date) filter.date = date;
    else if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    res.json(
      await paginate(Appointment, filter, req.q, {
        allowedSort: ["createdAt", "date", "token"],
        populate: [{ path: "doctor", select: "name specialty" }, { path: "patient", select: "name phone" }, { path: "village", select: "name" }],
      })
    );
  }
);

// ---------- settlements ----------
router.get("/settlements", validate({ query: listQuery.extend({ lab: objectId.optional(), status: z.enum(["pending", "paid"]).optional() }) }), async (req, res) => {
  const filter = {};
  if (req.q.lab) filter.lab = req.q.lab;
  if (req.q.status) filter.status = req.q.status;
  res.json(await paginate(Settlement, filter, req.q, { allowedSort: ["weekStart", "netPayable"], defaultSort: { weekStart: -1 }, populate: { path: "lab", select: "name" }, select: "-bookings" }));
});

router.get("/settlements/:id", validate({ params: idParams }), async (req, res) => {
  const s = await Settlement.findById(req.params.id).populate([
    { path: "lab", select: "name phone" },
    { path: "bookings", select: "code date total labPayout payment collectedAt patientName" },
  ]);
  if (!s) throw notFound("Settlement nahi mila");
  res.json(s);
});

// weekStart (YYYY-MM-DD, any day in the week) defaults to last week.
router.post("/settlements/generate", validate({ body: z.object({ weekOf: z.string().max(10).optional() }) }), async (req, res) => {
  let range = lastWeekRange();
  if (req.body.weekOf) {
    if (!isValidIso(req.body.weekOf)) throw badRequest("Sahi date daalein");
    const start = istWeekStart(new Date(`${req.body.weekOf}T12:00:00+05:30`));
    range = { start, end: new Date(start.getTime() + 7 * 86400 * 1000) };
    if (range.end > new Date()) throw badRequest("Hafta abhi khatam nahi hua", "WEEK_NOT_OVER");
  }
  const data = await generateSettlements(range, req);
  res.status(201).json({ data, weekStart: range.start, weekEnd: range.end });
});

router.patch("/settlements/:id/paid", validate({ params: idParams, body: z.object({ reference: z.string().trim().min(3, "Payment reference (UTR) daalein").max(100) }) }), async (req, res) => {
  const s = await Settlement.findById(req.params.id);
  if (!s) throw notFound("Settlement nahi mila");
  if (s.status === "paid") throw conflict("Pehle se paid hai");
  s.status = "paid";
  s.paidAt = new Date();
  s.paidBy = req.user._id;
  s.reference = req.body.reference;
  await s.save();
  await audit(req, { action: "settlement.paid", entityType: "Settlement", entityId: s._id, before: { status: "pending" }, after: { status: "paid", reference: s.reference, netPayable: s.netPayable } });
  res.json(s);
});

// ---------- finance: commission + who owes whom, per lab ----------
// Counts bookings whose sample was collected in [from, to] (IST dates, inclusive).
//   cash   = the lab's collector took the money from the patient -> lab owes us our commission
//   online = the patient paid on the site (UPI/online)            -> we owe the lab its payout
//   net    = lab payout - cash with lab  (> 0: we pay the lab, < 0: the lab pays us)
// "settled" = the booking sits in a settlement already marked paid.
router.get("/finance", validate({ query: financeRange }), async (req, res) => {
  const { range, match } = financeMatch(req.q);
  const rows = await Booking.aggregate([{ $match: match }, ...financeGroupStages("$lab")]);
  // Profit per test (from the prices frozen on each booking), so the admin sees which rate earns what.
  const byTest = await Booking.aggregate([
    { $match: match },
    { $unwind: "$items" },
    {
      $group: {
        _id: { $toLower: { $trim: { input: "$items.name" } } },
        name: { $first: "$items.name" },
        count: { $sum: 1 },
        revenue: { $sum: "$items.listingPrice" },
        labShare: { $sum: "$items.b2bPrice" },
        minRate: { $min: "$items.listingPrice" },
        maxRate: { $max: "$items.listingPrice" },
      },
    },
    { $addFields: { platformShare: { $subtract: ["$revenue", "$labShare"] } } },
    { $sort: { platformShare: -1 } },
    { $limit: 200 },
    { $project: { _id: 0 } },
  ]);
  const byLab = Object.fromEntries(rows.map((r) => [String(r._id), r]));
  const labs = await Lab.find().select("name commissionPercent status phone").sort({ name: 1 }).collation({ locale: "en" });
  const zero = FINANCE_ZERO;
  const data = labs.map((l) => {
    const { _id: _ignored, ...r } = byLab[String(l._id)] || zero;
    const net = r.weOweLab - r.labOwesUs;
    return { lab: { _id: l._id, name: l.name, commissionPercent: l.commissionPercent, status: l.status, phone: l.phone }, ...r, net, pendingNet: net - r.settledNet };
  });
  const totals = Object.fromEntries(Object.keys({ ...zero, net: 0, pendingNet: 0 }).map((k) => [k, data.reduce((s, d) => s + d[k], 0)]));
  // Never net one lab's debt against another's: what we must pay and what we must collect stay separate.
  const toPay = data.filter((d) => d.pendingNet > 0);
  const toCollect = data.filter((d) => d.pendingNet < 0);
  totals.payToLabs = toPay.reduce((s, d) => s + d.pendingNet, 0);
  totals.collectFromLabs = toCollect.reduce((s, d) => s - d.pendingNet, 0);
  totals.labsToPay = toPay.length;
  totals.labsToCollect = toCollect.length;
  res.json({ range, data, totals, byTest });
});

router.get("/finance/labs/:id", validate({ params: idParams, query: financeRange }), async (req, res) => {
  const { range, match } = financeMatch(req.q);
  const lab = await Lab.findById(req.params.id).select("name commissionPercent");
  if (!lab) throw notFound("Lab nahi mila");
  res.json({ range, lab, data: await financeLedger(lab._id, match) });
});

// ---------- rate card: the money rules, per lab and per test (super admin only) ----------
router.get("/rate-card", async (req, res) => {
  const labs = await Lab.find({ status: "active" })
    .select("name block phone commissionPercent collectionFee freeCollectionAbove minOrderValue")
    .sort({ name: 1 })
    .collation({ locale: "en" })
    .lean();
  const tests = await LabTest.find({ lab: { $in: labs.map((l) => l._id) }, active: true })
    .select("lab name category walkInPrice listingPrice b2bPrice b2bOverridden")
    .sort({ name: 1 })
    .collation({ locale: "en" })
    .lean();
  const byLab = {};
  for (const t of tests) (byLab[String(t.lab)] ||= []).push(t);
  res.json({
    data: labs.map((l) => ({
      ...l,
      tests: (byLab[String(l._id)] || []).map((t) => {
        const p = withPriceDefaults(t, l);
        return { _id: t._id, name: t.name, category: t.category, walkInPrice: t.walkInPrice, patientPrice: p.listingPrice, labShare: p.b2bPrice, platformShare: p.listingPrice - p.b2bPrice, custom: Boolean(t.b2bOverridden) };
      }),
    })),
  });
});

// ---------- dashboard ----------
router.get("/stats", validate({ query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) }), async (req, res) => {
  // Dashboard counts bookings by the day they were *made* (IST), not the collection date,
  // so a booking placed today for tomorrow shows up today.
  const fromIso = addDaysIso(todayIso(), -(req.q.days - 1));
  const fromDate = new Date(`${fromIso}T00:00:00+05:30`);
  const made = { createdAt: { $gte: fromDate } };
  const madeDay = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } };
  const live = { status: { $ne: "cancelled" } };
  const [counts, perDay, money, repeat, topVillages, byStatus, apptStatus] = await Promise.all([
    Promise.all([
      User.countDocuments({ role: "patient" }),
      User.countDocuments({ role: "agent" }),
      Lab.countDocuments({ status: "active" }),
      Doctor.countDocuments({ status: "active" }),
      Village.countDocuments(),
      Appointment.countDocuments({ date: { $gte: fromIso } }),
      Settlement.countDocuments({ status: "pending" }),
    ]),
    Booking.aggregate([
      { $match: made },
      { $group: { _id: madeDay, bookings: { $sum: 1 }, gmv: { $sum: { $cond: [{ $ne: ["$status", "cancelled"] }, "$total", 0] } } } },
      { $sort: { _id: 1 } },
    ]),
    Booking.aggregate([
      { $match: { ...live, ...made } },
      { $group: { _id: null, gmv: { $sum: "$total" }, margin: { $sum: "$platformMargin" }, labPayout: { $sum: "$labPayout" }, n: { $sum: 1 } } },
    ]),
    // Repeat rate: of patients with at least one live booking, how many have two or more (all time).
    Booking.aggregate([
      { $match: live },
      { $group: { _id: "$patient", n: { $sum: 1 } } },
      { $group: { _id: null, patients: { $sum: 1 }, repeat: { $sum: { $cond: [{ $gte: ["$n", 2] }, 1, 0] } } } },
    ]),
    Booking.aggregate([
      { $match: { ...live, ...made } },
      { $group: { _id: "$village", bookings: { $sum: 1 }, gmv: { $sum: "$total" } } },
      { $sort: { bookings: -1 } },
      { $limit: 5 },
      { $lookup: { from: "villages", localField: "_id", foreignField: "_id", as: "v" } },
      { $project: { _id: 1, bookings: 1, gmv: 1, name: { $first: "$v.name" } } },
    ]),
    Booking.aggregate([{ $match: made }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Appointment.aggregate([{ $match: { date: { $gte: fromIso } } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  const [patients, agents, labs, doctors, villages, appointments, pendingSettlements] = counts;
  const m = money[0] || { gmv: 0, margin: 0, labPayout: 0, n: 0 };
  const r = repeat[0] || { patients: 0, repeat: 0 };
  // Fill missing days with zeros so charts have a continuous x-axis
  const byDay = Object.fromEntries(perDay.map((d) => [d._id, d]));
  const series = [];
  for (let d = fromIso; d <= todayIso(); d = addDaysIso(d, 1)) series.push({ date: d, bookings: byDay[d]?.bookings || 0, gmv: byDay[d]?.gmv || 0 });
  res.json({
    days: req.q.days,
    counts: { patients, agents, labs, doctors, villages, appointments, pendingSettlements },
    bookings: m.n,
    gmv: m.gmv,
    platformMargin: m.margin,
    labPayout: m.labPayout,
    repeatRate: r.patients ? Math.round((r.repeat / r.patients) * 1000) / 10 : 0,
    bookingsPerDay: series,
    byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])),
    apptByStatus: Object.fromEntries(apptStatus.map((s) => [s._id, s.n])),
    topVillages,
  });
});

// ---------- audit log ----------
router.get(
  "/audit",
  validate({ query: listQuery.extend({ actor: objectId.optional(), entityType: z.string().max(30).optional(), entityId: objectId.optional(), action: z.string().max(60).optional() }) }),
  async (req, res) => {
    const { actor, entityType, entityId, action } = req.q;
    const filter = {};
    if (actor) filter.actor = actor;
    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = entityId;
    if (action) filter.action = new RegExp(`^${escapeRe(action)}`);
    res.json(await paginate(AuditLog, filter, req.q, { allowedSort: ["at"], defaultSort: { at: -1 }, populate: { path: "actor", select: "name role email" } }));
  }
);

export default router;
