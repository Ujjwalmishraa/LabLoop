import { cloneElement, isValidElement, useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Icon, Logo } from "./Icons.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useT, LANGS } from "../i18n/I18nContext.jsx";
import { STATUS_COLOR, STEPS } from "../utils.js";
import { errorMessage } from "../api/client.js";

export function Header({ title, subtitle, showLang = false, children }) {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useT();
  const nav = useNavigate();
  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="NidaanSetu home">
        <Logo size={40} />
        <div>
          <div className="brand-name">
            Nidaan<span>Setu</span>
          </div>
          <div className="brand-tag">{subtitle || t("brand.tag")}</div>
        </div>
      </Link>
      <div className="topbar-right">
        {children}
        {title && <span className="role-chip">{title}</span>}
        {showLang && (
          <label className="chip-btn lang-pick">
            <Icon name="globe" size={18} />
            <span className="sr-only">{t("lang.label")}</span>
            <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Bhasha / Language">
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {user && (
          <button
            className="chip-btn"
            onClick={async () => {
              await logout();
              nav("/", { replace: true });
            }}
          >
            <Icon name="logout" size={18} />
            <span className="hide-sm">{t("common.logout")}</span>
          </button>
        )}
      </div>
    </header>
  );
}

// Staff dashboard shell: sidebar navigation on desktop, compact top bar + scrollable nav on phones.
// `tabs` is the same shape the old <Tabs> took, so panels keep their own tab state.
export function PanelShell({ role, tabs, value, onChange, actions, children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const current = tabs.find((t) => t.key === value) || tabs[0];
  const initials = (user?.name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  const doLogout = async () => {
    await logout();
    nav("/", { replace: true });
  };
  return (
    <div className="app panel dash">
      <aside className="side">
        <div className="side-top">
          <Link to="/" className="brand" aria-label="NidaanSetu home">
            <Logo size={34} />
            <div>
              <div className="brand-name">
                Nidaan<span>Setu</span>
              </div>
              <div className="brand-tag">{role}</div>
            </div>
          </Link>
          <button className="icon-btn side-logout-sm" onClick={doLogout} aria-label="Logout">
            <Icon name="logout" size={18} />
          </button>
        </div>
        <nav className="side-nav" aria-label="Dashboard sections">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`side-link ${value === t.key ? "on" : ""}`}
              aria-current={value === t.key ? "page" : undefined}
              onClick={() => onChange(t.key)}
            >
              {t.icon && <Icon name={t.icon} size={18} />}
              <span className="side-label">{t.label}</span>
              {t.count !== undefined && <span className="side-count">{t.count}</span>}
            </button>
          ))}
        </nav>
        <div className="side-user">
          <span className="avatar" aria-hidden="true">
            {initials}
          </span>
          <div className="side-user-text">
            <strong>{user?.name}</strong>
            <small>{role}</small>
          </div>
          <button className="icon-btn" onClick={doLogout} aria-label="Logout" title="Logout">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>
      <div className="dash-main">
        <header className="page-head">
          <div>
            <div className="crumb">
              {role} <span aria-hidden="true">/</span> {current?.label}
            </div>
            <h1>{current?.label}</h1>
          </div>
          {actions && <div className="page-actions">{actions}</div>}
        </header>
        <main className="dash-body">{children}</main>
      </div>
    </div>
  );
}

export function Back({ onClick, to, label }) {
  const nav = useNavigate();
  const { t } = useT();
  return (
    <button type="button" className="back" onClick={onClick || (() => (to ? nav(to) : nav(-1)))}>
      {label || t("common.back")}
    </button>
  );
}

// Label + control + hint/inline error. The control (single child) gets an id, and the hint/error
// are linked via aria-describedby so they are announced but not part of the field's name.
export function Field({ label, hint, error, children }) {
  const id = useId();
  const descId = `${id}-desc`;
  const child = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id || id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": hint || error ? descId : undefined,
      })
    : children;
  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      <label className="field-label" htmlFor={children?.props?.id || id}>
        {label}
      </label>
      {child}
      {error ? (
        <span id={descId} className="field-error" role="alert">
          {error}
        </span>
      ) : (
        hint && (
          <span id={descId} className="field-hint">
            {hint}
          </span>
        )
      )}
    </div>
  );
}

