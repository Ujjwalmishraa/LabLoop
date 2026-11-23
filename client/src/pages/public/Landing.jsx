import { Link } from "react-router";
import { Header } from "../../components/ui.jsx";
import { Icon } from "../../components/Icons.jsx";
import { Logo, BrandName } from "../../components/Logo.jsx";
import { TestIcon, ReportIcon } from "../../components/Illustrations.jsx";
import DemoLogins from "../../components/DemoLogins.jsx";
import { useT } from "../../i18n/I18nContext.jsx";

const STAFF = [
  { to: "/login/lab", icon: "flask", label: "portal.lab", sub: "landing.staffLab", tone: "teal" },
  { to: "/login/doctor", icon: "steth", label: "portal.doctor", sub: "landing.staffDoctor", tone: "violet" },
  { to: "/login/agent", icon: "briefcase", label: "portal.agent", sub: "landing.staffAgent", tone: "amber" },
  { to: "/login/admin", icon: "shield", label: "portal.admin", sub: "landing.staffAdmin", tone: "rose" },
];

// Test names are what labs print on their rate cards, so they stay as they are in both languages.
const POPULAR = ["CBC", "Sugar (Fasting / PP)", "HbA1c", "Thyroid (T3, T4, TSH)", "Lipid Profile", "LFT", "KFT", "Vitamin D", "Widal", "Malaria", "Urine Routine", "Dengue NS1"];

// Collector on a bike, for step 2.
function CollectorArt() {
  return (
    <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
      <circle cx="48" cy="48" r="44" fill="#fff4dc" />
      <circle cx="30" cy="66" r="9" fill="none" stroke="#0b8276" strokeWidth="4" />
      <circle cx="68" cy="66" r="9" fill="none" stroke="#0b8276" strokeWidth="4" />
      <path d="M30 66 L44 50 L60 50 L68 66 M44 50 L40 40 L50 40" fill="none" stroke="#0b8276" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="54" cy="28" r="6" fill="#f59e0b" />
      <path d="M54 34 L52 48" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round" />
      <rect x="60" y="38" width="12" height="10" rx="2" fill="#0e9f8e" />
    </svg>
  );
}

export default function Landing() {
  const { t } = useT();
  const steps = [
    { art: <TestIcon />, title: t("landing.step1"), sub: t("landing.step1s") },
    { art: <CollectorArt />, title: t("landing.step2"), sub: t("landing.step2s") },
    { art: <ReportIcon />, title: t("landing.step3"), sub: t("landing.step3s") },
  ];
  const badges = [
    { icon: "shield", title: t("landing.badgeOtp"), sub: t("landing.badgeOtpS") },
    { icon: "file", title: t("landing.badgeReport"), sub: t("landing.badgeReportS") },
    { icon: "globe", title: t("landing.badgeLang"), sub: t("landing.badgeLangS") },
  ];
  return (
    <div className="app landing ll-landing">
      <Header />

      <section className="ll-hero">
        <div className="lp-wrap ll-hero-inner">
          <div className="ll-hero-mark">
            <Logo size={96} />
          </div>
          <span className="lp-eyebrow">
            <Icon name="pin" size={15} /> {t("landing.where")}
          </span>
          <h1>
            <BrandName />
          </h1>
          <p className="ll-tagline">{t("brand.tag")}</p>
          <p className="lp-lead">{t("landing.sub")}</p>
          <div className="ll-cta">
            <Link className="primary-btn ll-big" to="/signup">
              <Icon name="flask" size={22} /> {t("landing.bookTest")}
            </Link>
            <a className="secondary-btn ll-big" href="#staff">
              <Icon name="users" size={22} /> {t("landing.staffLogin")}
            </a>
          </div>
          <p className="ll-have-account">
            {t("landing.haveAccount")}{" "}
            <Link to="/login" className="link-btn">
              {t("landing.login")}
            </Link>
          </p>
        </div>
      </section>

      <main className="lp-wrap">
        <section aria-labelledby="how-title">
          <h2 id="how-title" className="section-head">
            {t("landing.howTitle")}
          </h2>
          <ol className="ll-steps">
            {steps.map((s, i) => (
              <li key={s.title}>
                <div className="ll-step-art">{s.art}</div>
                <span className="ll-step-no" aria-hidden="true">
                  {i + 1}
                </span>
                <strong>{s.title}</strong>
                <p>{s.sub}</p>
              </li>
            ))}
          </ol>
        </section>

        <ul className="ll-badges">
          {badges.map((b) => (
            <li key={b.title}>
              <span className="ll-badge-icon">
                <Icon name={b.icon} size={22} />
              </span>
              <span>
                <strong>{b.title}</strong>
                <small>{b.sub}</small>
              </span>
            </li>
          ))}
        </ul>

        <div className="lp-section-head">
          <h2 className="section-head">{t("landing.popTitle")}</h2>
          <p className="muted">{t("landing.popSub")}</p>
        </div>
        <div className="lp-tests">
          {POPULAR.map((name) => (
            <Link key={name} to="/signup" className="lp-test">
              <Icon name="flask" size={16} />
              {name}
            </Link>
          ))}
        </div>

        <div className="lp-section-head" id="staff">
          <h2 className="section-head">{t("landing.staffTitle")}</h2>
          <p className="muted">{t("landing.staff")}</p>
        </div>
        <div className="staff-grid">
          {STAFF.map((s) => (
            <Link key={s.to} className={`staff-card tone-${s.tone}`} to={s.to}>
              <span className="staff-icon">
                <Icon name={s.icon} size={26} />
              </span>
              <span className="staff-text">
                <strong>{t(s.label)}</strong>
                <small>{t(s.sub)}</small>
              </span>
              <Icon name="arrowRight" size={18} className="staff-arrow" />
            </Link>
          ))}
        </div>
        {import.meta.env.DEV && <DemoLogins />}
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-grid">
          <div>
            <div className="brand">
              <Logo size={36} />
              <BrandName />
            </div>
            <p>{t("brand.tag")}</p>
          </div>
          <nav aria-label={t("landing.footer")}>
            <Link to="/login/lab">{t("portal.lab")}</Link>
            <Link to="/login/doctor">{t("portal.doctor")}</Link>
            <Link to="/login/agent">{t("portal.agent")}</Link>
          </nav>
        </div>
        <div className="lp-wrap lp-copy-line">© {new Date().getFullYear()} LabLoop</div>
      </footer>
    </div>
  );
}
