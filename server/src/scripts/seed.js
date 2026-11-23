import mongoose from "mongoose";
import { User, Village, Lab, LabTest, Doctor } from "../models/index.js";
import { hashPassword } from "../lib/crypto.js";
import { computeB2b, parseTestList } from "../services/pricing.js";
import * as D from "./seed-data.js";

const point = (lat, lng) => ({ type: "Point", coordinates: [lng, lat] });

// Wipes the database and loads development data. Callers must refuse to run this in production.
export async function seedDev({ password = D.DEV_PASSWORD, mustChangePassword = false } = {}) {
  await mongoose.connection.db.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  const passwordHash = await hashPassword(password);

  const admin = await User.create({ name: "Dev Super Admin", email: "admin@nidaansetu.test", role: "super_admin", passwordHash });
  const agent = await User.create({ ...D.agent, role: "agent", passwordHash, createdBy: admin._id, mustChangePassword });

  const villages = await Village.insertMany(D.villages.map(({ lat, lng, ...v }) => ({ ...v, location: point(lat, lng), createdBy: agent._id })));
  const villageByName = Object.fromEntries(villages.map((v) => [v.name, v]));

  const tag = (names = []) => names.map((n) => villageByName[n]._id);

  const labs = {};
  for (const { key, tests, staff, lat, lng, villages: served, ...l } of D.labs) {
    const lab = await Lab.create({ ...l, villages: tag(served), location: point(lat, lng), onboardedBy: agent._id });
    const { rows } = parseTestList(tests);
    await LabTest.insertMany(
      rows.map((r) => ({
        ...r,
        lab: lab._id,
        listingPrice: r.walkInPrice,
        b2bPrice: computeB2b(r.walkInPrice, lab.commissionPercent),
        fastingRequired: D.FASTING.has(r.name),
        sampleType: r.name.startsWith("Urine") ? "urine" : "blood",
      }))
    );
    await User.create({ ...staff, role: "lab_staff", lab: lab._id, passwordHash, createdBy: agent._id, mustChangePassword });
    labs[key] = lab;
  }

  const doctors = [];
  for (const { email, lat, lng, village, ...d } of D.doctors) {
    const doctor = await Doctor.create({ ...d, villages: tag([village]), location: point(lat, lng), onboardedBy: agent._id });
    const user = await User.create({ name: d.name, email, role: "doctor", doctor: doctor._id, passwordHash, createdBy: agent._id, mustChangePassword });
    doctor.user = user._id;
    await doctor.save();
    doctors.push(doctor);
  }

  const patients = [];
  for (const p of D.patients) {
    patients.push(await User.create({ name: p.name, phone: p.phone, role: "patient", village: villageByName[p.village]._id, passwordHash }));
  }

  return { admin, agent, villages, labs, doctors, patients };
}

