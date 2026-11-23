import request from "supertest";
import { API, PASSWORD, as, login, seed, startTestApp, stopTestApp } from "./helpers.js";
import { User } from "../src/models/index.js";
import { outbox } from "../src/lib/mailer.js";

let app;
let admin;
let agent;

beforeAll(async () => {
  app = await startTestApp();
  await seed();
  admin = await login(app, "admin@nidaansetu.test");
  agent = await login(app, "agent@nidaansetu.test");
});
afterAll(stopTestApp);

const signup = (body) => request(app).post(`${API}/auth/signup`).send(body);

describe("patient sign-up", () => {
  test("creates a patient, returns an access token and an httpOnly refresh cookie, no secrets", async () => {
    const r = await signup({ name: "Gita Kumari", phone: "9123400001", password: "gaon1234" });
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe("patient");
    expect(r.body.accessToken).toEqual(expect.any(String));
    expect(r.body.user.passwordHash).toBeUndefined();
    expect(r.body.user.tokenVersion).toBeUndefined();
    const cookie = r.headers["set-cookie"].join(";");
    expect(cookie).toMatch(/ns_refresh=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(JSON.stringify(r.body)).not.toMatch(/ns_refresh|\$2b\$/);
  });

  test("a role field in the body is ignored: role doctor still creates a patient", async () => {
    const r = await signup({ name: "Fake Doctor", phone: "9123400002", password: "gaon1234", role: "doctor", status: "active", mustChangePassword: false });
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe("patient");
    const u = await User.findById(r.body.user._id);
    expect(u.role).toBe("patient");
    expect(u.doctor).toBeUndefined();
  });

  test("role super_admin is also ignored", async () => {
    const r = await signup({ name: "Sneaky", phone: "9123400003", password: "gaon1234", role: "super_admin" });
    expect(r.body.user.role).toBe("patient");
  });

  test("duplicate mobile is rejected with a Hindi message", async () => {
    const r = await signup({ name: "Again", phone: "9123400001", password: "gaon1234" });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/पहले से रजिस्टर्ड/);
  });

  test("weak password and bad phone are rejected with field errors", async () => {
    const r1 = await signup({ name: "Weak", phone: "9123400009", password: "123" });
    expect(r1.status).toBe(400);
    expect(r1.body.error.code).toBe("VALIDATION_ERROR");
    const r2 = await signup({ name: "Bad", phone: "12345", password: "gaon1234" });
    expect(r2.status).toBe(400);
  });
});

describe("doctors cannot self-register", () => {
  test("doctor creation endpoint needs agent or super_admin", async () => {
    const body = { name: "Dr Self", email: "self@x.in", specialty: "General Physician", lat: 26.1, lng: 84.5 };
    expect((await request(app).post(`${API}/agent/doctors`).send(body)).status).toBe(401);
    const patient = await login(app, "9876500001");
    const r = await as(app, patient.token).post("/agent/doctors", body);
    expect(r.status).toBe(403);
    expect(await User.exists({ email: "self@x.in" })).toBeNull();
  });

  test("there is no other public route that creates accounts", async () => {
    for (const p of ["/auth/register", "/doctors", "/users", "/auth/signup/doctor"]) {
      const r = await request(app).post(API + p).send({ name: "x", email: "y@z.in", password: "abcd1234", role: "doctor" });
      expect([401, 403, 404]).toContain(r.status);
    }
  });
});

