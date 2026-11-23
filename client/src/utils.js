import { getLang, locale, t } from "./i18n/I18nContext.jsx";

// Money is always ₹ with Indian digit grouping; numbers/dates follow the chosen language.
export const rs = (n) => "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));
export const num = (n) => new Intl.NumberFormat(locale()).format(Number(n) || 0);

export const STEPS = ["requested", "confirmed", "collected", "report_ready"];
export const STATUS_COLOR = {
  requested: "amber",
  confirmed: "blue",
  collected: "violet",
  report_ready: "green",
  cancelled: "red",
  booked: "blue",
  seen: "green",
  no_show: "gray",
  pending: "amber",
  paid: "green",
  active: "green",
  disabled: "red",
};

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_JS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Calendar date in India, so "today" matches the server regardless of device timezone.
export function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekday = (iso) => DAY_JS[new Date(`${iso}T00:00:00Z`).getUTCDay()];

// Label like "Aaj", "Kal", "Budhvar 26"
export function dayLabel(iso, t) {
  const today = todayIso();
  if (iso === today) return t("date.today");
  if (iso === addDays(today, 1)) return t("date.tomorrow");
  return `${t(`day.${weekday(iso)}`)} ${Number(iso.slice(8))}`;
}

// "2026-11-24" -> "24 Nov 2026" / "24 नव॰ 2026"
export function prettyDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export const prettyDateTime = (v) =>
  v ? new Intl.DateTimeFormat(locale(), { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(v)) : "";

// Clock time in India, e.g. "7:45 am" / "7:45 am" (hi-IN uses the same digits).
export const clockTime = (v) => (v ? new Intl.DateTimeFormat(locale(), { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(new Date(v)) : "");

// Slots: the VALUE sent to the server is canonical ("06-08"); only the label is translated.
export const SLOT_KEYS = ["06-08", "08-10", "10-12"];
export const LAB_SLOTS = ["06-08", "08-10", "10-12", "12-14", "16-18"];
// Older bookings stored a Hinglish/English label; show those as they are.
export function slotLabel(v) {
  if (!v) return "";
  const s = t(`slot.${v}`);
  return s === `slot.${v}` ? v : s;
}

// "10:00" -> "10 AM"
export function time12(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat(locale(), { hour: "numeric", minute: m ? "2-digit" : undefined, timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, h, m)));
}

// Doctor specialty in the chosen language (specialtyHi is entered in Hindi by the agent).
export const specialtyName = (d) => (!d ? "" : getLang() === "en" ? d.specialty || d.specialtyHi || "" : d.specialtyHi || d.specialty || "");

export const ROLES = ["super_admin", "agent", "lab_staff", "doctor", "patient"];
export const roleLabel = (role) => (ROLES.includes(role) ? t(`role.${role}`) : role);
