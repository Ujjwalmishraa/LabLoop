import request from "supertest";
import { PDF, as, login, nextDateOn, seed, startTestApp, stopTestApp, testIds, tomorrow, village } from "./helpers.js";
import { Booking } from "../src/models/index.js";

let app, data, admin, agent, shreeStaff, jeevanStaff, kumar, devi, ram, sita;

beforeAll(async () => {
  app = await startTestApp();
  data = await seed();
  [admin, agent, shreeStaff, jeevanStaff, kumar, devi, ram, sita] = await Promise.all(
    [
      "admin@nidaansetu.test",
      "agent@nidaansetu.test",
      "lab.shree@nidaansetu.test",
      "lab.jeevan@nidaansetu.test",
      "dr.kumar@nidaansetu.test",
      "dr.devi@nidaansetu.test",
      "9876500001",
      "9876500002",
    ].map((id) => login(app, id))
  );
});
afterAll(stopTestApp);

async function bookShree(patient = ram) {
  const rampur = await village("Rampur");
  const r = await as(app, patient.token).post("/bookings", {
    labId: String(data.labs.shree._id),
    testIds: await testIds(data.labs.shree, ["CBC", "HbA1c"]),
    villageId: String(rampur._id),
    address: "Mandir ke paas",
    date: tomorrow(),
    slot: "Subah 6-8",
    consent: true,
  });
  expect(r.status).toBe(201);
  return r.body;
}

describe("agent", () => {
  test("cannot create agents", async () => {
    const r = await as(app, agent.token).post("/admin/users", { name: "Agent Two", email: "a2@x.in", role: "agent" });
    expect(r.status).toBe(403);
  });

  test("cannot see finance: stats, settlements, margins", async () => {
    for (const p of ["/admin/stats", "/admin/settlements", "/admin/bookings", "/admin/audit", "/lab/settlements"]) {
      expect((await as(app, agent.token).get(p)).status).toBe(403);
    }
    await bookShree();
    const r = await as(app, agent.token).get("/agent/bookings");
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeGreaterThan(0);
    for (const b of r.body.data) {
      expect(b.labPayout).toBeUndefined();
      expect(b.platformMargin).toBeUndefined();
      expect(b.otpHash).toBeUndefined();
    }
  });

  test("can only edit labs and doctors it onboarded (others are 404)", async () => {
    const created = await as(app, admin.token).post("/admin/users", { name: "Agent Two", email: "agent2@x.in", role: "agent" });
    expect(created.status).toBe(201);
    const first = await login(app, "agent2@x.in", created.body.tempPassword);
    const changed = await as(app, first.token).post("/auth/change-password", { currentPassword: created.body.tempPassword, newPassword: "AgentTwo2026" });
    const agent2 = changed.body.accessToken;

    const shree = String(data.labs.shree._id);
    expect((await as(app, agent2).patch(`/agent/labs/${shree}`, { status: "disabled" })).status).toBe(404);
    expect((await as(app, agent2).post(`/agent/labs/${shree}/staff`, { name: "Xavier", email: "x@x.in" })).status).toBe(404);
    expect((await as(app, agent2).patch(`/agent/doctors/${data.doctors[0]._id}`, { fee: 1 })).status).toBe(404);
    const mine = await as(app, agent2).get("/agent/my-onboarded?type=lab");
    expect(mine.body.data).toHaveLength(0);
    expect((await as(app, agent2).get("/agent/bookings")).body.data).toHaveLength(0);

    // The owning agent can.
    expect((await as(app, agent.token).patch(`/agent/doctors/${data.doctors[0]._id}`, { fee: 320 })).body.fee).toBe(320);
  });
});

