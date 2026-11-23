import nodemailer from "nodemailer";
import { env } from "../config/env.js";

// In tests, mails go to this array so tests can read them. Without SMTP in dev, mails are logged.
export const outbox = [];

let transport;
function getTransport() {
  if (transport) return transport;
  if (env.isTest || !env.SMTP_HOST) {
    transport = nodemailer.createTransport({ jsonTransport: true });
  } else {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

export async function sendMail({ to, subject, text }) {
  const msg = { from: env.MAIL_FROM, to, subject, text };
  if (env.isTest) {
    outbox.push(msg);
    return;
  }
  if (!env.SMTP_HOST) {
    if (env.isProd) console.warn(`SMTP not configured; email to ${to} not sent`);
    else console.log(`\n--- email (dev, not sent) ---\nTo: ${to}\nSubject: ${subject}\n${text}\n-----------------------------\n`);
    return;
  }
  try {
    await getTransport().sendMail(msg);
  } catch (e) {
    // Account creation must not fail because SMTP is down; the temp password is also shown on screen.
    console.error("email send failed:", e.message);
  }
}

// Emails go out in the user's language (User.lang): hi = Hindi, en = English.
const ROLE = {
  hi: { lab_staff: "लैब", doctor: "डॉक्टर", agent: "फ़ील्ड एजेंट", super_admin: "एडमिन" },
  en: { lab_staff: "Lab", doctor: "Doctor", agent: "Field agent", super_admin: "Admin" },
};

export function credentialsMail({ name, email, password, role, lang = "hi" }) {
  const roleName = ROLE[lang]?.[role] || role;
  if (lang === "en") {
    return {
      to: email,
      subject: "LabLoop login details",
      text: `Hello ${name},

Your LabLoop ${roleName} account is ready.

Login ID (email): ${email}
Temporary password: ${password}

Login: ${env.CLIENT_ORIGIN}/login
You will be asked to set a new password the first time you log in.

- LabLoop team`,
    };
  }
  return {
    to: email,
    subject: "LabLoop लॉगिन जानकारी",
    text: `नमस्ते ${name},

आपका LabLoop ${roleName} अकाउंट बन गया है।

लॉगिन ID (ईमेल): ${email}
अस्थायी पासवर्ड: ${password}

लॉगिन: ${env.CLIENT_ORIGIN}/login
पहली बार लॉगिन करने पर नया पासवर्ड बनाना होगा।

- LabLoop टीम`,
  };
}

export function resetMail({ name, email, token, lang = "hi" }) {
  const link = `${env.CLIENT_ORIGIN}/reset-password?token=${token}`;
  if (lang === "en") {
    return {
      to: email,
      subject: "LabLoop password reset",
      text: `Hello ${name},

Open this link to change your password (valid for 30 minutes):
${link}

If you did not ask for this, you can ignore this email.

- LabLoop team`,
    };
  }
  return {
    to: email,
    subject: "LabLoop पासवर्ड रीसेट",
    text: `नमस्ते ${name},

पासवर्ड बदलने के लिए यह लिंक खोलें (30 मिनट तक चलेगा):
${link}

अगर आपने यह नहीं माँगा था, तो इस ईमेल को अनदेखा करें।

- LabLoop टीम`,
  };
}
