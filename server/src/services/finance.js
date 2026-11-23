import { z } from "zod";
import { Booking } from "../models/index.js";
import { todayIso, addDaysIso, isValidIso } from "../lib/dates.js";
import { badRequest } from "../lib/errors.js";

// Shared money maths for the admin "Hisaab" tab and the lab's own "Hisaab" tab,
// so both sides always see exactly the same numbers.
// Counts bookings whose sample was collected in [from, to] (IST dates, inclusive).
//   cash   = the lab's collector took the money from the patient -> lab owes us our commission
//   online = the patient paid on the site (UPI/online)            -> we owe the lab its payout
//   net    = lab payout - cash with lab  (> 0: we pay the lab, < 0: the lab pays us)
// "settled" = the booking sits in a settlement already marked paid.

const isoDate = z.string().refine(isValidIso, "Sahi date (YYYY-MM-DD) daalein");
export const financeRange = z.object({ from: isoDate.optional(), to: isoDate.optional() });

export function financeMatch({ from, to }) {
  const start = from || `${todayIso().slice(0, 8)}01`;
  const end = to || todayIso();
  if (start > end) throw badRequest("'Se' date 'Tak' date se pehle honi chahiye", "BAD_RANGE");
  return {
    range: { from: start, to: end },
    match: {
      status: { $in: ["collected", "report_ready"] },
      collectedAt: { $gte: new Date(`${start}T00:00:00+05:30`), $lt: new Date(`${addDaysIso(end, 1)}T00:00:00+05:30`) },
    },
  };
}

const isCash = { $eq: ["$payment.mode", "cash"] };
const sumIf = (cond, field) => ({ $sum: { $cond: [cond, field, 0] } });

export const FINANCE_ZERO = {
  bookings: 0,
  gross: 0,
  labEarning: 0,
  commission: 0,
  cashBookings: 0,
  cashCollected: 0,
  onlineCollected: 0,
  labOwesUs: 0,
  weOweLab: 0,
  settledNet: 0,
  collectionFees: 0,
};

// Pipeline stages (after a $match) that total the money per `groupBy` ("$lab", or null for one row).
export function financeGroupStages(groupBy) {
  return [
    { $lookup: { from: "settlements", localField: "settlement", foreignField: "_id", as: "st" } },
    { $addFields: { commission: { $subtract: ["$total", "$labPayout"] }, settled: { $eq: [{ $first: "$st.status" }, "paid"] } } },
    {
      $group: {
        _id: groupBy,
        bookings: { $sum: 1 },
        gross: { $sum: "$total" },
        labEarning: { $sum: "$labPayout" },
        commission: { $sum: "$commission" },
        cashBookings: sumIf(isCash, 1),
        cashCollected: sumIf(isCash, "$total"),
        onlineCollected: sumIf({ $not: [isCash] }, "$total"),
        labOwesUs: sumIf(isCash, "$commission"),
        weOweLab: sumIf({ $not: [isCash] }, "$labPayout"),
        settledNet: sumIf("$settled", { $subtract: ["$labPayout", { $cond: [isCash, "$total", 0] }] }),
        collectionFees: { $sum: { $ifNull: ["$collectionFee", 0] } },
      },
    },
  ];
}

// One lab's totals for a period, with the net still to settle.
export async function labFinanceSummary(labId, match) {
  const [row] = await Booking.aggregate([{ $match: { ...match, lab: labId } }, ...financeGroupStages(null)]);
  const { _id: _ignored, ...r } = row || FINANCE_ZERO;
  const net = r.weOweLab - r.labOwesUs;
  return { ...r, net, pendingNet: net - r.settledNet };
}

// Booking-by-booking ledger for one lab.
export async function financeLedger(labId, match, limit = 500) {
  const bookings = await Booking.find({ ...match, lab: labId })
    .select("code patientName date collectedAt total labPayout collectionFee payment settlement")
    .populate({ path: "settlement", select: "status reference weekStart" })
    .sort({ collectedAt: -1 })
    .limit(limit);
  return bookings.map((b) => {
    const mode = b.payment?.mode;
    const commission = b.total - b.labPayout;
    return {
      _id: b._id,
      code: b.code,
      patientName: b.patientName,
      collectedAt: b.collectedAt,
      mode,
      total: b.total,
      labPayout: b.labPayout,
      commission,
      collectionFee: b.collectionFee || 0,
      // + : platform pays the lab, - : lab pays the platform
      net: mode === "cash" ? -commission : b.labPayout,
      settlement: b.settlement ? { status: b.settlement.status, reference: b.settlement.reference, weekStart: b.settlement.weekStart } : null,
    };
  });
}
