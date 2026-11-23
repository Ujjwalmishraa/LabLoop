import request from "supertest";
import { API, as, login, seed, startTestApp, stopTestApp, testIds, tomorrow, village, PASSWORD } from "./helpers.js";
import { User } from "../src/models/index.js";
import { pickLang, translateText } from "../src/lib/i18n.js";
import { credentialsMail, resetMail } from "../src/lib/mailer.js";

let app, data, ram;
const devanagari = /[ऀ-ॿ]/;

beforeAll(async () => {
  app = await startTestApp();
  data = await seed();
  ram = await login(app, "9876500001");
});
afterAll(stopTestApp);

// Same request in both languages: same status and code, message in the asked language.
async function both(send) {
  const hi = await send("hi");
  const en = await send("en");
  expect(hi.status).toBe(en.status);
  expect(hi.body.error.code).toBe(en.body.error.code);
  expect(hi.body.error.message).toMatch(devanagari);
  expect(en.body.error.message).not.toMatch(devanagari);
  return { hi: hi.body.error, en: en.body.error };
}

describe("Accept-Language", () => {
  test("pickLang reads the header and defaults to Hindi", () => {
    expect(pickLang("en")).toBe("en");
    expect(pickLang("en-IN,en;q=0.9")).toBe("en");
    expect(pickLang("hi-IN")).toBe("hi");
    expect(pickLang("fr")).toBe("hi");
    expect(pickLang(undefined)).toBe("hi");
  });

  test("wrong password: same code, message in each language", async () => {
    const r = await both((lang) => request(app).post(`${API}/auth/login`).set("Accept-Language", lang).send({ identifier: "9876500001", password: "wrong12345" }));
    expect(r.en.code).toBe("INVALID_CREDENTIALS");
    expect(r.en.message).toBe("Wrong mobile/email or password");
  });

  test("minimum order keeps the amount in both languages", async () => {
    const rampur = await village("Rampur");
    const ids = await testIds(data.labs.shree, ["Sugar Fasting", "Sugar PP"]);
    const r = await both((lang) =>
      as(app, ram.token)
        .post("/bookings", { labId: String(data.labs.shree._id), testIds: ids, villageId: String(rampur._id), address: "Ward 4", date: tomorrow(), slot: "06-08", consent: true })
        .set("Accept-Language", lang)
    );
    expect(r.en.code).toBe("MIN_ORDER");
    expect(r.en.message).toBe("Please book tests worth at least ₹199");
    expect(r.hi.message).toBe("कम से कम ₹199 की जाँच बुक करें");
  });

  test("validation errors keep details[].path and translate the message", async () => {
    const r = await both((lang) => request(app).post(`${API}/auth/signup`).set("Accept-Language", lang).send({ name: "A", phone: "123", password: "x" }));
    expect(r.en.code).toBe("VALIDATION_ERROR");
    expect(r.en.details.map((d) => d.path).sort()).toEqual(r.hi.details.map((d) => d.path).sort());
    expect(r.en.details.find((d) => d.path === "phone").message).toBe("Enter a valid 10-digit mobile number");
  });

  test("unknown route and link expired are translated", async () => {
    const nf = await both((lang) => request(app).get(`${API}/nope`).set("Accept-Language", lang));
    expect(nf.en.message).toBe("This route was not found");
    const exp = await both((lang) => request(app).get(`${API}/files/abc?exp=1&sig=x`).set("Accept-Language", lang));
    expect(exp.en.code).toBe("LINK_EXPIRED");
  });

  test("templates fill numbers into the translation", () => {
    expect(translateText("en", "OTP galat hai. 3 koshish baaki.")).toBe("Wrong OTP. 3 tries left.");
    expect(translateText("hi", "OTP galat hai. 3 koshish baaki.")).toBe("OTP गलत है। 3 कोशिश बाकी।");
    expect(translateText("en", "something unknown")).toBeNull();
  });
});

describe("saved language", () => {
  test("PATCH /auth/me/lang saves the language for any role; /auth/me returns it", async () => {
    const lab = await login(app, "lab.shree@nidaansetu.test");
    const r = await as(app, lab.token).patch("/auth/me/lang", { lang: "en" });
    expect(r.status).toBe(200);
    expect(r.body.lang).toBe("en");
    const me = await as(app, lab.token).get("/auth/me");
    expect(me.body.user.lang).toBe("en");
    expect((await as(app, lab.token).patch("/auth/me/lang", { lang: "fr" })).status).toBe(400);
  });

  test("patients can set lang with PATCH /me; sign-up stores the request language", async () => {
    const r = await as(app, ram.token).patch("/me", { lang: "en" });
    expect(r.status).toBe(200);
    expect(r.body.user.lang).toBe("en");
    const s = await request(app).post(`${API}/auth/signup`).set("Accept-Language", "en").send({ name: "Eng User", phone: "9123499999", password: PASSWORD });
    expect(s.status).toBe(201);
    expect((await User.findById(s.body.user._id)).lang).toBe("en");
  });

  test("emails are written in the user's language", () => {
    const en = credentialsMail({ name: "A", email: "a@x.in", password: "Pw@1234", role: "lab_staff", lang: "en" });
    const hi = credentialsMail({ name: "A", email: "a@x.in", password: "Pw@1234", role: "lab_staff", lang: "hi" });
    expect(en.text).toContain("LabLoop Lab account");
    expect(en.text).not.toMatch(devanagari);
    expect(hi.text).toMatch(devanagari);
    expect(resetMail({ name: "A", email: "a@x.in", token: "t", lang: "en" }).subject).toBe("LabLoop password reset");
  });
});
