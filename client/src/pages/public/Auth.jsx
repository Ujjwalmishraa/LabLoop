import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { VillageScene } from "../../components/Illustrations.jsx";
import { Header, Field, ErrorMsg, Ok, Back } from "../../components/ui.jsx";
import { useT } from "../../i18n/I18nContext.jsx";
import { useAuth, HOME_FOR } from "../../auth/AuthContext.jsx";
import { errorMessage, fieldErrors, post } from "../../api/client.js";
import { roleLabel } from "../../utils.js";

function Shell({ children }) {
  return (
    <div className="app auth-page">
      <Header />
      <div className="auth-hero" aria-hidden="true">
        <div className="auth-hero-art">
          <VillageScene label="" />
        </div>
      </div>
      <main className="container narrow auth-main">{children}</main>
    </div>
  );
}

const pwOk = (p) => p.length >= 8 && /[a-zA-Z]/.test(p) && /\d/.test(p);

// Patient self sign-up. There is no sign-up for doctors, labs or agents.
export function Signup() {
  const { t } = useT();
  const { signup } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", phone: "", email: "", password: "" });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => {
    setF({ ...f, [k]: e.target.value });
    setErrs({ ...errs, [k]: undefined });
  };

  async function submit(e) {
    e.preventDefault();
    const v = {};
    if (f.name.trim().length < 2) v.name = t("auth.name");
    if (!/^[6-9]\d{9}$/.test(f.phone)) v.phone = t("err.phone");
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) v.email = t("err.email");
    if (!pwOk(f.password)) v.password = t("auth.passwordHint");
    setErrs(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    setErr("");
    try {
      await signup({ ...f, email: f.email || undefined });
      nav("/village", { replace: true });
    } catch (e2) {
      setErrs(fieldErrors(e2));
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <Back to="/" />
      <form className="card" onSubmit={submit} noValidate>
        <h1 className="big-title">{t("auth.signupTitle")}</h1>
        <Field label={t("auth.name")} error={errs.name}>
          <input value={f.name} onChange={set("name")} autoComplete="name" placeholder={t("auth.namePh")} />
        </Field>
        <Field label={t("auth.mobile")} error={errs.phone}>
          <input value={f.phone} onChange={set("phone")} inputMode="numeric" maxLength={10} autoComplete="tel-national" placeholder="98XXXXXXXX" />
        </Field>
        <Field label={`${t("auth.email")} ${t("common.optional")}`} error={errs.email}>
          <input value={f.email} onChange={set("email")} type="email" autoComplete="email" />
        </Field>
        <Field label={t("auth.password")} hint={t("auth.passwordHint")} error={errs.password}>
          <input value={f.password} onChange={set("password")} type="password" autoComplete="new-password" />
        </Field>
        <ErrorMsg msg={err} />
        <button className="primary-btn" disabled={busy}>
          {busy ? t("common.loading") : t("auth.signupBtn")}
        </button>
        <Link className="link-btn block" to="/login">
          {t("auth.haveAccount")}
        </Link>
      </form>
    </Shell>
  );
}

// One login page per role. "/login" is the patient login (staff who land there are still sent to
// their own dashboard); "/login/:portal" only accepts that portal's role. The server enforces
// permissions either way; this just keeps each group on its own door.
export const PORTALS = {
  lab: { roles: ["lab_staff"], icon: "🧪", title: "portal.lab", hint: "portal.hintAgent" },
  doctor: { roles: ["doctor"], icon: "🩺", title: "portal.doctor", hint: "portal.hintAgent" },
  agent: { roles: ["agent"], icon: "🧑‍💼", title: "portal.agent", hint: "portal.hintAdmin" },
  admin: { roles: ["super_admin"], icon: "🛠️", title: "portal.admin", hint: "" },
};

