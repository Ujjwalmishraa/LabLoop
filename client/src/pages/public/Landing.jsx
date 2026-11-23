import { Link } from "react-router";
import { Header } from "../../components/ui.jsx";
import { Icon, Logo } from "../../components/Icons.jsx";
import { VillageScene, TestIcon, DoctorIcon, ReportIcon } from "../../components/Illustrations.jsx";
import DemoLogins from "../../components/DemoLogins.jsx";
import { useT } from "../../i18n/I18nContext.jsx";

const STAFF = [
  { to: "/login/lab", icon: "flask", label: "Lab", sub: "Order aur report", tone: "teal" },
  { to: "/login/doctor", icon: "steth", label: "Doctor", sub: "Aaj ke mareez", tone: "violet" },
  { to: "/login/agent", icon: "briefcase", label: "Agent", sub: "Lab, doctor jodein", tone: "amber" },
  { to: "/login/admin", icon: "shield", label: "Admin", sub: "Poora hisaab", tone: "rose" },
];

const POPULAR = ["CBC", "Sugar (Fasting / PP)", "HbA1c", "Thyroid (T3, T4, TSH)", "Lipid Profile", "LFT", "KFT", "Vitamin D", "Widal", "Malaria", "Urine Routine", "Dengue NS1"];

export default function Landing() {
  const { t } = useT();
  const steps = [
    { art: <TestIcon />, title: t("landing.f1"), sub: t("landing.s1") },
    { art: <ReportIcon />, title: t("landing.f2"), sub: t("landing.s2") },
    { art: <DoctorIcon />, title: t("landing.f3"), sub: t("landing.s3") },
  ];
  const why = [
    { icon: "truck", tone: "teal", title: t("landing.w1"), sub: t("landing.w1s") },
    { icon: "rupee", tone: "amber", title: t("landing.w2"), sub: t("landing.w2s") },
    { icon: "shield", tone: "violet", title: t("landing.w3"), sub: t("landing.w3s") },
    { icon: "clock", tone: "rose", title: t("landing.w4"), sub: t("landing.w4s") },
  ];
  return (
    <div className="app landing lp">
      <Header showLang />

      <section className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-copy">
            <span className="lp-eyebrow">
              <span className="pulse" aria-hidden="true" />
              <Icon name="pin" size={15} /> Siwan, Bihar
            </span>
            <h1>{t("landing.title")}</h1>
            <p className="lp-lead">{t("landing.sub")}</p>
            <div className="lp-cta">
              <Link className="primary-btn" to="/signup">
                {t("landing.signup")} <Icon name="arrowRight" size={20} />
              </Link>
              <Link className="secondary-btn" to="/login">
                {t("landing.login")}
              </Link>
            </div>
            <ul className="lp-trust">
              <li>
                <Icon name="truck" size={17} /> {t("landing.t1")}
              </li>
              <li>
                <Icon name="shield" size={17} /> {t("landing.t2")}
              </li>
              <li>
                <Icon name="rupee" size={17} /> {t("landing.t3")}
              </li>
            </ul>
          </div>

          <div className="lp-art" aria-hidden="true">
            <div className="lp-scene">
              <VillageScene label="" />
            </div>
            <div className="float-card fc-booking">
              <span className="fc-icon tone-teal">
                <Icon name="flask" size={20} />
              </span>
              <div>
                <strong>CBC + HbA1c</strong>
                <small>
                  <Icon name="clock" size={13} /> {t("landing.card3")}
                </small>
              </div>
              <span className="fc-otp">OTP 4821</span>
            </div>
            <div className="float-card fc-done">
              <span className="fc-icon tone-green">
                <Icon name="checkCircle" size={20} />
              </span>
              <div>
                <strong>{t("landing.card1")}</strong>
                <small>Shree Pathology Lab</small>
              </div>
            </div>
            <div className="float-card fc-report">
              <span className="fc-icon tone-violet">
                <Icon name="file" size={20} />
              </span>
              <div>
                <strong>{t("landing.card2")}</strong>
                <small>PDF · 2 pages</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-wrap lp-why">
        {why.map((w) => (
          <div key={w.title} className={`why-card tone-${w.tone}`}>
            <span className="staff-icon">
              <Icon name={w.icon} size={22} />
            </span>
            <strong>{w.title}</strong>
            <p>{w.sub}</p>
          </div>
        ))}
      </section>

      <main className="lp-wrap">
        <div className="lp-section-head">
          <h2 className="section-head">{t("landing.howTitle")}</h2>
        </div>
        <ol className="lp-steps">
          {steps.map((s, i) => (
            <li key={s.title}>
              <div className="lp-step-art">{s.art}</div>
              <span className="lp-step-no">{i + 1}</span>
              <strong>{s.title}</strong>
              <p>{s.sub}</p>
            </li>
          ))}
        </ol>

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

        <section className="lp-band">
          <div>
            <h2>{t("landing.ctaTitle")}</h2>
            <p>{t("landing.ctaSub")}</p>
          </div>
          <Link className="lp-band-btn" to="/signup">
            {t("landing.ctaBtn")} <Icon name="arrowRight" size={20} />
          </Link>
        </section>

        <div className="lp-section-head">
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
                <strong>{s.label}</strong>
                <small>{s.sub}</small>
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
              <div className="brand-name">
                Nidaan<span>Setu</span>
              </div>
            </div>
            <p>{t("landing.footTag")}</p>
          </div>
          <nav aria-label="Footer">
            <Link to="/login/lab">Lab login</Link>
            <Link to="/login/doctor">Doctor login</Link>
            <Link to="/login/agent">Agent login</Link>
          </nav>
        </div>
        <div className="lp-wrap lp-copy-line">© {new Date().getFullYear()} NidaanSetu</div>
      </footer>
    </div>
  );
}
