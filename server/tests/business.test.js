import { as, login, nextDateOn, seed, startTestApp, stopTestApp, testIds, tomorrow, village, PDF } from "./helpers.js";
import { Booking, Settlement, Lab, Appointment } from "../src/models/index.js";
import { lastWeekRange, addDaysIso, todayIso, weekdayOf } from "../src/lib/dates.js";
import { computeB2b, parseTestList, priceBooking } from "../src/services/pricing.js";
import { canTransition } from "../src/services/bookings.js";

let app, data, admin, shreeStaff, jeevanStaff, kumar, devi, ram, sita, rampur;

beforeAll(async () => {
  app = await startTestApp();
  data = await seed();
  [admin, shreeStaff, jeevanStaff, kumar, devi, ram, sita] = await Promise.all(
    ["admin@nidaansetu.test", "lab.shree@nidaansetu.test", "lab.jeevan@nidaansetu.test", "dr.kumar@nidaansetu.test", "dr.devi@nidaansetu.test", "9876500001", "9876500002"].map((id) =>
      login(app, id)
    )
  );
  rampur = await village("Rampur");
});
afterAll(stopTestApp);

const shreeId = () => String(data.labs.shree._id);
async function book(names, extra = {}, patient = ram, lab = data.labs.shree) {
  return as(app, patient.token).post("/bookings", {
    labId: String(lab._id),
    testIds: await testIds(lab, names),
    villageId: String(rampur._id),
    address: "Ward 4, Rampur",
    date: tomorrow(),
    slot: "Subah 6-8",
    consent: true,
    ...extra,
  });
}