export function Badge({ status, label }) {
  const { t } = useT();
  const text = label || t(`status.${status}`);
  return <span className={`badge badge-${STATUS_COLOR[status] || "gray"}`}>{text === `status.${status}` ? status : text}</span>;
}

export function Steps({ status }) {
  const { t } = useT();
  if (status === "cancelled") return <Badge status="cancelled" />;
  const idx = STEPS.indexOf(status);
  return (
    <ol className="steps" aria-label="Booking status">
      {STEPS.map((s, i) => (
        <li key={s} className={i <= idx ? "done" : ""} aria-current={i === idx ? "step" : undefined}>
          <span className="dot">{i <= idx ? "✓" : i + 1}</span>
          <span>{t(`status.${s}`)}</span>
        </li>
      ))}
    </ol>
  );
}

export function ErrorMsg({ msg, error }) {
  const text = msg || (error ? errorMessage(error) : "");
  if (!text) return null;
  return (
    <div className="error" role="alert">
      {text}
    </div>
  );
}

export function Ok({ msg }) {
  if (!msg) return null;
  return (
    <div className="ok" role="status">
      {msg}
    </div>
  );
}

export function Empty({ icon = "📭", text, children }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <div>{text}</div>
      {children}
    </div>
  );
}

export function Loading({ full, text }) {
  const { t } = useT();
  return (
    <div className={`loading ${full ? "full" : ""}`} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {text || t("common.loading")}
    </div>
  );
}

// Renders loading / error / empty for a TanStack query, else children(data).
export function QueryState({ query, empty, emptyIcon, isEmpty, children }) {
  const { t } = useT();
  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <div>
        <ErrorMsg error={query.error} />
        <button className="secondary-btn small" onClick={() => query.refetch()}>
          {t("common.retry")}
        </button>
      </div>
    );
  const d = query.data;
  const none = isEmpty ? isEmpty(d) : Array.isArray(d?.data) ? d.data.length === 0 : !d;
  if (none && empty) return <Empty icon={emptyIcon} text={empty} />;
  return children(d);
}

export function Pager({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return null;
  return (
    <div className="pager">
      <button className="secondary-btn small" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
        ← Pichla
      </button>
      <span>
        {meta.page} / {meta.pages} <span className="muted small">({meta.total})</span>
      </span>
      <button className="secondary-btn small" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}>
        Agla →
      </button>
    </div>
  );
}

export function Stat({ label, value, icon, tone = "teal" }) {
  return (
    <div className={`stat tone-${tone}`}>
      {icon && (
        <span className="stat-icon">
          <Icon name={icon} size={20} />
        </span>
      )}
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Tabs({ tabs, value, onChange, wrap }) {
  return (
    <div className={`tabs ${wrap ? "wrap" : ""}`} role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} className={`tab ${value === t.key ? "on" : ""}`} onClick={() => onChange(t.key)}>
          {t.icon && <Icon name={t.icon} size={18} />}
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// Shown once after creating an account for someone else.
// Clipboard API needs a secure origin (https or localhost); fall back to execCommand elsewhere (e.g. LAN IP on a phone).
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function CopyButton({ text, label = "Copy", className = "" }) {
  const [state, setState] = useState("idle");
  return (
    <button
      type="button"
      className={`copy-btn ${state === "done" ? "done" : ""} ${className}`}
      onClick={async () => {
        setState((await copyText(text)) ? "done" : "fail");
        setTimeout(() => setState("idle"), 1800);
      }}
    >
      {state === "done" ? "✓ Copy ho gaya" : state === "fail" ? "Copy nahi hua" : `⧉ ${label}`}
    </button>
  );
}

export function TempPassword({ email, password }) {
  if (!password) return null;
  return (
    <div className="temp-pass" role="status">
      <strong>Login ban gaya ✓</strong>
      <div className="cred-row">
        <span className="cred-label">Email</span>
        <code>{email}</code>
        <CopyButton text={email} />
      </div>
      <div className="cred-row">
        <span className="cred-label">Password</span>
        <code className="big-code">{password}</code>
        <CopyButton text={password} />
      </div>
      <CopyButton className="primary" text={`Login ID: ${email}\nPassword: ${password}`} label="Dono copy karein (WhatsApp pe bhejne ke liye)" />
      <p className="small">Yeh password sirf ek baar dikhega. Email bhi bhej diya gaya hai. Pehli baar login pe naya password banana hoga.</p>
    </div>
  );
}
