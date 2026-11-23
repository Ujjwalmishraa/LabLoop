import { Link } from "react-router";
import { Icon } from "../../components/Icons.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useT } from "../../i18n/I18nContext.jsx";
import { VillageScene, TestIcon, DoctorIcon, ReportIcon } from "../../components/Illustrations.jsx";

export default function PatientHome() {
  const { user } = useAuth();
  const { t } = useT();
  const actions = [
    { to: "/jaanch", tone: "teal", art: <TestIcon />, title: t("home.tests"), sub: t("home.testsSub") },
    { to: "/doctors", tone: "violet", art: <DoctorIcon />, title: t("home.doctor"), sub: t("home.doctorSub") },
    { to: "/meri-booking", tone: "amber", art: <ReportIcon />, title: t("home.mine"), sub: t("home.mineSub") },
  ];
  return (
    <section className="home">
      <div className="home-hero">
        <div className="home-hero-text">
          <Link to="/village" className="home-village">
            <Icon name="pin" size={16} /> {user.village?.name} <span>· {t("village.change")}</span>
          </Link>
          <h1 className="big-title">{t("home.hello", { name: user.name.split(" ")[0] })}</h1>
        </div>
        <div className="home-hero-art" aria-hidden="true">
          <VillageScene label="" />
        </div>
      </div>
      <div className="home-actions">
        {actions.map((a) => (
          <Link key={a.to} className={`home-action tone-${a.tone}`} to={a.to}>
            <span className="ha-art">{a.art}</span>
            <span className="ha-text">
              <strong>{a.title}</strong>
              <small>{a.sub}</small>
            </span>
            <Icon name="arrowRight" size={20} className="ha-go" />
          </Link>
        ))}
      </div>
      <p className="home-save">
        <Icon name="sparkle" size={16} /> {t("home.save").replace(/^\S+\s/, "")}
      </p>
    </section>
  );
}
