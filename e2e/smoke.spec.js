import { test, expect } from "@playwright/test";

// Accounts from the dev seed (server/src/scripts/seed-data.js)
const PW = "Nidaan@2026";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const DEVANAGARI = /[\u0900-\u097F]/;

// The flows below run in English: the first page load picks English unless a language is already set.
async function english(page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem("nidaansetu_lang")) localStorage.setItem("nidaansetu_lang", "en");
  });
  return page;
}
const newPage = async (browser) => english(await (await browser.newContext()).newPage());

// Patients use /login; staff use their own page, e.g. /login/lab
async function login(page, id, password = PW, path = "/login") {
  await page.goto(path);
  await page.getByLabel(path === "/login" ? "Mobile number or email" : "Email").fill(id);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  // Wait for the role redirect so the session exists before the test navigates on
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

// Patient path from "Book a test" to the success screen. Returns the OTP shown.
async function bookCbcHba1c(page) {
  await page.getByRole("link", { name: /Book a test/ }).click();
  await expect(page.getByRole("heading", { name: "Labs near you" })).toBeVisible();
  await page.locator(".lab-card", { hasText: "Shree Pathology Lab" }).getByRole("button", { name: "Choose tests →" }).click();
  await page.getByRole("button", { name: /^CBC ₹/ }).click();
  await page.getByRole("button", { name: /^HbA1c ₹/ }).click();
  await expect(page.locator(".fb-total")).toHaveText("₹950");
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByLabel("Home address").fill("Near the temple, ward 4");
  await page.getByText("The lab and my doctor may see my report").click();
  await page.getByRole("button", { name: "Confirm booking ✓" }).click();
  await expect(page.getByRole("heading", { name: "Booking done!" })).toBeVisible();
  const otp = (await page.getByTestId("booking-otp").innerText()).trim();
  expect(otp).toMatch(/^\d{4}$/);
  return { otp, code: (await page.getByTestId("booking-code").innerText()).trim() };
}

// Every visible h1/h2/h3 on the page, as text.
const headings = (page) => page.locator("h1:visible, h2:visible, h3:visible").allInnerTexts();

test("0. one language switch changes every patient screen", async ({ page }) => {
  await english(page);
  await login(page, "9876500001");
  const switchTo = (label) => page.getByTestId("lang-switch").first().getByRole("button", { name: label }).click();
  const screens = ["/home", "/jaanch", "/meri-booking"];

  await switchTo("English");
  for (const path of screens) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    for (const h of await headings(page)) expect(h, `${path}: "${h}"`).not.toMatch(DEVANAGARI);
  }

  await switchTo("हिंदी");
  for (const path of screens) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    // Page and section headings are Hindi (h3 may be a lab or test name, which stays as entered).
    for (const h of await page.locator("h1:visible, h2:visible").allInnerTexts()) expect(h, `${path}: "${h}"`).toMatch(DEVANAGARI);
  }
});

test("1. patient signs up and books a test", async ({ page }) => {
  await english(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "LabLoop" })).toBeVisible();
  await expect(page.locator(".ll-tagline")).toHaveText("Lab tests, looped to your doorstep.");
  for (const r of ["Lab login", "Doctor login", "Field agent login", "Admin login"]) await expect(page.getByRole("link", { name: r }).first()).toBeVisible();
  await page.getByRole("link", { name: "Book a test" }).click();
  await page.getByLabel("Your name").fill("Gita Kumari");
  await page.getByLabel("Mobile number").fill("9123456780");
  await page.getByLabel("Password", { exact: true }).fill("gaon1234");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "Which is your village?" })).toBeVisible();
  await page.getByRole("radio", { name: /Rampur/ }).click();
  await page.getByRole("button", { name: "Continue →" }).click();
  await expect(page.getByRole("heading", { name: /Namaste Gita/ })).toBeVisible();

  const { code } = await bookCbcHba1c(page);
  await page.getByRole("link", { name: "See my bookings" }).click();
  await expect(page.getByTestId("booking-card").first()).toContainText(code);
  await expect(page.getByTestId("mine-otp").first()).toBeVisible();
});

test("2. lab confirms, enters OTP, uploads report; patient sees it", async ({ browser }) => {
  const patient = await newPage(browser);
  await login(patient, "9876500001");
  await expect(patient).toHaveURL(/\/home$/);
  const { otp, code } = await bookCbcHba1c(patient);

  const lab = await newPage(browser);
  await login(lab, "lab.shree@nidaansetu.test", PW, "/login/lab");
  await expect(lab).toHaveURL(/\/lab/);
  const card = () => lab.getByTestId("lab-card").filter({ hasText: code });

  await card().getByRole("button", { name: "✓ Confirm, sample lene aayenge" }).click();
  await lab.locator(".side-nav").getByRole("button", { name: /Sample lena hai/ }).click();
  // Wrong OTP first
  await card().getByLabel("OTP").fill(otp === "0000" ? "1111" : "0000");
  await card().getByRole("button", { name: "Sample le liya ✓" }).click();
  await expect(card()).toContainText("Wrong OTP");
  await card().getByLabel("OTP").fill(otp);
  await card().getByRole("button", { name: "Sample le liya ✓" }).click();

  await lab.locator(".side-nav").getByRole("button", { name: /Report daalni hai/ }).click();
  await card().getByLabel("Report file").setInputFiles({ name: "cbc-report.pdf", mimeType: "application/pdf", buffer: PDF });
  await card().getByRole("button", { name: "📄 Report bhejein" }).click();
  await lab.locator(".side-nav").getByRole("button", { name: /Ho gaya/ }).click();
  await expect(card()).toContainText("Report ready");

  await patient.goto("/meri-booking");
  const mine = patient.getByTestId("booking-card").filter({ hasText: code });
  await expect(mine).toContainText("Report ready");
  await mine.getByRole("button", { name: "📄 View report" }).click();
  const link = mine.getByTestId("report-link");
  await expect(link).toContainText("cbc-report.pdf");
  const href = await link.getAttribute("href");
  const res = await patient.request.get(href);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
});