describe("delete and switch-off are admin-only", () => {
  test("agent can edit but not disable its own lab/doctor; admin can", async () => {
    const shree = String(data.labs.shree._id);
    const r = await as(app, agent.token).patch(`/agent/labs/${shree}`, { status: "disabled" });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("ADMIN_ONLY");
    expect((await as(app, agent.token).patch(`/agent/labs/${shree}`, { phone: "9000000009" })).status).toBe(200);
    expect((await as(app, agent.token).patch(`/agent/doctors/${data.doctors[2]._id}`, { status: "disabled" })).status).toBe(403);
    expect((await as(app, agent.token).del(`/admin/labs/${shree}`)).status).toBe(403);

    // Admin disabling a doctor also blocks the doctor's login
    expect((await as(app, admin.token).patch(`/agent/doctors/${data.doctors[2]._id}`, { status: "disabled" })).body.status).toBe("disabled");
    const blocked = await request(app).post("/api/v1/auth/login").send({ identifier: "dr.singh@nidaansetu.test", password: "Nidaan@2026" });
    expect(blocked.status).toBe(403);
    await as(app, admin.token).patch(`/agent/doctors/${data.doctors[2]._id}`, { status: "active" });
  });

  test("admin can delete a lab/doctor without history; with history it is refused", async () => {
    await bookShree();
    const withHistory = await as(app, admin.token).del(`/admin/labs/${data.labs.shree._id}`);
    expect(withHistory.status).toBe(409);
    expect(withHistory.body.error.code).toBe("HAS_HISTORY");

    const lab = await as(app, agent.token).post("/agent/labs", { name: "Galat Lab", lat: 26.11, lng: 84.5 });
    await as(app, agent.token).post(`/agent/labs/${lab.body._id}/staff`, { name: "Galat Staff", email: "galat@lab.in" });
    const del = await as(app, admin.token).del(`/admin/labs/${lab.body._id}`);
    expect(del.status).toBe(200);
    const login = await request(app).post("/api/v1/auth/login").send({ identifier: "galat@lab.in", password: "whatever1" });
    expect(login.status).toBe(401);

    const doc = await as(app, agent.token).post("/agent/doctors", { name: "Dr Galat", email: "galat@doc.in", specialty: "General Physician", lat: 26.11, lng: 84.5 });
    expect((await as(app, admin.token).del(`/admin/doctors/${doc.body.doctor._id}`)).status).toBe(200);
    const audit = await as(app, admin.token).get("/admin/audit?action=lab.delete");
    expect(audit.body.data[0].before.name).toBe("Galat Lab");
  });
});

describe("lab staff", () => {
  test("cannot read or act on another lab's booking", async () => {
    const b = await bookShree();
    const list = await as(app, jeevanStaff.token).get("/lab/bookings");
    expect(list.body.data.find((x) => x._id === b._id)).toBeUndefined();
    expect((await as(app, jeevanStaff.token).patch(`/lab/bookings/${b._id}/confirm`, { collectionTime: "8 baje" })).status).toBe(404);
    expect((await as(app, jeevanStaff.token).patch(`/lab/bookings/${b._id}/collect`, { otp: "1234" })).status).toBe(404);
    expect((await as(app, jeevanStaff.token).get(`/bookings/${b._id}/report`)).status).toBe(404);
  });

  test("never sees the OTP or platform margin", async () => {
    await bookShree();
    const list = await as(app, shreeStaff.token).get("/lab/bookings");
    for (const b of list.body.data) {
      expect(b.otp).toBeUndefined();
      expect(b.otpHash).toBeUndefined();
      expect(b.platformMargin).toBeUndefined();
    }
  });

  test("cannot use doctor, agent or admin routes", async () => {
    expect((await as(app, shreeStaff.token).get("/doctor/appointments")).status).toBe(403);
    expect((await as(app, shreeStaff.token).post("/agent/villages", { name: "X", block: "Y", lat: 1, lng: 1 })).status).toBe(403);
    expect((await as(app, shreeStaff.token).get("/admin/users")).status).toBe(403);
  });
});

