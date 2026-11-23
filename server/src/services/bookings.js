import { Booking, Lab, LabTest, Village, FamilyMember } from "../models/index.js";
import { priceBooking } from "./pricing.js";
import { randomDigits, hashOtp, safeEqual, deriveOtp } from "../lib/crypto.js";
import { audit, pick } from "../lib/audit.js";
import { AppError, badRequest, conflict, notFound } from "../lib/errors.js";
import { addDaysIso, isValidIso, todayIso } from "../lib/dates.js";

export const OTP_MAX_ATTEMPTS = 5;

// Allowed transitions. Anything else is rejected.
const TRANSITIONS = {
  requested: ["confirmed", "cancelled"],
  confirmed: ["collected", "cancelled"],
  collected: ["report_ready"],
  report_ready: [],
  cancelled: [],
};

export function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function transition(booking, to, by, note) {
  if (!canTransition(booking.status, to)) {
    throw conflict(`Booking abhi "${booking.status}" hai, "${to}" nahi ho sakti`, "INVALID_TRANSITION");
  }
  booking.status = to;
  booking.history.push({ status: to, at: new Date(), by, note });
}

export const BOOKING_POPULATE = [
  { path: "lab", select: "name phone address" },
  { path: "village", select: "name block" },
  { path: "referredBy", select: "name specialty" },
  { path: "familyMember", select: "name age relation" },
];

async function uniqueCode(prefix, model) {
  for (let i = 0; i < 5; i++) {
    const code = prefix + randomDigits(6);
    if (!(await model.exists({ code }))) return code;
  }
  throw new Error("could not allocate booking code");
}

// Creates a test booking. Returns { booking, otp }. Only the patient is ever shown the OTP.
export async function createBooking(req, input) {
  const { patient, familyMemberId, villageId, labId, testIds, date, slot, address, source = "patient", referredBy, appointment, consent, paymentMode = "cash" } = input;

  if (!isValidIso(date)) throw badRequest("Sahi din chunein", "BAD_DATE");
  const today = todayIso();
  if (date < today || date > addDaysIso(today, 7)) throw badRequest("Aaj se 7 din ke andar ka din chunein", "BAD_DATE");

  const [lab, village] = await Promise.all([Lab.findOne({ _id: labId, status: "active" }), Village.findById(villageId)]);
  if (!lab) throw notFound("Lab nahi mila", "LAB_NOT_FOUND");
  if (!village) throw notFound("Gaon nahi mila", "VILLAGE_NOT_FOUND");

  let member;
  if (familyMemberId) {
    member = await FamilyMember.findOne({ _id: familyMemberId, owner: patient._id });
    if (!member) throw notFound("Parivaar ka sadasya nahi mila", "FAMILY_NOT_FOUND");
  }

  // The lab must serve the village: if it has tagged villages, only those; otherwise by service radius.
  const served = lab.villages || [];
  let inRange;
  if (served.length) inRange = served.some((v) => String(v) === String(village._id));
  else {
    const near = await Lab.aggregate([
      { $geoNear: { near: village.location, distanceField: "d", spherical: true, maxDistance: lab.serviceRadiusKm * 1000, query: { _id: lab._id } } },
    ]);
    inRange = near.length > 0;
  }
  if (!inRange) throw badRequest("Yeh lab aapke gaon tak sample lene nahi aata", "OUT_OF_RANGE");

  const ids = [...new Set(testIds.map(String))];
  const tests = await LabTest.find({ _id: { $in: ids }, lab: lab._id, active: true });
  if (tests.length !== ids.length) throw badRequest("Kuch test is lab mein uplabdh nahi hain", "TEST_UNAVAILABLE");

  const price = priceBooking(lab, tests);
  if (price.testTotal < lab.minOrderValue) {
    throw badRequest(`Kam se kam ₹${lab.minOrderValue} ki jaanch book karein`, "MIN_ORDER");
  }

  const code = await uniqueCode("NS", Booking);
  const otp = deriveOtp(code);
  const booking = await Booking.create({
    code,
    patient: patient._id,
    familyMember: member?._id,
    patientName: member?.name || patient.name,
    patientAge: member?.age,
    village: village._id,
    address,
    lab: lab._id,
    ...price,
    date,
    slot,
    otpHash: hashOtp(code, otp),
    source,
    referredBy,
    appointment,
    consent: Boolean(consent),
    payment: { mode: paymentMode, status: "pending" },
    history: [{ status: "requested", by: req.user._id, note: source === "doctor" ? "Doctor ne test likha" : "Patient ne book kiya" }],
  });
  await audit(req, {
    action: "booking.create",
    entityType: "Booking",
    entityId: booking._id,
    after: pick(booking, ["code", "lab", "patient", "total", "labPayout", "platformMargin", "source"]),
  });
  return { booking, otp };
}

const otpLockedError = () =>
  new AppError(423, "OTP_LOCKED", "Bahut baar galat OTP. Booking lock ho gayi, LabLoop team se sampark karein.");

// Checks the collection OTP. Locks the booking after OTP_MAX_ATTEMPTS wrong tries.
export async function verifyOtp(booking, otp) {
  if (booking.otpLocked || booking.otpAttempts >= OTP_MAX_ATTEMPTS) {
    throw otpLockedError();
  }
  if (safeEqual(hashOtp(booking.code, otp), booking.otpHash)) return true;
  // Atomic increment so parallel guesses can't exceed the limit
  const updated = await Booking.findOneAndUpdate({ _id: booking._id }, { $inc: { otpAttempts: 1 } }, { returnDocument: "after" });
  if (updated.otpAttempts >= OTP_MAX_ATTEMPTS) {
    await Booking.updateOne({ _id: booking._id }, { otpLocked: true });
    throw otpLockedError();
  }
  throw badRequest(`OTP galat hai. ${OTP_MAX_ATTEMPTS - updated.otpAttempts} koshish baaki.`, "WRONG_OTP");
}