test("3. agent creates a doctor; doctor logs in, changes password, refers a test", async ({ browser }) => {
  const agent = await newPage(browser);
  await login(agent, "agent@nidaansetu.test", PW, "/login/agent");
  await expect(agent).toHaveURL(/\/agent/);
  await agent.locator(".side-nav").getByRole("button", { name: "Doctor jodein" }).click();
  await agent.getByLabel("Doctor ka naam").fill("Dr. Naya Doctor");
  await agent.getByLabel("Email (login ID)").fill("naya.doctor@example.in");
  await agent.getByLabel("Clinic ka naam").fill("Naya Clinic");
  await agent.getByLabel("Latitude").fill("26.125");
  await agent.getByLabel("Longitude").fill("84.505");
  // Sits every day so a token is always available
  await agent.getByRole("checkbox", { name: "Sunday" }).check();
  await agent.getByRole("button", { name: "Doctor jodein aur login banayein" }).click();
  const temp = (await agent.locator(".temp-pass .big-code").innerText()).trim();
  expect(temp.length).toBeGreaterThanOrEqual(8);

  // Patient takes a token with the new doctor
  const patient = await newPage(browser);
  await login(patient, "9876500002");
  await patient.goto("/doctors");
  await patient.locator(".doc-card", { hasText: "Dr. Naya Doctor" }).getByRole("button", { name: "Get token →" }).click();
  await patient.locator(".date-btn").first().click();
  await patient.getByRole("button", { name: "Confirm token ✓" }).click();
  await expect(patient.getByRole("heading", { name: "Token booked!" })).toBeVisible();
  await expect(patient.getByTestId("token")).toHaveText("1");
  const visitCode = (await patient.getByTestId("visit-code").innerText()).trim();
  expect(visitCode).toMatch(/^\d{4}$/);

  // Doctor: first login forces a password change
  const doctor = await newPage(browser);
  // Wrong door: a doctor account on the lab login is refused, and no session is started
  await doctor.goto("/login/lab");
  await doctor.getByLabel("Email").fill("naya.doctor@example.in");
  await doctor.getByLabel("Password", { exact: true }).fill(temp);
  await doctor.getByRole("button", { name: "Log in" }).click();
  await expect(doctor.getByRole("alert")).toContainText("Doctor account");
  await expect(doctor).toHaveURL(/\/login\/lab$/);

  await login(doctor, "naya.doctor@example.in", temp, "/login/doctor");
  await expect(doctor).toHaveURL(/\/change-password/);
  await doctor.getByLabel("Current (temporary) password").fill(temp);
  await doctor.getByLabel("New password", { exact: true }).fill("Doctor2026x");
  await doctor.getByLabel("Repeat new password").fill("Doctor2026x");
  await doctor.getByRole("button", { name: "Change password" }).click();
  await expect(doctor).toHaveURL(/\/doctor/);

  // The token is today (doctor sits every day)
  const appt = doctor.getByTestId("appt-card").filter({ hasText: "Sita Devi" });
  await appt.getByRole("button", { name: "Lab test likhein" }).click();
  await appt.locator(".mini-test", { hasText: "Lipid Profile" }).click();
  await appt.getByRole("button", { name: "Lab ko bhejein →" }).click();
  await expect(appt).toContainText("Lab test likha: Lipid Profile");

  // "Seen" only with the code from the patient's receipt
  await appt.getByRole("button", { name: "Dekh liya" }).click();
  await appt.getByLabel("Visit code").fill(visitCode === "0000" ? "1111" : "0000");
  await appt.getByRole("button", { name: "Code sahi, dekh liya" }).click();
  await expect(appt).toContainText("Wrong receipt code");
  await appt.getByLabel("Visit code").fill(visitCode);
  await appt.getByRole("button", { name: "Code sahi, dekh liya" }).click();
  await expect(appt).toContainText("Seen by doctor");

  // Patient sees the referral in "Meri booking"
  await patient.goto("/meri-booking");
  await expect(patient.getByTestId("booking-card").filter({ hasText: "Lipid Profile" })).toContainText("Prescribed by Dr. Naya Doctor");
});
