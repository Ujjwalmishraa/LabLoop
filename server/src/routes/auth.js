import { Router } from "express";
import { z } from "zod";
import { User } from "../models/index.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { loginLimiter, signupLimiter, forgotLimiter } from "../middleware/security.js";
import { hashPassword, verifyPassword, randomToken, sha256 } from "../lib/crypto.js";
import {
  REFRESH_COOKIE,
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
  refreshCookieOptions,
} from "../lib/tokens.js";
import { sendMail, resetMail } from "../lib/mailer.js";
import { audit } from "../lib/audit.js";
import { badRequest, conflict, forbidden, unauthorized } from "../lib/errors.js";
import { translateText } from "../lib/i18n.js";

const router = Router();

export const passwordSchema = z
  .string()
  .min(8, "Password kam se kam 8 akshar ka ho")
  .max(72, "Password bahut lamba hai")
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), "Password mein kam se kam ek akshar aur ek ank ho");
export const phoneSchema = z.string().trim().regex(/^[6-9]\d{9}$/, "10 ankon ka sahi mobile number likhein");
export const emailSchema = z.string().trim().toLowerCase().email("Sahi email likhein").max(120);
export const nameSchema = z.string().trim().min(2, "Naam likhein").max(80);
export const langSchema = z.enum(["hi", "en"]);

// Compared against when the account doesn't exist, so login takes the same time either way.
let dummyHash;
const getDummyHash = async () => (dummyHash ??= await hashPassword(randomToken(12)));

async function startSession(req, res, user, status = 200) {
  const { raw } = await issueRefreshToken(user, req);
  res.cookie(REFRESH_COOKIE, raw, refreshCookieOptions());
  res.status(status).json({ user: await meView(user), accessToken: signAccessToken(user) });
}

export async function meView(user) {
  await user.populate([
    { path: "lab", select: "name status" },
    { path: "doctor", select: "name specialty status" },
    { path: "village", select: "name block district location" },
  ]);
  return user.toJSON();
}

// Public sign-up creates patients only. zod strips unknown keys, so a "role" field is simply dropped.
router.post(
  "/signup",
  signupLimiter,
  validate({
    body: z.object({
      name: nameSchema,
      phone: phoneSchema,
      email: emailSchema.optional().or(z.literal("").transform(() => undefined)),
      password: passwordSchema,
    }),
  }),
  async (req, res) => {
    const { name, phone, email, password } = req.body;
    if (await User.exists({ phone, role: "patient" })) throw conflict("Yeh mobile number pehle se registered hai. Login karein.", "DUPLICATE");
    if (email && (await User.exists({ email }))) throw conflict("Yeh email pehle se registered hai", "DUPLICATE");
    const user = await User.create({ name, phone, email, role: "patient", lang: req.lang, langChosen: true, passwordHash: await hashPassword(password) });
    req.user = user;
    await audit(req, { action: "user.signup", entityType: "User", entityId: user._id, after: { name, phone, email, role: "patient" } });
    user.lastLoginAt = new Date();
    await user.save();
    await startSession(req, res, user, 201);
  }
);

router.post(
  "/login",
  loginLimiter,
  validate({ body: z.object({ identifier: z.string().trim().min(3).max(120), password: z.string().min(1).max(72) }) }),
  async (req, res) => {
    const { identifier, password } = req.body;
    const user = identifier.includes("@")
      ? await User.findOne({ email: identifier.toLowerCase() })
      : await User.findOne({ phone: identifier, role: "patient" });
    const ok = await verifyPassword(password, user?.passwordHash || (await getDummyHash()));
    if (!user || !ok) throw unauthorized("Mobile/email ya password galat hai", "INVALID_CREDENTIALS");
    if (user.status !== "active") throw forbidden("Aapka account band hai. LabLoop team se sampark karein.", "ACCOUNT_DISABLED");
    user.lastLoginAt = new Date();
    await user.save();
    req.user = user;
    await audit(req, { action: "auth.login", entityType: "User", entityId: user._id });
    await startSession(req, res, user);
  }
);

router.post("/refresh", async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  const old = await rotateRefreshToken(raw);
  const user = await User.findById(old.user);
  if (!user || user.status !== "active") {
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    throw unauthorized("Session khatam ho gaya, dobara login karein", "TOKEN_REVOKED");
  }
  const { raw: next } = await issueRefreshToken(user, req, old.family);
  res.cookie(REFRESH_COOKIE, next, refreshCookieOptions());
  res.json({ user: await meView(user), accessToken: signAccessToken(user) });
});

router.post("/logout", async (req, res) => {
  await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

// Deliberately not behind requirePasswordChanged: this is the one thing a new staff account can do.
router.post(
  "/change-password",
  authenticate,
  validate({ body: z.object({ currentPassword: z.string().min(1).max(72), newPassword: passwordSchema }) }),
  async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = req.user;
    if (!(await verifyPassword(currentPassword, user.passwordHash))) throw badRequest("Purana password galat hai", "WRONG_PASSWORD");
    if (currentPassword === newPassword) throw badRequest("Naya password purane se alag hona chahiye", "SAME_PASSWORD");
    user.passwordHash = await hashPassword(newPassword);
    user.mustChangePassword = false;
    user.tokenVersion += 1;
    await user.save();
    await revokeAllForUser(user._id); // sign out other devices
    await audit(req, { action: "auth.change_password", entityType: "User", entityId: user._id });
    await startSession(req, res, user);
  }
);

router.post(
  "/forgot-password",
  forgotLimiter,
  validate({ body: z.object({ email: emailSchema }) }),
  async (req, res) => {
    const user = await User.findOne({ email: req.body.email, status: "active" });
    if (user) {
      const token = randomToken(32);
      user.resetTokenHash = sha256(token);
      user.resetTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();
      await sendMail(resetMail({ name: user.name, email: user.email, token, lang: user.lang }));
      req.user = user;
      await audit(req, { action: "auth.forgot_password", entityType: "User", entityId: user._id });
    }
    // Same answer either way so nobody can discover which emails are registered.
    res.json({ ok: true, message: translateText(req.lang, "Agar yeh email registered hai, toh password badalne ka link bhej diya gaya hai.") });
  }
);

router.post(
  "/reset-password",
  forgotLimiter,
  validate({ body: z.object({ token: z.string().min(20).max(200), password: passwordSchema }) }),
  async (req, res) => {
    const user = await User.findOne({ resetTokenHash: sha256(req.body.token), resetTokenExpiresAt: { $gt: new Date() } });
    if (!user) throw badRequest("Link purana ya galat hai. Dobara 'Password bhool gaye' karein.", "BAD_RESET_TOKEN");
    user.passwordHash = await hashPassword(req.body.password);
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    user.mustChangePassword = false;
    user.tokenVersion += 1;
    await user.save();
    await revokeAllForUser(user._id);
    req.user = user;
    await audit(req, { action: "auth.reset_password", entityType: "User", entityId: user._id });
    res.json({ ok: true, message: translateText(req.lang, "Password badal gaya. Ab login karein.") });
  }
);

router.get("/me", authenticate, async (req, res) => {
  res.json({ user: await meView(req.user) });
});

// Any role: save the language picked in the app (used after login and for emails).
router.patch("/me/lang", authenticate, validate({ body: z.object({ lang: langSchema }) }), async (req, res) => {
  req.user.lang = req.body.lang;
  req.user.langChosen = true;
  await req.user.save();
  res.json({ lang: req.user.lang });
});

export default router;