export function Login() {
  const { t } = useT();
  const { login } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { portal: portalKey } = useParams();
  const portal = PORTALS[portalKey];
  const loc = useLocation();
  // Dev "Demo logins" box passes credentials via navigation state
  const [f, setF] = useState({ identifier: loc.state?.identifier || "", password: loc.state?.password || "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!f.identifier.trim() || !f.password) return setErr(t("err.loginBoth"));
    setBusy(true);
    setErr("");
    try {
      const user = await login(f.identifier.trim(), f.password, portal?.roles);
      if (user.mustChangePassword) return nav("/change-password", { replace: true });
      const next = params.get("next");
      const home = HOME_FOR[user.role];
      nav(next && next.startsWith(home) ? next : home, { replace: true });
    } catch (e2) {
      if (e2.message === "WRONG_PORTAL") {
        setErr(t("portal.wrong", { portal: t(portal.title), role: roleLabel(e2.role) }));
      } else setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <Back to="/" />
      <form className="card" onSubmit={submit} noValidate>
        {portal && (
          <div className="login-icon" aria-hidden="true">
            {portal.icon}
          </div>
        )}
        <h1 className="big-title">{portal ? t(portal.title) : t("auth.loginTitle")}</h1>
        {portal?.hint && <p className="muted">{t(portal.hint)}</p>}
        <Field label={portal ? t("auth.email") : t("auth.idLabel")}>
          <input value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} autoComplete="username" />
        </Field>
        <Field label={t("auth.password")}>
          <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} type="password" autoComplete="current-password" />
        </Field>
        <ErrorMsg msg={err} />
        <button className="primary-btn" disabled={busy}>
          {busy ? t("common.loading") : t("auth.loginBtn")}
        </button>
        <Link className="link-btn block" to="/forgot-password">
          {t("auth.forgot")}
        </Link>
        {!portal && (
          <Link className="link-btn block" to="/signup">
            {t("auth.noAccount")}
          </Link>
        )}
      </form>
    </Shell>
  );
}

export function ForgotPassword() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr(t("err.email"));
    setBusy(true);
    setErr("");
    try {
      setMsg((await post("/auth/forgot-password", { email })).message);
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <Back to="/login" />
      <form className="card" onSubmit={submit} noValidate>
        <h1 className="big-title">{t("auth.forgotTitle")}</h1>
        <p className="muted">{t("auth.forgotHint")}</p>
        <Field label={t("auth.email")}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
        </Field>
        <ErrorMsg msg={err} />
        <Ok msg={msg} />
        <button className="primary-btn" disabled={busy || !!msg}>
          {t("auth.forgotBtn")}
        </button>
      </form>
    </Shell>
  );
}

export function ResetPassword() {
  const { t } = useT();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (!pwOk(p1)) return setErr(t("auth.passwordHint"));
    if (p1 !== p2) return setErr(t("auth.mismatch"));
    try {
      setDone((await post("/auth/reset-password", { token, password: p1 })).message);
    } catch (e2) {
      setErr(errorMessage(e2));
    }
  }
  return (
    <Shell>
      <form className="card" onSubmit={submit} noValidate>
        <h1 className="big-title">{t("auth.resetTitle")}</h1>
        <Field label={t("auth.newPassword")} hint={t("auth.passwordHint")}>
          <input type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label={t("auth.confirmPassword")}>
          <input type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" />
        </Field>
        <ErrorMsg msg={err} />
        <Ok msg={done} />
        {done ? (
          <Link className="primary-btn" to="/login">
            {t("auth.loginBtn")}
          </Link>
        ) : (
          <button className="primary-btn">{t("auth.changeBtn")}</button>
        )}
      </form>
    </Shell>
  );
}

// Forced on first login for accounts created by an agent/admin; also reachable any time.
export function ChangePassword() {
  const { t } = useT();
  const { user, ready, changePassword } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ current: "", p1: "", p2: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (ready && !user) return <Navigate to="/login" replace />;
  async function submit(e) {
    e.preventDefault();
    if (!pwOk(f.p1)) return setErr(t("auth.passwordHint"));
    if (f.p1 !== f.p2) return setErr(t("auth.mismatch"));
    setBusy(true);
    setErr("");
    try {
      const u = await changePassword(f.current, f.p1);
      nav(HOME_FOR[u.role], { replace: true });
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <form className="card" onSubmit={submit} noValidate>
        <h1 className="big-title">{t("auth.changeTitle")}</h1>
        {user?.mustChangePassword && <p className="info">{t("auth.changeHint")}</p>}
        <Field label={t("auth.currentPassword")}>
          <input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoComplete="current-password" />
        </Field>
        <Field label={t("auth.newPassword")} hint={t("auth.passwordHint")}>
          <input type="password" value={f.p1} onChange={(e) => setF({ ...f, p1: e.target.value })} autoComplete="new-password" />
        </Field>
        <Field label={t("auth.confirmPassword")}>
          <input type="password" value={f.p2} onChange={(e) => setF({ ...f, p2: e.target.value })} autoComplete="new-password" />
        </Field>
        <ErrorMsg msg={err} />
        <button className="primary-btn" disabled={busy}>
          {t("auth.changeBtn")}
        </button>
      </form>
    </Shell>
  );
}
