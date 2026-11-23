import { useNavigate } from "react-router";
import { useT } from "../i18n/I18nContext.jsx";

// Development only (rendered behind import.meta.env.DEV, so it is stripped from production builds).
// Mirrors the accounts created by `npm run seed:dev`.
const PASSWORD = "Nidaan@2026";
const ACCOUNTS = [
  { role: "Admin", id: "admin@nidaansetu.test", path: "/login/admin" },
  { role: "Agent", id: "agent@nidaansetu.test", path: "/login/agent" },
  { role: "Lab (Shree)", id: "lab.shree@nidaansetu.test", path: "/login/lab" },
  { role: "Lab (Jeevan)", id: "lab.jeevan@nidaansetu.test", path: "/login/lab" },
  { role: "Doctor · Maharajganj Bazaar", id: "dr.kumar@nidaansetu.test", path: "/login/doctor" },
  { role: "Doctor · Rampur", id: "dr.devi@nidaansetu.test", path: "/login/doctor" },
  { role: "Doctor · Sonbarsa", id: "dr.singh@nidaansetu.test", path: "/login/doctor" },
  { role: "Doctor · Bhagwanpur", id: "dr.tiwari@nidaansetu.test", path: "/login/doctor" },
  { role: "Doctor · Chainpur", id: "dr.mishra@nidaansetu.test", path: "/login/doctor" },
  { role: "Doctor · Mohammadpur", id: "dr.ansari@nidaansetu.test", path: "/login/doctor" },
  { role: "Doctor · Sarsar", id: "dr.yadav@nidaansetu.test", path: "/login/doctor" },
  { role: "Mareez (Ram)", id: "9876500001", path: "/login" },
  { role: "Mareez (Sita)", id: "9876500002", path: "/login" },
];

export default function DemoLogins() {
  const nav = useNavigate();
  const { t } = useT();
  return (
    <details className="demo-logins">
      <summary>{t("demo.title")} <code>{PASSWORD}</code></summary>
      <table className="table">
        <tbody>
          {ACCOUNTS.map((a) => (
            <tr key={a.id}>
              <td>{a.role}</td>
              <td>
                <code>{a.id}</code>
              </td>
              <td>
                <button className="secondary-btn small" onClick={() => nav(a.path, { state: { identifier: a.id, password: PASSWORD } })}>
                  {t("demo.login")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
