import { useEffect, useState } from "react";
import { useT } from "../i18n/I18nContext.jsx";
import { Icon } from "./Icons.jsx";
import { clockTime } from "../utils.js";

// "Collector will reach in about 18 min (by 7:45 AM)" once the lab taps "I'm leaving now".
// Shown to the patient (My bookings) and to the doctor (Lab requests) until the sample is taken.
export function EtaBanner({ b }) {
  const { t } = useT();
  const [now, setNow] = useState(() => Date.now());
  const show = b?.status === "confirmed" && b.departedAt && b.eta?.at;
  useEffect(() => {
    if (!show) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [show]);
  if (!show) return null;
  const left = Math.ceil((new Date(b.eta.at).getTime() - now) / 60000);
  return (
    <div className="eta-banner" role="status" data-testid="eta-banner">
      <Icon name="truck" size={22} />
      <div>
        <strong>{left > 0 ? t("eta.banner", { n: left, time: clockTime(b.eta.at) }) : t("eta.anyMoment")}</strong>
        <small>{b.eta.approximate ? t("eta.approx") : t("eta.byRoad")}</small>
      </div>
    </div>
  );
}