describe("doctor", () => {
  test("cannot read or update another doctor's appointments", async () => {
    const date = nextDateOn(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    const a = await as(app, ram.token).post("/appointments", { doctorId: String(data.doctors[0]._id), date });
    expect(a.status).toBe(201);
    const deviList = await as(app, devi.token).get("/doctor/appointments");
    expect(deviList.body.data.find((x) => x._id === a.body._id)).toBeUndefined();
    expect((await as(app, devi.token).patch(`/doctor/appointments/${a.body._id}/seen`, { code: a.body.visitCode })).status).toBe(404);
    expect((await as(app, devi.token).post("/doctor/referrals", { appointmentId: a.body._id, labId: String(data.labs.shree._id), testIds: await testIds(data.labs.shree, ["CBC"]) })).status).toBe(404);
    const kumarList = await as(app, kumar.token).get("/doctor/appointments");
    expect(kumarList.body.data.find((x) => x._id === a.body._id)).toBeDefined();
  });
});

describe("patient", () => {
  test("cannot read another patient's booking, report or appointment", async () => {
    const b = await bookShree(ram);
    // Walk it to report_ready
    await as(app, shreeStaff.token).patch(`/lab/bookings/${b._id}/confirm`, { collectionTime: "Subah 7 baje" });
    await as(app, shreeStaff.token).patch(`/lab/bookings/${b._id}/collect`, { otp: b.otp });
    const up = await as(app, shreeStaff.token).upload(`/lab/bookings/${b._id}/report`, "report", PDF, "cbc.pdf", "application/pdf");
    expect(up.status).toBe(200);
    expect(up.body.status).toBe("report_ready");
    expect(up.body.report.key).toBeUndefined();

    expect((await as(app, sita.token).get(`/bookings/${b._id}/report`)).status).toBe(404);
    expect((await as(app, sita.token).post(`/bookings/${b._id}/cancel`, {})).status).toBe(404);
    const sitaList = await as(app, sita.token).get("/me/bookings");
    expect(sitaList.body.data.find((x) => x._id === b._id)).toBeUndefined();

    // Owner gets a short-lived signed URL that serves the file; a tampered one does not.
    const own = await as(app, ram.token).get(`/bookings/${b._id}/report`);
    expect(own.status).toBe(200);
    expect(own.body.expiresInSec).toBe(600);
    const url = new URL(own.body.url);
    const file = await request(app).get(url.pathname + url.search);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toMatch(/application\/pdf/);
    expect(file.headers["cache-control"]).toMatch(/no-store/);
    url.searchParams.set("exp", String(Number(url.searchParams.get("exp")) + 1000));
    expect((await request(app).get(url.pathname + url.search)).status).toBe(404);

    // The lab that did the test may also open it; admin too.
    expect((await as(app, shreeStaff.token).get(`/bookings/${b._id}/report`)).status).toBe(200);
    expect((await as(app, admin.token).get(`/bookings/${b._id}/report`)).status).toBe(200);
    // An unrelated doctor may not.
    expect((await as(app, devi.token).get(`/bookings/${b._id}/report`)).status).toBe(404);
  });

  test("patient bookings never expose otpHash or internal prices", async () => {
    const b = await bookShree(ram);
    expect(b.otp).toMatch(/^\d{4}$/);
    expect(b.otpHash).toBeUndefined();
    expect(b.labPayout).toBeUndefined();
    expect(b.platformMargin).toBeUndefined();
    expect(b.items[0].b2bPrice).toBeUndefined();
    const raw = await Booking.findById(b._id);
    expect(raw.otpHash).not.toContain(b.otp);
  });

  test("cannot use staff routes", async () => {
    for (const p of ["/lab/bookings", "/doctor/appointments", "/agent/my-onboarded", "/admin/users"]) {
      expect((await as(app, ram.token).get(p)).status).toBe(403);
    }
  });
});

describe("clinic sample requests", () => {
  const request = async (doctor, extra = {}) =>
    as(app, doctor.token).post("/doctor/sample-requests", {
      walkIn: { name: "Walk In" },
      labId: String(data.labs.shree._id),
      testIds: await testIds(data.labs.shree, ["CBC"]),
      ...extra,
    });

  test("a doctor can't use another doctor's appointment, and only sees their own requests", async () => {
    const date = nextDateOn(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    const fam = await as(app, ram.token).post("/me/family", { name: "Ram ka Beta", age: 12 });
    const a = await as(app, ram.token).post("/appointments", { doctorId: String(data.doctors[0]._id), date, familyMemberId: fam.body._id });
    expect(a.status).toBe(201);
    const r = await request(devi, { walkIn: undefined, appointmentId: a.body._id });
    expect(r.status).toBe(404);
    const mine = await request(kumar);
    expect(mine.status).toBe(201);
    const deviList = await as(app, devi.token).get("/doctor/sample-requests");
    expect(deviList.body.data.some((b) => b._id === mine.body._id)).toBe(false);
  });

  test("lab staff only see their own lab's clinic pickups, and never the OTP", async () => {
    const mine = await request(kumar);
    expect(mine.status).toBe(201);
    const jeevan = await as(app, jeevanStaff.token).get("/lab/clinic-pickups");
    expect(jeevan.status).toBe(200);
    expect(JSON.stringify(jeevan.body)).not.toContain(mine.body._id);
    expect((await as(app, jeevanStaff.token).patch(`/lab/bookings/${mine.body._id}/confirm`, { collectionTime: "08-10" })).status).toBe(404);
    const shree = await as(app, shreeStaff.token).get("/lab/clinic-pickups");
    expect(JSON.stringify(shree.body)).toContain(mine.body._id);
    expect(JSON.stringify(shree.body)).not.toContain(`"otp":"${mine.body.otp}"`);
    expect(JSON.stringify(shree.body)).not.toMatch(/"otp"/);
  });

  test("patients and lab staff can't create sample requests", async () => {
    expect((await request(ram)).status).toBe(403);
    expect((await request(shreeStaff)).status).toBe(403);
    expect((await as(app, ram.token).get("/lab/clinic-pickups")).status).toBe(403);
  });
});
