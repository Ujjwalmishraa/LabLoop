import { User } from "../models/index.js";
import { hashPassword, tempPassword } from "../lib/crypto.js";
import { credentialsMail, sendMail } from "../lib/mailer.js";
import { revokeAllForUser } from "../lib/tokens.js";
import { audit, pick } from "../lib/audit.js";
import { conflict } from "../lib/errors.js";

export const USER_AUDIT_FIELDS = ["name", "email", "phone", "role", "status", "lab", "doctor", "mustChangePassword"];

// Creates a non-patient account with a temporary password. Only called from agent/admin routes,
// which is what guarantees doctors, lab staff and agents can never self-register.
export async function createStaffUser(req, { name, email, phone, role, lab, doctor }) {
  if (await User.exists({ email })) throw conflict("Yeh email pehle se registered hai", "DUPLICATE");
  const password = tempPassword();
  const user = await User.create({
    name,
    email,
    phone,
    role,
    lab,
    doctor,
    passwordHash: await hashPassword(password),
    mustChangePassword: true,
    createdBy: req.user._id,
    lang: req.lang || "hi", // the person creating the account speaks with them; they can switch later
  });
  await audit(req, { action: "user.create", entityType: "User", entityId: user._id, after: pick(user, USER_AUDIT_FIELDS) });
  await sendMail(credentialsMail({ name, email, password, role, lang: user.lang }));
  return { user, tempPassword: password };
}

export async function setUserStatus(req, user, status) {
  const before = pick(user, ["status"]);
  user.status = status;
  if (status === "disabled") user.tokenVersion += 1; // kills access tokens immediately
  await user.save();
  if (status === "disabled") await revokeAllForUser(user._id);
  await audit(req, { action: `user.${status === "disabled" ? "disable" : "enable"}`, entityType: "User", entityId: user._id, before, after: { status } });
  return user;
}

export async function resetUserPassword(req, user) {
  const password = tempPassword();
  user.passwordHash = await hashPassword(password);
  user.mustChangePassword = true;
  user.tokenVersion += 1;
  await user.save();
  await revokeAllForUser(user._id);
  await audit(req, { action: "user.reset_password", entityType: "User", entityId: user._id, after: { mustChangePassword: true } });
  if (user.email) await sendMail(credentialsMail({ name: user.name, email: user.email, password, role: user.role, lang: user.lang }));
  return { user, tempPassword: password };
}
