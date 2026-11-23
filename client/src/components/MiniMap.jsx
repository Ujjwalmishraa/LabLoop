import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/I18nContext.jsx";

// Small map with two markers (collector/lab -> patient or clinic) on OpenStreetMap tiles.
// Leaflet is bundled from npm and loaded only when a map is shown. With no internet the tiles
// fail, and the map hides itself: the distance text and the Navigate button still work.
export function MiniMap({ from, to, fromLabel, toLabel }) {
  const { t } = useT();
  const el = useRef(null);
  const [failed, setFailed] = useState(typeof navigator !== "undefined" && navigator.onLine === false);

  useEffect(() => {
    if (failed || !from || !to || !el.current) return;
    let map;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !el.current) return;
      map = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false, dragging: true, tap: false });
      let loaded = false;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      })
        .on("tileload", () => (loaded = true))
        .on("tileerror", () => !loaded && !cancelled && setFailed(true))
        .addTo(map);
      // Markers are plain CSS dots, so no marker images need to be fetched.
      const dot = (cls, label) => L.divIcon({ className: `mm-dot ${cls}`, html: `<span>${label}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      const a = [from.lat, from.lng];
      const b = [to.lat, to.lng];
      L.marker(a, { icon: dot("mm-from", "A"), title: fromLabel, alt: fromLabel }).addTo(map);
      L.marker(b, { icon: dot("mm-to", "B"), title: toLabel, alt: toLabel }).addTo(map);
      L.polyline([a, b], { color: "#0b8276", weight: 3, dashArray: "6 6" }).addTo(map);
      map.fitBounds(L.latLngBounds([a, b]), { padding: [28, 28], maxZoom: 15 });
    })().catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [from, to, fromLabel, toLabel, failed]);

  if (failed) return null;
  return (
    <figure className="mini-map">
      <div ref={el} className="mini-map-canvas" role="img" aria-label={t("route.mapAria", { from: fromLabel, to: toLabel })} />
      <figcaption className="small muted">
        <span className="mm-key mm-from">A</span> {fromLabel} <span className="mm-key mm-to">B</span> {toLabel}
      </figcaption>
    </figure>
  );
}
