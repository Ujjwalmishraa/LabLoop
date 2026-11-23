import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch, errorMessage } from "../../api/client.js";
import { useT } from "../../i18n/I18nContext.jsx";
import { Icon } from "../../components/Icons.jsx";
import { ErrorMsg } from "../../components/ui.jsx";
import { MiniMap } from "../../components/MiniMap.jsx";
import { clockTime } from "../../utils.js";
import { useMyLocation } from "../../components/useMyLocation.js";

// Distance and time to the patient's home or the clinic, a Navigate button (free Google Maps
// directions on the collector's phone), "Use my location" and "I'm leaving now".
export function RoutePanel({ b }) {
  const { t } = useT();
  const qc = useQueryClient();
  const loc = useMyLocation();
  const from = loc.position;
  const params = useMemo(() => (from ? { fromLat: from.lat, fromLng: from.lng } : {}), [from]);
  const q = useQuery({
    queryKey: ["route", b._id, params.fromLat, params.fromLng],
    queryFn: () => get(`/lab/bookings/${b._id}/route`, params),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const r = q.data;
  const toLabel = b.collectionPoint === "clinic" ? b.clinic?.name || t("route.clinic") : t("route.home");
  const fromLabel = from ? t("route.you") : t("route.lab");

  async function depart() {
    setBusy(true);
    setErr("");
    try {
      await patch(`/lab/bookings/${b._id}/depart`, params);
      qc.invalidateQueries({ queryKey: ["labBookings"] });
      qc.invalidateQueries({ queryKey: ["labClinics"] });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="route-panel" data-testid="route-panel">
      {q.isPending ? (
        <div className="skeleton-line" aria-hidden="true" />
      ) : r ? (
        <p className="route-line" data-testid="route-line">
          <Icon name="map" size={18} />
          <strong>
            {t("common.km", { n: r.distanceKm })} · ~{t("route.min", { n: r.durationMin })}
          </strong>
          {r.approximate && <span className="chip small-chip">{t("route.approx")}</span>}
          <span className="muted small">{t("route.fromWhere", { from: fromLabel })}</span>
        </p>
      ) : (
        <ErrorMsg error={q.error} />
      )}
      {b.departedAt && b.eta && (
        <p className="route-left" role="status">
          <Icon name="truck" size={18} /> {t("route.leftAt", { left: clockTime(b.departedAt), eta: clockTime(b.eta.at) })}
        </p>
      )}
      <div className="btn-row">
        {r?.mapsUrl && (
          <a className="secondary-btn small" href={r.mapsUrl} target="_blank" rel="noopener noreferrer" data-testid="navigate-link">
            <Icon name="pin" size={18} /> {t("route.navigate")}
          </a>
        )}
        <button type="button" className="secondary-btn small" onClick={loc.locate} disabled={loc.busy}>
          <Icon name="user" size={18} /> {loc.busy ? t("route.locating") : from ? t("route.updateLoc") : t("route.useMyLoc")}
        </button>
        {b.status === "confirmed" && !b.departedAt && (
          <button type="button" className="primary-btn small" onClick={depart} disabled={busy}>
            <Icon name="truck" size={18} /> {t("route.leaving")}
          </button>
        )}
      </div>
      {loc.error && <p className="field-hint">{t(loc.error)}</p>}
      <ErrorMsg msg={err} />
      {r?.from && r?.to && <MiniMap from={r.from} to={r.to} fromLabel={fromLabel} toLabel={toLabel} />}
    </div>
  );
}