// ---------- demo activity (npm run seed:dev and the e2e server; not the Jest seed) ----------
// Bookings in every state the expo demo needs: a confirmed home booking with a location (route,
// Navigate, "I'm leaving now"), two clinic requests at Dr. Kumar's clinic for Shree Lab (one walk-in,
// one from an appointment) and one booking with a report ready to open.
export async function seedDemoActivity(data) {
  const { createBooking, transition } = await import("../services/bookings.js");
  const { getStorage } = await import("../lib/storage/index.js");
  const { Booking, Appointment, LabTest } = await import("../models/index.js");
  const { todayIso, addDaysIso } = await import("../lib/dates.js");
  const { randomDigits, deriveOtp, hashOtp, randomToken } = await import("../lib/crypto.js");

  const shree = data.labs.shree;
  const [ram] = data.patients;
  const kumar = data.doctors.find((d) => d.clinicName === "Kumar Clinic");
  const kumarUser = await User.findById(kumar.user);
  const staff = await User.findOne({ role: "lab_staff", lab: shree._id });
  const rampur = data.villages.find((v) => v.name === "Rampur");
  const ids = async (names) => (await LabTest.find({ lab: shree._id, name: { $in: names } })).map((t) => t._id);
  const asUser = (user) => ({ user, ip: "seed", get: () => undefined });
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);

  // 1. Home booking, confirmed, with the patient's home pin (Rampur village point, nudged a little).
  const [lng, lat] = rampur.location.coordinates;
  const { booking: home } = await createBooking(asUser(ram), {
    patient: ram,
    villageId: rampur._id,
    labId: shree._id,
    testIds: await ids(["CBC", "HbA1c"]),
    date: today,
    slot: "08-10",
    address: "Ward 4, near the temple, Rampur",
    location: { type: "Point", coordinates: [lng + 0.002, lat + 0.001] },
    consent: true,
  });
  transition(home, "confirmed", staff._id, "Collector 08-10 aayega");
  home.collectionTime = "08-10";
  await home.save();

  // 2. Clinic walk-in at Kumar Clinic.
  await createBooking(asUser(kumarUser), {
    walkIn: { name: "Geeta Devi", age: 52, gender: "female" },
    labId: shree._id,
    testIds: await ids(["Sugar Fasting", "Lipid Profile"]),
    date: today,
    slot: "lab_decides",
    source: "doctor",
    referredBy: kumar._id,
    consent: true,
    collectionPoint: "clinic",
    clinicDoctor: kumar,
    note: "Fasting since last night",
  });

  // 3. Clinic request from today's appointment (Ram at Kumar Clinic), confirmed by the lab.
  const code = "DR" + randomDigits(6);
  const lastToken = await Appointment.findOne({ doctor: kumar._id, date: today }).sort({ token: -1 }).select("token");
  const appt = await Appointment.create({
    code,
    visitHash: hashOtp(code, deriveOtp(code)),
    patient: ram._id,
    patientName: ram.name,
    village: rampur._id,
    doctor: kumar._id,
    date: today,
    token: (lastToken?.token || 0) + 1,
    status: "seen",
    seenAt: new Date(),
  });
  const { booking: fromAppt } = await createBooking(asUser(kumarUser), {
    patient: ram,
    villageId: rampur._id,
    labId: shree._id,
    testIds: await ids(["Thyroid (T3, T4, TSH)"]),
    date: today,
    slot: "lab_decides",
    source: "doctor",
    referredBy: kumar._id,
    appointment: appt._id,
    consent: true,
    collectionPoint: "clinic",
    clinicDoctor: kumar,
  });
  transition(fromAppt, "confirmed", staff._id, "Collector 10-12 aayega");
  fromAppt.collectionTime = "10-12";
  await fromAppt.save();
  appt.referredBooking = fromAppt._id;
  await appt.save();

  // 4. A finished booking whose report can be opened.
  const { booking: done } = await createBooking(asUser(ram), {
    patient: ram,
    villageId: rampur._id,
    labId: shree._id,
    testIds: await ids(["KFT", "Uric Acid"]),
    date: tomorrow,
    slot: "06-08",
    address: "Ward 4, near the temple, Rampur",
    consent: true,
  });
  transition(done, "confirmed", staff._id, "Collector 06-08 aayega");
  done.collectionTime = "06-08";
  transition(done, "collected", staff._id, "Sample le liya gaya (OTP sahi)");
  done.collectedAt = new Date();
  done.payment.status = "paid";
  const key = `reports/${shree._id}/${done.code}-${randomToken(8)}.pdf`;
  const pdf = demoReportPdf(done.code, ram.name);
  await (await getStorage()).put({ key, buffer: pdf, mime: "application/pdf" });
  done.report = { key, name: `${done.code}-report.pdf`, mime: "application/pdf", size: pdf.length, uploadedAt: new Date() };
  transition(done, "report_ready", staff._id, "Report upload hui");
  await done.save();

  return { home, fromAppt, done, bookings: await Booking.countDocuments() };
}

// A one-page PDF with a few lines of text (valid xref offsets, so every viewer opens it).
export function demoReportPdf(code, name) {
  const lines = ["LabLoop - Demo Lab Report", `Booking ${code}`, `Patient: ${name}`, "Shree Pathology Lab (Demo)", "KFT: within normal range", "Uric Acid: 5.1 mg/dL (3.5 - 7.2)", "This is sample data for a demo."];
  const text = lines.map((l, i) => `BT /F1 ${i ? 13 : 18} Tf 60 ${760 - i * 28} Td (${l.replace(/[()\\]/g, "")}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}
