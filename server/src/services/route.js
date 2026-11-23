// Road distance and driving time between two points, for the collector's trip.
// Free providers only, tried in order:
//   1. OpenRouteService (free plan) when ORS_API_KEY is set, profile driving-car.
//   2. The public OSRM demo server. Its usage policy allows only light, non-commercial use at
//      most 1 request/second, so calls are throttled in-process and time out after 4 s.
//   3. A straight-line estimate: haversine distance x 1.4 road factor at 25 km/h (rural roads),
//      marked approximate so the UI says "approx.".
// Results are cached in memory for 6 hours by coordinates rounded to 4 decimals (~11 m).
// Routing is only ever called from the server, never from the browser.
import { env } from "../config/env.js";

export const ROAD_FACTOR = 1.4;
export const RURAL_KMPH = 25;
const TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const OSRM_GAP_MS = 1000;

// Swappable in tests (no network there).
export const _internals = {
  fetch: (...args) => globalThis.fetch(...args),
  offline: env.ROUTING_OFFLINE === "true",
  orsKey: () => env.ORS_API_KEY,
  now: () => Date.now(),
};

const cache = new Map();
export const clearRouteCache = () => cache.clear();

const r4 = (n) => Math.round(n * 1e4) / 1e4;
const keyOf = (from, to) => [from.lat, from.lng, to.lat, to.lng].map(r4).join(",");
const round1 = (n) => Math.round(n * 10) / 10;

export function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function approximateRoute(from, to) {
  const distanceKm = haversineKm(from, to) * ROAD_FACTOR;
  return { distanceKm: round1(distanceKm), durationMin: Math.max(1, Math.round((distanceKm / RURAL_KMPH) * 60)), provider: "estimate", approximate: true };
}

async function fetchJson(url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await _internals.fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function viaOrs(from, to, key) {
  const j = await fetchJson("https://api.openrouteservice.org/v2/directions/driving-car", {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ coordinates: [[from.lng, from.lat], [to.lng, to.lat]] }),
  });
  const s = j?.routes?.[0]?.summary;
  if (!s || !Number.isFinite(s.distance) || !Number.isFinite(s.duration)) throw new Error("ORS: no route");
  return { distanceKm: round1(s.distance / 1000), durationMin: Math.max(1, Math.round(s.duration / 60)), provider: "openrouteservice", approximate: false };
}

// One OSRM request at a time, at least OSRM_GAP_MS apart.
let osrmChain = Promise.resolve();
let osrmLast = 0;
function throttled(fn) {
  const run = osrmChain.then(async () => {
    const wait = osrmLast + OSRM_GAP_MS - _internals.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    osrmLast = _internals.now();
    return fn();
  });
  osrmChain = run.catch(() => {});
  return run;
}

async function viaOsrm(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
  const j = await throttled(() => fetchJson(url, { headers: { Accept: "application/json", "User-Agent": "LabLoop/1.0 (non-commercial demo)" } }));
  const r = j?.routes?.[0];
  if (j?.code !== "Ok" || !r) throw new Error("OSRM: no route");
  return { distanceKm: round1(r.distance / 1000), durationMin: Math.max(1, Math.round(r.duration / 60)), provider: "osrm", approximate: false };
}

// from/to: { lat, lng }. Never throws: falls back to the straight-line estimate.
export async function getRoute({ from, to }) {
  const key = keyOf(from, to);
  const hit = cache.get(key);
  if (hit && hit.expires > _internals.now()) return { ...hit.value, cached: true };

  let value;
  if (!_internals.offline) {
    const orsKey = _internals.orsKey();
    if (orsKey) value = await viaOrs(from, to, orsKey).catch(() => null);
    if (!value) value = await viaOsrm(from, to).catch(() => null);
  }
  if (!value) value = approximateRoute(from, to);
  // Estimates are cheap and may succeed with a real provider later, so cache them only briefly.
  cache.set(key, { value, expires: _internals.now() + (value.approximate ? 5 * 60 * 1000 : CACHE_TTL_MS) });
  return value;
}

// Free turn-by-turn navigation on the collector's phone; needs no API key.
export const mapsLink = (from, to) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving`;

// GeoJSON Point ([lng, lat]) -> { lat, lng }
export const latLng = (p) => (p?.coordinates?.length === 2 ? { lat: p.coordinates[1], lng: p.coordinates[0] } : null);
