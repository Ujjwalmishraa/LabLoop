// npm run seed:dev  — wipes the configured database and loads demo data. Never in production.
import { env } from "../config/env.js";
import { connectDb, disconnectDb } from "../db.js";
import { seedDev, seedDemoActivity } from "./seed.js";
import * as D from "./seed-data.js";

if (env.isProd || process.env.NODE_ENV === "production") {
  console.error("seed:dev refuses to run with NODE_ENV=production.");
  process.exit(1);
}
if (/mongodb\.net/.test(env.MONGO_URI) && process.env.SEED_ALLOW_REMOTE !== "true") {
  console.error("MONGO_URI points at Atlas. Set SEED_ALLOW_REMOTE=true if you really want to wipe it.");
  process.exit(1);
}

await connectDb();
try {
  const r = await seedDev();
  const demo = await seedDemoActivity(r);
  console.log(`Seeded ${r.villages.length} villages, ${Object.keys(r.labs).length} labs, ${r.doctors.length} doctors, ${r.patients.length} patients, ${demo.bookings} demo bookings.`);
  console.log(`\nDev logins (password for all: ${D.DEV_PASSWORD})`);
  console.log("  super_admin  admin@nidaansetu.test");
  console.log(`  agent        ${D.agent.email}`);
  for (const l of D.labs) console.log(`  lab_staff    ${l.staff.email}`);
  for (const d of D.doctors) console.log(`  doctor       ${d.email}`);
  for (const p of D.patients) console.log(`  patient      ${p.phone} (mobile)`);
} finally {
  await disconnectDb();
}