describe("login", () => {
  test("by mobile (patient) and by email (staff)", async () => {
    expect((await login(app, "9876500001")).user.role).toBe("patient");
    expect((await login(app, "dr.kumar@nidaansetu.test")).user.role).toBe("doctor");
  });

  test("wrong password is rejected", async () => {
    const r = await request(app).post(`${API}/auth/login`).send({ identifier: "9876500001", password: "wrong12345" });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  test("disabled user cannot log in and existing tokens stop working", async () => {
    const victim = await login(app, "9876500002");
    expect((await as(app, victim.token).get("/auth/me")).status).toBe(200);

    const r = await as(app, admin.token).patch(`/admin/users/${victim.user._id}/status`, { status: "disabled" });
    expect(r.status).toBe(200);

    expect((await as(app, victim.token).get("/auth/me")).status).toBe(401);
    const refresh = await request(app).post(`${API}/auth/refresh`).set("Cookie", victim.cookie);
    expect(refresh.status).toBe(401);
    const again = await request(app).post(`${API}/auth/login`).send({ identifier: "9876500002", password: PASSWORD });
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe("ACCOUNT_DISABLED");

    await as(app, admin.token).patch(`/admin/users/${victim.user._id}/status`, { status: "active" });
    expect((await login(app, "9876500002")).user.status).toBe("active");
  });
});

describe("forced password change for accounts created by agent/admin", () => {
  test("lab staff must change temp password before using the panel", async () => {
    const labs = await as(app, agent.token).get("/agent/my-onboarded?type=lab");
    const labId = labs.body.data[0]._id;
    const created = await as(app, agent.token).post(`/agent/labs/${labId}/staff`, { name: "New Collector", email: "Collector@Lab.in" });
    expect(created.status).toBe(201);
    expect(created.body.user.mustChangePassword).toBe(true);
    expect(created.body.user.email).toBe("collector@lab.in");
    const temp = created.body.tempPassword;
    expect(outbox.some((m) => m.to === "collector@lab.in" && m.text.includes(temp))).toBe(true);

    const s = await login(app, "collector@lab.in", temp);
    expect(s.user.mustChangePassword).toBe(true);
    const blocked = await as(app, s.token).get("/lab/bookings");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const bad = await as(app, s.token).post("/auth/change-password", { currentPassword: "nope", newPassword: "Collect0r2026" });
    expect(bad.status).toBe(400);
    const ok = await as(app, s.token).post("/auth/change-password", { currentPassword: temp, newPassword: "Collect0r2026" });
    expect(ok.status).toBe(200);
    expect(ok.body.user.mustChangePassword).toBe(false);

    // Old token is revoked (tokenVersion bumped); the new one works.
    expect((await as(app, s.token).get("/lab/bookings")).status).toBe(401);
    expect((await as(app, ok.body.accessToken).get("/lab/bookings")).status).toBe(200);
    expect((await login(app, "collector@lab.in", "Collect0r2026")).user.role).toBe("lab_staff");
  });

  test("duplicate staff email is rejected", async () => {
    const labs = await as(app, agent.token).get("/agent/my-onboarded?type=lab");
    const r = await as(app, agent.token).post(`/agent/labs/${labs.body.data[0]._id}/staff`, { name: "Dup", email: "dr.kumar@nidaansetu.test" });
    expect(r.status).toBe(409);
  });
});

describe("refresh tokens", () => {
  test("rotate on use; reusing an old one revokes the session family", async () => {
    const s = await login(app, "9876500001");
    const r1 = await request(app).post(`${API}/auth/refresh`).set("Cookie", s.cookie);
    expect(r1.status).toBe(200);
    expect(r1.body.accessToken).toEqual(expect.any(String));
    const newCookie = r1.headers["set-cookie"];

    const reuse = await request(app).post(`${API}/auth/refresh`).set("Cookie", s.cookie);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("REFRESH_REUSED");
    // The rotated token was in the same family, so it is dead too.
    expect((await request(app).post(`${API}/auth/refresh`).set("Cookie", newCookie)).status).toBe(401);
  });

  test("logout revokes the refresh token", async () => {
    const s = await login(app, "9876500001");
    expect((await request(app).post(`${API}/auth/logout`).set("Cookie", s.cookie)).status).toBe(200);
    expect((await request(app).post(`${API}/auth/refresh`).set("Cookie", s.cookie)).status).toBe(401);
  });
});

describe("forgot / reset password", () => {
  test("emails a one-time link; unknown emails get the same answer", async () => {
    const unknown = await request(app).post(`${API}/auth/forgot-password`).send({ email: "nobody@x.in" });
    expect(unknown.status).toBe(200);

    outbox.length = 0;
    const r = await request(app).post(`${API}/auth/forgot-password`).send({ email: "dr.devi@nidaansetu.test" });
    expect(r.body.message).toBe(unknown.body.message);
    const token = outbox[0].text.match(/token=([\w-]+)/)[1];

    const reset = await request(app).post(`${API}/auth/reset-password`).send({ token, password: "NewPass2026" });
    expect(reset.status).toBe(200);
    expect((await login(app, "dr.devi@nidaansetu.test", "NewPass2026")).user.role).toBe("doctor");
    const reuse = await request(app).post(`${API}/auth/reset-password`).send({ token, password: "Another2026" });
    expect(reuse.status).toBe(400);
  });
});

describe("audit log", () => {
  test("user management actions are recorded", async () => {
    const r = await as(app, admin.token).get("/admin/audit?action=user.");
    const actions = r.body.data.map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["user.create", "user.disable", "user.enable", "user.signup"]));
    const disable = r.body.data.find((a) => a.action === "user.disable");
    expect(disable.before.status).toBe("active");
    expect(disable.after.status).toBe("disabled");
    expect(disable.actor.role).toBe("super_admin");
  });
});
