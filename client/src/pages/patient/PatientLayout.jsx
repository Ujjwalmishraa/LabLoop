import { Navigate, NavLink, Outlet, useLocation } from "react-router";
import { Header } from "../../components/ui.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useT } from "../../i18n/I18nContext.jsx";
import { Icon } from "../../components/Icons.jsx";

export default function PatientLayout() {
  const { user } = useAuth();
  const { t } = useT();
  const loc = useLocation();
  // A saved village is needed for distances and lab coverage.
  if (!user.village && loc.pathname !== "/village") return <Navigate to="/village" replace />;
  return (
    <div className="app patient">
      <Header showLang />
      <main className="container narrow with-nav">
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/home"><Icon name="home" size={24} /><span>{t("common.home")}</span></NavLink>
        <NavLink to="/jaanch"><Icon name="flask" size={24} /><span>{t("mine.tabTests")}</span></NavLink>
        <NavLink to="/doctors"><Icon name="steth" size={24} /><span>{t("nav.doctor")}</span></NavLink>
        <NavLink to="/meri-booking"><Icon name="file" size={24} /><span>{t("nav.booking")}</span></NavLink>
        <NavLink to="/profile"><Icon name="user" size={24} /><span>{t("profile.title")}</span></NavLink>
      </nav>
    </div>
  );
}
