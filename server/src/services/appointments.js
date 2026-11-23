import { Appointment, Doctor, FamilyMember } from "../models/index.js";
import { addDaysIso, isValidIso, todayIso, weekdayOf } from "../lib/dates.js";
import { randomDigits, deriveOtp, hashOtp, safeEqual } from "../lib/crypto.js";
import { audit, pick } from "../lib/audit.js";
import { AppError, badRequest, conflict, notFound } from "../lib/errors.js";

const ACTIVE = ["booked", "seen", "no_show"]; // everything except cancelled holds a token slot
export const MAX_ADVANCE_DAYS = 30;

export const APPT_POPULATE = [
  { path: "doctor", select: "name degree specialty specialtyHi clinicName clinicAddress fee schedule" },
  { path: "familyMember", select: "name age relation" },
  { path: "referredBooking", select: "code status items lab total", populate: { path: "lab", select: "name" } },
];

const slotFor = (doctor, date) => doctor.schedule.find((s) => s.day === weekdayOf(date));

// Dates in [from, to] on which the doctor sits, with tokens left.
export async function availability(doctor, from, to) {
  const today = todayIso();
  from = !from || from < today ? today : from;
  const maxTo = addDaysIso(today, MAX_ADVANCE_DAYS);
  to = !to || to > maxTo ? addDaysIso(from, 13) : to;
  if (to > maxTo) to = maxTo;
  if (from > to) return [];

  const dates = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) {
    const slot = slotFor(doctor, d);
    if (slot) dates.push({ date: d, day: slot.day, start: slot.start, end: slot.end, maxTokens: slot.maxTokens });
  }
  if (!dates.length) return [];
  const counts = await Appointment.aggregate([
    { $match: { doctor: doctor._id, date: { $in: dates.map((x) => x.date) }, status: { $in: ACTIVE } } },
    { $group: { _id: "$date", n: { $sum: 1 } } },
  ]);
  const byDate = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  return dates.map((x) => ({ ...x, booked: byDate[x.date] || 0, tokensLeft: Math.max(0, x.maxTokens - (byDate[x.date] || 0)) }));
}

export async function takeToken(req, { patient, doctorId, date, familyMemberId, villageId }) {
  if (!isValidIso(date)) throw badRequest("Sahi din chunein", "BAD_DATE");
  const today = todayIso();
  if (date < today || date > addDaysIso(today, MAX_ADVANCE_DAYS)) throw badRequest("Aaj ya aage ke 30 din mein se din chunein", "BAD_DATE");

  const doctor = await Doctor.findOne({ _id: doctorId, status: "active" });
  if (!doctor) throw notFound("Doctor nahi mile", "DOCTOR_NOT_FOUND");
  const slot = slotFor(doctor, date);
  if (!slot) throw badRequest("Doctor us din nahi baithte. Doosra din chunein.", "NOT_SCHEDULED");

  let member;
  if (familyMemberId) {
    member = await FamilyMember.findOne({ _id: familyMemberId, owner: patient._id });
    if (!member) throw notFound("Parivaar ka sadasya nahi mila", "FAMILY_NOT_FOUND");
  }

  // One token per person per doctor per day (the account holder and each family member are separate people).
  const dup = await Appointment.exists({
    doctor: doctor._id,
    date,
    patient: patient._id,
    familyMember: member ? member._id : { $exists: false },
    status: { $in: ACTIVE },
  });
  if (dup) throw conflict("Is din is doctor ka number pehle se laga hai", "DUPLICATE_TOKEN");

  // Token = next number for that doctor and date. The unique index {doctor, date, token}
  // turns a race into a duplicate-key error, which we retry.
  for (let attempt = 0; attempt < 5; attempt++) {
    const active = await Appointment.countDocuments({ doctor: doctor._id, date, status: { $in: ACTIVE } });
    if (active >= slot.maxTokens) throw conflict("Is din ke saare number bhar gaye. Doosra din chunein.", "TOKENS_FULL");
    const last = await Appointment.findOne({ doctor: doctor._id, date }).sort({ token: -1 }).select("token");
    try {
      const code = "DR" + randomDigits(6);
      const appt = await Appointment.create({
        code,
        visitHash: hashOtp(code, deriveOtp(code)),
        patient: patient._id,
        familyMember: member?._id,
        patientName: member?.name || patient.name,
        patientAge: member?.age,
        village: villageId || patient.village,
        doctor: doctor._id,
        date,
        token: (last?.token || 0) + 1,
      });
      await audit(req, { action: "appointment.create", entityType: "Appointment", entityId: appt._id, after: pick(appt, ["doctor", "date", "token", "patient"]) });
      return appt;
    } catch (e) {
      if (e.code !== 11000) throw e;
    }
  }
  throw conflict("Abhi bahut log number le rahe hain, dobara koshish karein", "TOKEN_RACE");
}

export const VISIT_MAX_ATTEMPTS = 5;
const visitLocked = () =>
  new AppError(423, "VISIT_CODE_LOCKED", "Bahut baar galat code. Yeh number lock ho gaya, LabLoop team se sampark karein.");

// Doctor enters the 4-digit code from the patient's receipt. Locks after VISIT_MAX_ATTEMPTS wrong tries.
export async function verifyVisitCode(appt, code) {
  if (appt.visitLocked || appt.visitAttempts >= VISIT_MAX_ATTEMPTS) throw visitLocked();
  // Appointments made before visit codes existed have no hash; the code is derivable either way.
  const ok = appt.visitHash ? safeEqual(hashOtp(appt.code, code), appt.visitHash) : safeEqual(deriveOtp(appt.code), code);
  if (ok) return true;
  const updated = await Appointment.findOneAndUpdate({ _id: appt._id }, { $inc: { visitAttempts: 1 } }, { returnDocument: "after" });
  if (updated.visitAttempts >= VISIT_MAX_ATTEMPTS) {
    await Appointment.updateOne({ _id: appt._id }, { visitLocked: true });
    throw visitLocked();
  }
  throw badRequest(`Receipt ka code galat hai. ${VISIT_MAX_ATTEMPTS - updated.visitAttempts} koshish baaki.`, "WRONG_VISIT_CODE");
}

// What the patient sees: the visit code only while the token is still open.
export function patientApptView(a) {
  const o = a.toJSON();
  delete o.visitAttempts;
  if (a.status === "booked" && !a.visitLocked) o.visitCode = deriveOtp(a.code);
  return o;
}