describe("pricing", () => {
  test("prices come from the DB even if the client sends a price", async () => {
    const r = await book(["CBC", "HbA1c"], {
      items: [{ name: "CBC", listingPrice: 1 }],
      testTotal: 1,
      total: 1,
      collectionFee: 0,
      tests: [{ name: "CBC", price: 1 }],
    });
    expect(r.status).toBe(201);
    expect(r.body.testTotal).toBe(950);
    expect(r.body.items.map((i) => i.listingPrice).sort()).toEqual([400, 550]);
    const b = await Booking.findById(r.body._id);
    // 30% commission: B2B = 280 + 385
    expect(b.labPayout).toBe(665);
    expect(b.total).toBe(950);
    expect(b.platformMargin).toBe(285);
  });

  test("collection fee charged below freeCollectionAbove, free at or above it", async () => {
    const below = await book(["CBC"]); // 400 < 499
    expect(below.body.collectionFee).toBe(49);
    expect(below.body.total).toBe(449);
    const atOrAbove = await book(["CBC", "Hb"]); // 500 >= 499
    expect(atOrAbove.body.collectionFee).toBe(0);
    expect(atOrAbove.body.total).toBe(500);
    const fee = await Booking.findById(below.body._id);
    expect(fee.platformMargin).toBe(449 - 280); // collection fee stays with the platform
  });

  test("orders below minOrderValue are rejected with a Hindi message", async () => {
    const r = await book(["Sugar Fasting", "Sugar PP"]); // 100 < 199
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("MIN_ORDER");
    expect(r.body.error.message).toBe("कम से कम ₹199 की जाँच बुक करें");
  });

  test("tests from another lab cannot be mixed in", async () => {
    const jeevanCbc = await testIds(data.labs.jeevan, ["CBC"]);
    const r = await as(app, ram.token).post("/bookings", {
      labId: shreeId(),
      testIds: [...(await testIds(data.labs.shree, ["HbA1c"])), ...jeevanCbc],
      villageId: String(rampur._id),
      address: "x road",
      date: tomorrow(),
      slot: "6-8",
      consent: true,
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("TEST_UNAVAILABLE");
  });

  test("consent is required", async () => {
    const r = await book(["CBC", "HbA1c"], { consent: false });
    expect(r.status).toBe(400);
  });

  test("b2b price helper and bulk import parser", () => {
    expect(computeB2b(400, 30)).toBe(280);
    const { rows, errors } = parseTestList("name,price\nCBC = 400\nTSH,200\nbad line\nZero = 0");
    expect(rows).toEqual([{ name: "CBC", walkInPrice: 400 }, { name: "TSH", walkInPrice: 200 }]);
    expect(errors).toHaveLength(2);
  });
});

describe("geo", () => {
  test("only labs that serve the village, nearest first, with km", async () => {
    const r = await as(app, ram.token).get(`/labs?villageId=${rampur._id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.map((l) => l.name)).toEqual(["Shree Pathology Lab (Demo)", "Jeevan Diagnostic Centre (Demo)"]);
    expect(r.body.data[0].distanceKm).toBeLessThan(r.body.data[1].distanceKm);
    expect(r.body.data[0].commissionPercent).toBeUndefined();

    const sarsar = await village("Sarsar");
    const far = await as(app, ram.token).get(`/labs?villageId=${sarsar._id}`);
    expect(far.body.data).toHaveLength(0);
    const r2 = await book(["CBC", "HbA1c"], { villageId: String(sarsar._id) });
    expect(r2.status).toBe(400);
    expect(r2.body.error.code).toBe("OUT_OF_RANGE");
  });

  test("a lab/doctor tagged with villages shows only in those villages", async () => {
    // Shree's 6 km radius covers Sonbarsa, but Shree is tagged elsewhere, so only Jeevan shows.
    const sonbarsa = await village("Sonbarsa");
    const labs = await as(app, ram.token).get(`/labs?villageId=${sonbarsa._id}`);
    expect(labs.body.data.map((l) => l.name)).toEqual(["Jeevan Diagnostic Centre (Demo)"]);
    const blocked = await book(["CBC"], { villageId: String(sonbarsa._id) });
    expect(blocked.body.error.code).toBe("OUT_OF_RANGE");

    // Every village gets its own doctor, and only that doctor.
    const docs = await as(app, ram.token).get(`/doctors?villageId=${rampur._id}`);
    expect(docs.body.data.map((d) => d.name)).toEqual(["Dr. Sunita Devi"]);
    expect(docs.body.data[0].villages).toBeUndefined();
  });

  test("public test list hides walk-in and B2B prices", async () => {
    const r = await as(app, ram.token).get(`/labs/${shreeId()}/tests`);
    expect(r.body.data).toHaveLength(20);
    expect(r.body.data[0].b2bPrice).toBeUndefined();
    expect(r.body.data[0].walkInPrice).toBeUndefined();
    expect(r.body.data[0].listingPrice).toBeGreaterThan(0);
  });
});

describe("booking status machine", () => {
  test("transition table", () => {
    expect(canTransition("requested", "confirmed")).toBe(true);
    expect(canTransition("requested", "collected")).toBe(false);
    expect(canTransition("collected", "cancelled")).toBe(false);
    expect(canTransition("report_ready", "requested")).toBe(false);
    expect(canTransition("cancelled", "confirmed")).toBe(false);
  });

  test("invalid transitions are rejected by the API", async () => {
    const b = (await book(["CBC", "HbA1c"])).body;
    const lab = as(app, shreeStaff.token);
    expect((await lab.patch(`/lab/bookings/${b._id}/collect`, { otp: b.otp })).status).toBe(409);
    expect((await lab.upload(`/lab/bookings/${b._id}/report`, "report", PDF, "r.pdf", "application/pdf")).status).toBe(409);
    expect((await lab.patch(`/lab/bookings/${b._id}/confirm`, { collectionTime: "7 baje" })).status).toBe(200);
    expect((await lab.patch(`/lab/bookings/${b._id}/confirm`, { collectionTime: "7 baje" })).body.error.code).toBe("INVALID_TRANSITION");
    expect((await lab.patch(`/lab/bookings/${b._id}/collect`, { otp: b.otp })).status).toBe(200);
    // No cancelling after collection, by anyone
    expect((await as(app, ram.token).post(`/bookings/${b._id}/cancel`, {})).status).toBe(409);
    expect((await lab.patch(`/lab/bookings/${b._id}/reject`, {})).status).toBe(409);
    // OTP no longer shown once collected
    const mine = await as(app, ram.token).get("/me/bookings");
    expect(mine.body.data.find((x) => x._id === b._id).otp).toBeUndefined();
  });

  test("patient can cancel while requested/confirmed", async () => {
    const b = (await book(["CBC", "HbA1c"])).body;
    const r = await as(app, ram.token).post(`/bookings/${b._id}/cancel`, { reason: "Gaon se bahar" });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("cancelled");
    expect((await as(app, shreeStaff.token).patch(`/lab/bookings/${b._id}/confirm`, { collectionTime: "7" })).status).toBe(409);
  });

  test("report upload: only PDF/JPG/PNG with matching bytes, max 5 MB", async () => {
    const b = (await book(["CBC", "HbA1c"])).body;
    const lab = as(app, shreeStaff.token);
    await lab.patch(`/lab/bookings/${b._id}/confirm`, { collectionTime: "7 baje" });
    await lab.patch(`/lab/bookings/${b._id}/collect`, { otp: b.otp });
    expect((await lab.upload(`/lab/bookings/${b._id}/report`, "report", Buffer.from("hello"), "a.txt", "text/plain")).status).toBe(400);
    expect((await lab.upload(`/lab/bookings/${b._id}/report`, "report", Buffer.from("not a pdf"), "a.pdf", "application/pdf")).body.error.code).toBe("BAD_FILE_TYPE");
    const big = Buffer.concat([Buffer.from("%PDF"), Buffer.alloc(5 * 1024 * 1024 + 10)]);
    expect((await lab.upload(`/lab/bookings/${b._id}/report`, "report", big, "big.pdf", "application/pdf")).status).toBe(400);
    expect((await lab.upload(`/lab/bookings/${b._id}/report`, "report", PDF, "ok.pdf", "application/pdf")).status).toBe(200);
  });
});

describe("collection OTP", () => {
  test("wrong OTP is rejected and the booking locks after 5 attempts", async () => {
    const b = (await book(["CBC", "HbA1c"])).body;
    const lab = as(app, shreeStaff.token);
    await lab.patch(`/lab/bookings/${b._id}/confirm`, { collectionTime: "7 baje" });
    const wrong = b.otp === "0000" ? "1111" : "0000";
    for (let i = 1; i <= 4; i++) {
      const r = await lab.patch(`/lab/bookings/${b._id}/collect`, { otp: wrong });
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe("WRONG_OTP");
      expect(r.body.error.message).toContain(`${5 - i} कोशिश बाकी`);
    }
    const fifth = await lab.patch(`/lab/bookings/${b._id}/collect`, { otp: wrong });
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe("OTP_LOCKED");
    // Even the right OTP no longer works
    const right = await lab.patch(`/lab/bookings/${b._id}/collect`, { otp: b.otp });
    expect(right.status).toBe(423);
    expect((await Booking.findById(b._id)).status).toBe("confirmed");
  });
});

describe("doctor tokens", () => {
  const kumarDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  test("only on schedule days", async () => {
    let sunday = todayIso();
    while (weekdayOf(sunday) !== "Sun") sunday = addDaysIso(sunday, 1);
    const r = await as(app, ram.token).post("/appointments", { doctorId: String(data.doctors[0]._id), date: sunday });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("NOT_SCHEDULED");

    const avail = await as(app, ram.token).get(`/doctors/${data.doctors[0]._id}/availability`);
    expect(avail.body.data.length).toBeGreaterThan(0);
    expect(avail.body.data.every((d) => kumarDays.includes(d.day))).toBe(true);
  });

  test("token numbers increase; same patient cannot take two on one day", async () => {
    const date = nextDateOn(kumarDays);
    const doctorId = String(data.doctors[0]._id);
    const a1 = await as(app, ram.token).post("/appointments", { doctorId, date });
    const a2 = await as(app, sita.token).post("/appointments", { doctorId, date });
    expect(a1.status).toBe(201);
    expect(a2.body.token).toBe(a1.body.token + 1);
    const dup = await as(app, ram.token).post("/appointments", { doctorId, date });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("DUPLICATE_TOKEN");

    // A family member is a different person and may take their own token.
    const fam = await as(app, ram.token).post("/me/family", { name: "Shanti Devi", age: 60, relation: "Maa" });
    const a3 = await as(app, ram.token).post("/appointments", { doctorId, date, familyMemberId: fam.body._id });
    expect(a3.status).toBe(201);
    expect(a3.body.patientName).toBe("Shanti Devi");

    // After cancelling, the patient can book again (new number).
    await as(app, ram.token).post(`/appointments/${a1.body._id}/cancel`);
    const again = await as(app, ram.token).post("/appointments", { doctorId, date });
    expect(again.status).toBe(201);
    expect(again.body.token).toBe(a3.body.token + 1);
  });

  test("within maxTokens per day", async () => {
    const devDays = ["Mon", "Wed", "Fri"];
    const sched = await as(app, devi.token).patch("/doctor/schedule", {
      schedule: devDays.map((day) => ({ day, start: "11:00", end: "15:00", maxTokens: 1 })),
    });
    expect(sched.status).toBe(200);
    const date = nextDateOn(devDays);
    const doctorId = String(data.doctors[1]._id);
    expect((await as(app, ram.token).post("/appointments", { doctorId, date })).status).toBe(201);
    const full = await as(app, sita.token).post("/appointments", { doctorId, date });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe("TOKENS_FULL");
    const avail = await as(app, sita.token).get(`/doctors/${doctorId}/availability?from=${date}&to=${date}`);
    expect(avail.body.data[0].tokensLeft).toBe(0);
  });

  test("schedule validation rejects bad times and duplicate days", async () => {
    const bad = await as(app, devi.token).patch("/doctor/schedule", { schedule: [{ day: "Mon", start: "15:00", end: "11:00", maxTokens: 5 }] });
    expect(bad.status).toBe(400);
    const dup = await as(app, devi.token).patch("/doctor/schedule", {
      schedule: [{ day: "Mon", start: "09:00", end: "11:00", maxTokens: 5 }, { day: "Mon", start: "12:00", end: "13:00", maxTokens: 5 }],
    });
    expect(dup.status).toBe(400);
  });
});

describe("referrals", () => {
  test("doctor referral creates a doctor-sourced booking the patient sees", async () => {
    const date = todayIso();
    const day = weekdayOf(date);
    // Make sure Dr. Kumar sits today so the appointment can be marked seen
    await as(app, kumar.token).patch("/doctor/schedule", { schedule: [{ day, start: "09:00", end: "17:00", maxTokens: 50 }] });
    // Book for a family member so it can't collide with Sita's own token from an earlier test
    const fam = await as(app, sita.token).post("/me/family", { name: "Mohan", age: 12, relation: "Beta" });
    const appt = await as(app, sita.token).post("/appointments", { doctorId: String(data.doctors[0]._id), date, villageId: String(rampur._id), familyMemberId: fam.body._id });
    expect(appt.status).toBe(201);

    const r = await as(app, kumar.token).post("/doctor/referrals", {
      appointmentId: appt.body._id,
      labId: shreeId(),
      testIds: await testIds(data.labs.shree, ["Thyroid (T3, T4, TSH)", "Lipid Profile"]),
    });
    expect(r.status).toBe(201);
    expect(r.body.source).toBe("doctor");
    expect(r.body.total).toBe(1250);
    expect(r.body.platformMargin).toBeUndefined();

    const mine = await as(app, sita.token).get("/me/bookings");
    const ref = mine.body.data.find((b) => b._id === r.body._id);
    expect(ref.referredBy.name).toBe("Dr. Anil Kumar");
    const appts = await as(app, sita.token).get("/me/appointments");
    expect(appts.body.data.find((a) => a._id === appt.body._id).referredBooking.code).toBe(r.body.code);

    expect((await as(app, kumar.token).post("/doctor/referrals", { appointmentId: appt.body._id, labId: shreeId(), testIds: await testIds(data.labs.shree, ["CBC"]) })).status).toBe(409);
    expect(appt.body.visitCode).toMatch(/^\d{4}$/);
    expect((await as(app, kumar.token).patch(`/doctor/appointments/${appt.body._id}/seen`, {})).status).toBe(400);
    expect((await as(app, kumar.token).patch(`/doctor/appointments/${appt.body._id}/seen`, { code: appt.body.visitCode })).body.status).toBe("seen");
    // Code disappears from the receipt once the visit is done
    const after = await as(app, sita.token).get("/me/appointments");
    expect(after.body.data.find((x) => x._id === appt.body._id).visitCode).toBeUndefined();
    expect((await as(app, kumar.token).patch(`/doctor/appointments/${appt.body._id}/no-show`)).status).toBe(409);
  });
});

describe("doctor visit code (receipt)", () => {
  test("wrong code is rejected; locks after 5; doctor never sees the code", async () => {
    const day = weekdayOf(todayIso());
    await as(app, kumar.token).patch("/doctor/schedule", { schedule: [{ day, start: "09:00", end: "17:00", maxTokens: 50 }] });
    const fam = await as(app, ram.token).post("/me/family", { name: "Lock Test", age: 30 });
    const appt = await as(app, ram.token).post("/appointments", { doctorId: String(data.doctors[0]._id), date: todayIso(), familyMemberId: fam.body._id });
    expect(appt.status).toBe(201);
    const list = await as(app, kumar.token).get("/doctor/appointments?when=today");
    const mine = list.body.data.find((a) => a._id === appt.body._id);
    expect(mine.visitCode).toBeUndefined();
    expect(mine.visitHash).toBeUndefined();

    const wrong = appt.body.visitCode === "0000" ? "1111" : "0000";
    for (let i = 1; i <= 4; i++) {
      const r = await as(app, kumar.token).patch(`/doctor/appointments/${appt.body._id}/seen`, { code: wrong });
      expect(r.body.error.code).toBe("WRONG_VISIT_CODE");
    }
    expect((await as(app, kumar.token).patch(`/doctor/appointments/${appt.body._id}/seen`, { code: wrong })).status).toBe(423);
    expect((await as(app, kumar.token).patch(`/doctor/appointments/${appt.body._id}/seen`, { code: appt.body.visitCode })).status).toBe(423);
  });
});

describe("lab price list", () => {
  test("lab can change price and availability; b2b follows; change is audited", async () => {
    const list = await as(app, jeevanStaff.token).get("/lab/tests");
    const widal = list.body.data.find((t) => t.name === "Widal");
    const r = await as(app, jeevanStaff.token).patch(`/lab/tests/${widal._id}`, { walkInPrice: 200 });
    expect(r.status).toBe(200);
    expect(r.body.listingPrice).toBe(200);
    expect(r.body.b2bPrice).toBe(140);
    const off = await as(app, jeevanStaff.token).patch(`/lab/tests/${widal._id}`, { active: false });
    expect(off.body.active).toBe(false);
    const pub = await as(app, ram.token).get(`/labs/${data.labs.jeevan._id}/tests`);
    expect(pub.body.data.find((t) => t.name === "Widal")).toBeUndefined();
    const audit = await as(app, admin.token).get(`/admin/audit?entityId=${widal._id}`);
    expect(audit.body.data[0].action).toBe("labtest.update");
    expect(audit.body.data.some((a) => a.before.walkInPrice === 150 && a.after.walkInPrice === 200)).toBe(true);
    // Shree staff cannot touch Jeevan's test
    expect((await as(app, shreeStaff.token).patch(`/lab/tests/${widal._id}`, { active: true })).status).toBe(404);
  });
});

describe("weekly settlement", () => {
  test("totals: sum of labPayout minus cash kept by collector", async () => {
    await Booking.deleteMany({});
    await Settlement.deleteMany({});
    const lab = as(app, shreeStaff.token);
    const make = async (names, paymentMode) => {
      const b = (await book(names)).body;
      await lab.patch(`/lab/bookings/${b._id}/confirm`, { collectionTime: "7" });
      const c = await lab.patch(`/lab/bookings/${b._id}/collect`, { otp: b.otp, paymentMode });
      expect(c.status).toBe(200);
      return b;
    };
    const b1 = await make(["CBC", "HbA1c"], "cash"); // total 950, payout 665
    const b2 = await make(["Lipid Profile"], "upi"); // total 650, payout 455
    const b3 = await make(["CBC"], "cash"); // total 449, payout 280
    const notCollected = (await book(["Vitamin D"])).body; // requested only

    const { start } = lastWeekRange();
    const lastWeek = new Date(start.getTime() + 2 * 86400 * 1000);
    await Booking.updateMany({ _id: { $in: [b1._id, b2._id, b3._id, notCollected._id] } }, { collectedAt: lastWeek });
    await Booking.updateOne({ _id: notCollected._id }, { $unset: { collectedAt: 1 } });

    const gen = await as(app, admin.token).post("/admin/settlements/generate", {});
    expect(gen.status).toBe(201);
    expect(gen.body.data).toHaveLength(1);
    const s = gen.body.data[0];
    expect(s.gross).toBe(950 + 650 + 449);
    expect(s.labPayout).toBe(665 + 455 + 280);
    expect(s.cashWithLab).toBe(950 + 449);
    expect(s.netPayable).toBe(665 + 455 + 280 - (950 + 449));
    expect(s.bookings).toHaveLength(3);

    // Idempotent
    const again = await as(app, admin.token).post("/admin/settlements/generate", {});
    expect(again.body.data[0]._id).toBe(s._id);
    expect(await Settlement.countDocuments()).toBe(1);

    // Lab sees its own settlement; agent cannot
    const labView = await lab.get("/lab/settlements");
    expect(labView.body.data[0].netPayable).toBe(s.netPayable);
    expect((await as(app, jeevanStaff.token).get("/lab/settlements")).body.data).toHaveLength(0);

    const paid = await as(app, admin.token).patch(`/admin/settlements/${s._id}/paid`, { reference: "UTR123456" });
    expect(paid.body.status).toBe("paid");
    expect((await as(app, admin.token).patch(`/admin/settlements/${s._id}/paid`, { reference: "UTR999" })).status).toBe(409);
  });

  test("dashboard stats are computed", async () => {
    const r = await as(app, admin.token).get("/admin/stats?days=14");
    expect(r.status).toBe(200);
    expect(r.body.bookingsPerDay).toHaveLength(14);
    expect(r.body.gmv).toBeGreaterThan(0);
    expect(r.body.platformMargin).toBeLessThan(r.body.gmv);
    expect(typeof r.body.repeatRate).toBe("number");
    expect(r.body.topVillages[0].name).toBe("Rampur");
  });
});

describe("lab hisaab (finance ledger)", () => {
  test("lab sees only its own ledger and the same totals as the admin", async () => {
    const lab = as(app, shreeStaff.token);
    const b = (await book(["CBC", "HbA1c"])).body;
    await lab.patch(`/lab/bookings/${b._id}/confirm`, { collectionTime: "7 baje" });
    expect((await lab.patch(`/lab/bookings/${b._id}/collect`, { otp: b.otp, paymentMode: "cash" })).status).toBe(200);

    const mine = await lab.get("/lab/finance");
    expect(mine.status).toBe(200);
    const row = mine.body.data.find((x) => x.code === b.code);
    expect(row.mode).toBe("cash");
    expect(row.commission).toBe(row.total - row.labPayout);
    expect(row.net).toBe(-row.commission); // cash: the lab owes the platform its commission

    const adminRow = (await as(app, admin.token).get("/admin/finance")).body.data.find((r) => String(r.lab._id) === shreeId());
    for (const k of ["bookings", "gross", "labEarning", "commission", "cashCollected", "onlineCollected", "labOwesUs", "weOweLab", "pendingNet"]) {
      expect(mine.body.totals[k]).toBe(adminRow[k]);
    }

    // Another lab never sees this booking
    const other = await as(app, jeevanStaff.token).get("/lab/finance");
    expect(other.body.data.some((x) => x.code === b.code)).toBe(false);
    // Bad range is rejected
    expect((await lab.get("/lab/finance?from=2026-02-10&to=2026-02-01")).status).toBe(400);
  });
});

describe("admin money overview", () => {
  test("amounts to pay and to collect are kept per lab, never netted across labs", async () => {
    const r = await as(app, admin.token).get("/admin/finance");
    expect(r.status).toBe(200);
    const t = r.body.totals;
    const pay = r.body.data.filter((d) => d.pendingNet > 0).reduce((s, d) => s + d.pendingNet, 0);
    const collect = r.body.data.filter((d) => d.pendingNet < 0).reduce((s, d) => s - d.pendingNet, 0);
    expect(t.payToLabs).toBe(pay);
    expect(t.collectFromLabs).toBe(collect);
    expect(t.payToLabs - t.collectFromLabs).toBe(t.pendingNet);
  });

  test("admin can create an agent and sees it in the agents list", async () => {
    const adm = as(app, admin.token);
    const c = await adm.post("/admin/users", { name: "Naya Agent", email: "naya.agent@nidaansetu.test", role: "agent" });
    expect(c.status).toBe(201);
    expect(c.body.tempPassword).toBeTruthy();
    const list = await adm.get("/admin/agents");
    const a = list.body.data.find((x) => x.email === "naya.agent@nidaansetu.test");
    expect(a).toMatchObject({ labs: 0, doctors: 0, status: "active" });
    // Lab staff cannot see it
    expect((await as(app, shreeStaff.token).get("/admin/agents")).status).toBe(403);
  });
});

// ---------- M2: clinic sample pickup ----------
describe("clinic pickup pricing", () => {
  const lab = { collectionFee: 49, clinicPickupFee: 20, freeCollectionAbove: 499 };
  const tests = (...prices) => prices.map((p, i) => ({ _id: String(i), name: `T${i}`, listingPrice: p, b2bPrice: Math.round(p * 0.7) }));

  test("home uses collectionFee, clinic uses clinicPickupFee", () => {
    expect(priceBooking(lab, tests(300)).collectionFee).toBe(49);
    expect(priceBooking(lab, tests(300), "home").total).toBe(349);
    const clinic = priceBooking(lab, tests(300), "clinic");
    expect(clinic.collectionFee).toBe(20);
    expect(clinic.total).toBe(320);
    expect(clinic.platformMargin).toBe(320 - 210);
  });

  test("free above the threshold for both, and clinicPickupFee defaults to 0", () => {
    expect(priceBooking(lab, tests(300, 200), "clinic").collectionFee).toBe(0);
    expect(priceBooking(lab, tests(300, 200), "home").collectionFee).toBe(0);
    expect(priceBooking({ collectionFee: 49, freeCollectionAbove: 499 }, tests(300), "clinic").collectionFee).toBe(0);
  });
});

describe("doctor sample requests (clinic pickup)", () => {
  const shreeTests = (names) => testIds(data.labs.shree, names);
  const walkIn = async (extra = {}) =>
    as(app, kumar.token).post("/doctor/sample-requests", {
      walkIn: { name: "Kamla Devi", age: 60, gender: "female" },
      labId: shreeId(),
      testIds: await shreeTests(["CBC"]),
      note: "Khaali pet",
      ...extra,
    });

  test("clinic labs: labs that serve the doctor's clinic only", async () => {
    const r = await as(app, kumar.token).get("/doctor/clinic-labs");
    expect(r.status).toBe(200);
    const names = r.body.data.map((l) => l.name);
    expect(names).toContain(data.labs.shree.name);
    expect(names).not.toContain(data.labs.jeevan.name);
  });

  test("walk-in clinic request: no account, clinic filled from the doctor, OTP for the doctor, clinic fee", async () => {
    await Lab.updateOne({ _id: data.labs.shree._id }, { clinicPickupFee: 25 });
    const r = await walkIn();
    await Lab.updateOne({ _id: data.labs.shree._id }, { clinicPickupFee: 0 });
    expect(r.status).toBe(201);
    expect(r.body.collectionPoint).toBe("clinic");
    expect(r.body.patient).toBeUndefined();
    expect(r.body.walkIn.name).toBe("Kamla Devi");
    expect(r.body.patientName).toBe("Kamla Devi");
    expect(r.body.clinic.name).toBe("Kumar Clinic");
    expect(r.body.clinic.location.coordinates).toEqual(data.doctors[0].location.coordinates);
    expect(r.body.otp).toMatch(/^\d{4}$/);
    expect(r.body.collectionFee).toBe(25);
    expect(r.body.total).toBe(425);
    expect(r.body.consent).toBe(true);
    expect(r.body.labPayout).toBeUndefined();
    expect(r.body.platformMargin).toBeUndefined();
  });

  test("a walk-in without a name is rejected", async () => {
    const r = await walkIn({ walkIn: { age: 40 } });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_ERROR");
    expect(r.body.error.details.map((d) => d.path)).toContain("walkIn.name");
    const blank = await walkIn({ walkIn: { name: " " } });
    expect(blank.status).toBe(400);
  });

  test("needs exactly one of appointment or walk-in; home pickup needs an account", async () => {
    const neither = await as(app, kumar.token).post("/doctor/sample-requests", { labId: shreeId(), testIds: await shreeTests(["CBC"]) });
    expect(neither.status).toBe(400);
    const home = await walkIn({ collectionPoint: "home" });
    expect(home.status).toBe(400);
    expect(home.body.error.code).toBe("NEEDS_ACCOUNT");
  });

  test("a lab that does not serve the clinic is refused", async () => {
    const r = await walkIn({ labId: String(data.labs.jeevan._id), testIds: await testIds(data.labs.jeevan, ["CBC"]) });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("OUT_OF_RANGE");
  });

  test("schema: patient is optional only with walkIn.name", async () => {
    const b = new Booking({ code: "NS000001", lab: data.labs.shree._id, date: tomorrow(), collectionPoint: "clinic" });
    const err = b.validateSync();
    expect(err.errors.patient).toBeDefined();
    b.walkIn = { name: "Someone" };
    expect(b.validateSync()?.errors?.patient).toBeUndefined();
    const home = new Booking({ code: "NS000002", lab: data.labs.shree._id, date: tomorrow(), patient: ram.user._id });
    expect(home.validateSync().errors.village).toBeDefined(); // home collection needs a village
  });

  test("from an appointment: patient sees it with the OTP; lab collects with the doctor-shown OTP; report goes back to the doctor", async () => {
    const date = nextDateOn(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    // A family member, so this never clashes with a token Sita took in an earlier test
    const fam = await as(app, sita.token).post("/me/family", { name: "Sita ki Maa", age: 70 });
    const appt = await as(app, sita.token).post("/appointments", { doctorId: String(data.doctors[0]._id), date, familyMemberId: fam.body._id });
    expect(appt.status).toBe(201);
    const r = await as(app, kumar.token).post("/doctor/sample-requests", { appointmentId: appt.body._id, labId: shreeId(), testIds: await shreeTests(["CBC", "HbA1c"]) });
    expect(r.status).toBe(201);
    expect(r.body.collectionPoint).toBe("clinic");
    const doctorOtp = r.body.otp;
    expect((await Appointment.findById(appt.body._id)).referredBooking.toString()).toBe(r.body._id);
    // Only one request per appointment
    const again = await as(app, kumar.token).post("/doctor/sample-requests", { appointmentId: appt.body._id, labId: shreeId(), testIds: await shreeTests(["CBC"]) });
    expect(again.body.error.code).toBe("ALREADY_REFERRED");

    // The patient (has an account) sees the same OTP in My bookings
    const mine = await as(app, sita.token).get("/me/bookings");
    const own = mine.body.data.find((b) => b._id === r.body._id);
    expect(own.collectionPoint).toBe("clinic");
    expect(own.otp).toBe(doctorOtp);

    // Lab: grouped by clinic, never with the OTP
    const lab = as(app, shreeStaff.token);
    const groups = await lab.get("/lab/clinic-pickups");
    expect(groups.status).toBe(200);
    const kumarGroup = groups.body.data.find((g) => g.clinic.name === "Kumar Clinic");
    expect(kumarGroup.waiting).toBeGreaterThanOrEqual(1);
    expect(kumarGroup.bookings.some((b) => b._id === r.body._id)).toBe(true);
    expect(JSON.stringify(groups.body)).not.toMatch(/"otp"/);
    const onlyClinic = await lab.get("/lab/bookings?collectionPoint=clinic");
    expect(onlyClinic.body.data.every((b) => b.collectionPoint === "clinic")).toBe(true);

    // Same confirm -> collect -> report flow as home bookings
    expect((await lab.patch(`/lab/bookings/${r.body._id}/confirm`, { collectionTime: "10-12" })).status).toBe(200);
    const collected = await lab.patch(`/lab/bookings/${r.body._id}/collect`, { otp: doctorOtp });
    expect(collected.status).toBe(200);
    expect(collected.body.otp).toBeUndefined();
    expect((await lab.upload(`/lab/bookings/${r.body._id}/report`, "report", PDF, "r.pdf", "application/pdf")).status).toBe(200);

    // Doctor's "Lab requests": report ready, OTP gone, report opens; another doctor gets 404
    const list = await as(app, kumar.token).get("/doctor/sample-requests");
    const row = list.body.data.find((b) => b._id === r.body._id);
    expect(row.status).toBe("report_ready");
    expect(row.otp).toBeUndefined();
    expect((await as(app, kumar.token).get(`/bookings/${r.body._id}/report`)).status).toBe(200);
    expect((await as(app, devi.token).get(`/bookings/${r.body._id}/report`)).status).toBe(404);
    // And the patient can open it too
    expect((await as(app, sita.token).get(`/bookings/${r.body._id}/report`)).status).toBe(200);
  });
});

describe("demo seed", () => {
  test("seedDemoActivity creates the expo bookings", async () => {
    const { seedDemoActivity } = await import("../src/scripts/seed.js");
    const before = await Booking.countDocuments();
    const r = await seedDemoActivity(data);
    expect(r.bookings - before).toBe(4);
    expect(r.home.status).toBe("confirmed");
    expect(r.home.location.coordinates).toHaveLength(2);
    expect(r.fromAppt.collectionPoint).toBe("clinic");
    expect(r.done.status).toBe("report_ready");
    const clinic = await Booking.find({ "clinic.doctor": data.doctors[0]._id, lab: data.labs.shree._id, _id: { $gte: r.home._id } });
    expect(clinic).toHaveLength(2);
    expect(clinic.some((b) => b.walkIn?.name && !b.patient)).toBe(true);
  });
});
