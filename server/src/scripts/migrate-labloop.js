// npm run migrate:labloop — upgrades an existing database to the LabLoop features WITHOUT wiping it.
// Safe to run more than once. Back up first: mongodump --uri "$MONGO_URI" --out <dir>
//   - users:    lang = "hi", langChosen = false where missing
//   - labs:     clinicPickupFee = 0 where missing
//   - bookings: collectionPoint = "home" where missing
//   - doctors:  Hindi specialty names written in Roman letters -> Devanagari
//   - indexes:  syncs new indexes (e.g. bookings by collectionPoint)
//   - demo:     adds the expo demo bookings (seedDemoActivity) once, if the demo accounts exist
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { connectDb, disconnectDb } from "../db.js";
import { User, Lab, Booking, Doctor, Village } from "../models/index.js";
import { verifyPassword } from "../lib/crypto.js";
import { seedDemoActivity } from "./seed.js";
import { DEV_PASSWORD } from "./seed-data.js";

if (env.isProd && process.env.MIGRATE_ALLOW_PROD !== "true") {
  console.error("Refusing to run in production without MIGRATE_ALLOW_PROD=true.");
  process.exit(1);
}

const SPECIALTY_HI = {
  "Aam bimari ke doctor": "सामान्य रोग चिकित्सक",
  "Mahila rog visheshagya": "महिला रोग विशेषज्ञ",
  "Bachchon ke doctor": "बच्चों के डॉक्टर",
  "Chamdi rog visheshagya": "चर्म रोग विशेषज्ञ",
};

await connectDb();
try {
  const log = (label, r) => console.log(`${label}: ${r.modifiedCount ?? r} updated`);
  log("users.lang", await User.updateMany({ lang: { $exists: false } }, { $set: { lang: "hi", langChosen: false } }));
  log("labs.clinicPickupFee", await Lab.updateMany({ clinicPickupFee: { $exists: false } }, { $set: { clinicPickupFee: 0 } }));
  log("bookings.collectionPoint", await Booking.updateMany({ collectionPoint: { $exists: false } }, { $set: { collectionPoint: "home" } }));
  let docs = 0;
  for (const [roman, hindi] of Object.entries(SPECIALTY_HI)) docs += (await Doctor.updateMany({ specialtyHi: roman }, { $set: { specialtyHi: hindi } })).modifiedCount;
  log("doctors.specialtyHi", docs);
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  console.log("indexes: synced");

  // Expo demo bookings, added once (marker: the walk-in "Geeta Devi" at Kumar Clinic).
  const already = await Booking.exists({ "walkIn.name": "Geeta Devi", "clinic.name": "Kumar Clinic" });
  const shree = await Lab.findOne({ name: "Shree Pathology Lab (Demo)" });
  const ram = await User.findOne({ phone: "9876500001", role: "patient" });
  const kumarUser = await User.findOne({ email: "dr.kumar@nidaansetu.test" });
  if (already) console.log("demo bookings: already present");
  else if (!shree || !ram || !kumarUser) console.log("demo bookings: skipped (demo lab/patient/doctor not found)");
  else {
    const [doctors, villages] = await Promise.all([Doctor.find(), Village.find()]);
    const r = await seedDemoActivity({ labs: { shree }, patients: [ram], doctors, villages });
    console.log(`demo bookings: added (${r.bookings} bookings in total now)`);
  }

  // Demo logins must still work with the shared demo password (never changed here).
  const demo = await User.find({ $or: [{ email: /@nidaansetu\.test$/ }, { phone: { $in: ["9876500001", "9876500002"] } }] });
  const bad = [];
  for (const u of demo) if (!(await verifyPassword(DEV_PASSWORD, u.passwordHash))) bad.push(u.email || u.phone);
  console.log(`demo accounts with password ${DEV_PASSWORD}: ${demo.length - bad.length}/${demo.length} OK${bad.length ? ` (different: ${bad.join(", ")})` : ""}`);
} finally {
  await disconnectDb();
}
