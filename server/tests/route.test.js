import { as, login, seed, startTestApp, stopTestApp, testIds, tomorrow, village } from "./helpers.js";
import { getRoute, clearRouteCache, approximateRoute, haversineKm, mapsLink, _internals, ROAD_FACTOR, RURAL_KMPH } from "../src/services/route.js";
import { Booking } from "../src/models/index.js";

const A = { lat: 26.112, lng: 84.5 };
const B = { lat: 26.12, lng: 84.495 };

const json = (body, ok = true, status = 200) => Promise.resolve({ ok, status, json: async () => body });
const ORS_OK = { routes: [{ summary: { distance: 6200, duration: 1080 } }] };
const OSRM_OK = { code: "Ok", routes: [{ distance: 5100, duration: 900 }] };

describe("getRoute provider chain", () => {
  const real = { ..._internals };
  let calls;
  beforeEach(() => {
    clearRouteCache();
    calls = [];
    _internals.offline = false;
  });
  afterAll(() => Object.assign(_internals, real));

  const fakeFetch = (handlers) => (url, init) => {
    calls.push(url);
    const h = handlers.find(([match]) => url.includes(match));
    return h ? h[1](url, init) : Promise.reject(new Error("no network"));
  };

  test("uses OpenRouteService when ORS_API_KEY is set", async () => {
    _internals.orsKey = () => "test-key";
    let auth;
    _internals.fetch = fakeFetch([["openrouteservice", (_u, init) => ((auth = init.headers.Authorization), json(ORS_OK))]]);
    const r = await getRoute({ from: A, to: B });
    expect(r).toEqual({ distanceKm: 6.2, durationMin: 18, provider: "openrouteservice", approximate: false });
    expect(auth).toBe("test-key");
    expect(calls).toHaveLength(1);
  });

  test("ORS failing falls back to OSRM", async () => {
    _internals.orsKey = () => "test-key";
    _internals.fetch = fakeFetch([
      ["openrouteservice", () => json({}, false, 500)],
      ["project-osrm", () => json(OSRM_OK)],
    ]);
    const r = await getRoute({ from: A, to: B });
    expect(r).toEqual({ distanceKm: 5.1, durationMin: 15, provider: "osrm", approximate: false });
    expect(calls[0]).toContain("openrouteservice");
    expect(calls[1]).toContain("router.project-osrm.org/route/v1/driving/84.5,26.112;84.495,26.12");
  });

  test("ORS and OSRM failing falls back to the approximate estimate", async () => {
    _internals.orsKey = () => "test-key";
    _internals.fetch = fakeFetch([
      ["openrouteservice", () => Promise.reject(new Error("down"))],
      ["project-osrm", () => json({ code: "NoRoute" })],
    ]);
    const r = await getRoute({ from: A, to: B });
    expect(r.provider).toBe("estimate");
    expect(r.approximate).toBe(true);
    const km = haversineKm(A, B) * ROAD_FACTOR;
    expect(r.distanceKm).toBeCloseTo(km, 1);
    expect(r.durationMin).toBe(Math.max(1, Math.round((km / RURAL_KMPH) * 60)));
  });

  test("without a key ORS is skipped; offline mode never calls the network", async () => {
    _internals.orsKey = () => undefined;
    _internals.fetch = fakeFetch([["project-osrm", () => json(OSRM_OK)]]);
    expect((await getRoute({ from: A, to: B })).provider).toBe("osrm");
    expect(calls.every((u) => !u.includes("openrouteservice"))).toBe(true);

    clearRouteCache();
    calls = [];
    _internals.offline = true;
    expect((await getRoute({ from: A, to: B })).provider).toBe("estimate");
    expect(calls).toHaveLength(0);
  });

  test("results are cached by rounded coordinates", async () => {
    _internals.orsKey = () => undefined;
    _internals.fetch = fakeFetch([["project-osrm", () => json(OSRM_OK)]]);
    await getRoute({ from: A, to: B });
    // Same points to 4 decimals -> cache hit, no second request
    const again = await getRoute({ from: { lat: 26.11201, lng: 84.50002 }, to: B });
    expect(again.cached).toBe(true);
    expect(calls).toHaveLength(1);
  });

  test("OSRM requests are throttled to one per second", async () => {
    _internals.orsKey = () => undefined;
    const times = [];
    _internals.fetch = fakeFetch([["project-osrm", () => (times.push(Date.now()), json(OSRM_OK))]]);
    await Promise.all([getRoute({ from: A, to: B }), getRoute({ from: B, to: A })]);
    expect(times).toHaveLength(2);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(950);
  });

  test("approximate estimate and maps link", () => {
    const r = approximateRoute(A, A);
    expect(r.durationMin).toBe(1);
    expect(mapsLink(A, B)).toBe("https://www.google.com/maps/dir/?api=1&origin=26.112,84.5&destination=26.12,84.495&travelmode=driving");
  });
});

describe("route + depart endpoints", () => {
  let app, data, shree, jeevan, ram, kumar, devi;
  beforeAll(async () => {
    app = await startTestApp();
    data = await seed();
    [shree, jeevan, ram, kumar, devi] = await Promise.all(
      ["lab.shree@nidaansetu.test", "lab.jeevan@nidaansetu.test", "9876500001", "dr.kumar@nidaansetu.test", "dr.devi@nidaansetu.test"].map((id) => login(app, id))
    );
  });
  afterAll(stopTestApp);

  async function homeBooking(extra = {}) {
    const rampur = await village("Rampur");
    const r = await as(app, ram.token).post("/bookings", {
      labId: String(data.labs.shree._id),
      testIds: await testIds(data.labs.shree, ["CBC"]),
      villageId: String(rampur._id),
      address: "Ward 4",
      date: tomorrow(),
      slot: "06-08",
      consent: true,
      ...extra,
    });
    expect(r.status).toBe(201);
    return r.body;
  }

  test("patient can share their location; route goes from the lab to that pin", async () => {
    const b = await homeBooking({ location: { lat: 26.121, lng: 84.496 } });
    expect(b.location.coordinates).toEqual([84.496, 26.121]);
    const r = await as(app, shree.token).get(`/lab/bookings/${b._id}/route`);
    expect(r.status).toBe(200);
    expect(r.body.to).toEqual({ lat: 26.121, lng: 84.496 });
    expect(r.body.from).toEqual({ lat: 26.112, lng: 84.5 }); // Shree lab
    expect(r.body.approximate).toBe(true); // offline in tests
    expect(r.body.distanceKm).toBeGreaterThan(0);
    expect(r.body.mapsUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&origin=26\.112,84\.5&destination=26\.121,84\.496&travelmode=driving$/);
    // Collector's live position as the origin
    const live = await as(app, shree.token).get(`/lab/bookings/${b._id}/route?fromLat=26.13&fromLng=84.51`);
    expect(live.body.from).toEqual({ lat: 26.13, lng: 84.51 });
    // Bad coordinates are rejected
    expect((await as(app, shree.token).get(`/lab/bookings/${b._id}/route?fromLat=200&fromLng=84`)).status).toBe(400);
  });

  test("without a shared pin the village is the destination; other labs get 404", async () => {
    const b = await homeBooking();
    const r = await as(app, shree.token).get(`/lab/bookings/${b._id}/route`);
    const rampur = await village("Rampur");
    expect(r.body.to).toEqual({ lat: rampur.location.coordinates[1], lng: rampur.location.coordinates[0] });
    expect((await as(app, jeevan.token).get(`/lab/bookings/${b._id}/route`)).status).toBe(404);
  });

  test("depart works only from confirmed, only once, only for the same lab; ETA reaches the patient", async () => {
    const b = await homeBooking();
    const lab = as(app, shree.token);
    const early = await lab.patch(`/lab/bookings/${b._id}/depart`, {});
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("NOT_DEPARTABLE");
    await lab.patch(`/lab/bookings/${b._id}/confirm`, { collectionTime: "06-08" });
    expect((await as(app, jeevan.token).patch(`/lab/bookings/${b._id}/depart`, {})).status).toBe(404);

    const before = Date.now();
    const d = await lab.patch(`/lab/bookings/${b._id}/depart`, {});
    expect(d.status).toBe(200);
    expect(d.body.status).toBe("confirmed"); // not a new status
    expect(d.body.eta.minutes).toBeGreaterThan(0);
    expect(new Date(d.body.eta.at).getTime()).toBeGreaterThanOrEqual(before + d.body.eta.minutes * 60000 - 1000);
    expect(d.body.eta.approximate).toBe(true);
    expect(d.body.history.at(-1).note).toBe("Collector left / कलेक्टर निकल गया");
    expect(d.body.otp).toBeUndefined();
    expect((await lab.patch(`/lab/bookings/${b._id}/depart`, {})).body.error.code).toBe("ALREADY_DEPARTED");

    const mine = await as(app, ram.token).get("/me/bookings");
    const row = mine.body.data.find((x) => x._id === b._id);
    expect(row.departedAt).toBeTruthy();
    expect(row.eta.minutes).toBe(d.body.eta.minutes);
    // Other lab can't see it in its list either
    const other = await as(app, jeevan.token).get("/lab/bookings?status=confirmed");
    expect(other.body.data.some((x) => x._id === b._id)).toBe(false);
  });

  test("clinic pickup: route goes to the clinic; the doctor sees the ETA, another doctor does not", async () => {
    const r = await as(app, kumar.token).post("/doctor/sample-requests", {
      walkIn: { name: "Ramesh" },
      labId: String(data.labs.shree._id),
      testIds: await testIds(data.labs.shree, ["CBC"]),
    });
    expect(r.status).toBe(201);
    const lab = as(app, shree.token);
    const route = await lab.get(`/lab/bookings/${r.body._id}/route`);
    const clinic = data.doctors[0].location.coordinates;
    expect(route.body.to).toEqual({ lat: clinic[1], lng: clinic[0] });
    await lab.patch(`/lab/bookings/${r.body._id}/confirm`, { collectionTime: "10-12" });
    expect((await lab.patch(`/lab/bookings/${r.body._id}/depart`, { fromLat: 26.12, fromLng: 84.49 })).status).toBe(200);

    const list = await as(app, kumar.token).get("/doctor/sample-requests");
    const row = list.body.data.find((x) => x._id === r.body._id);
    expect(row.departedAt).toBeTruthy();
    expect(row.eta.minutes).toBeGreaterThan(0);
    const deviList = await as(app, devi.token).get("/doctor/sample-requests");
    expect(deviList.body.data.some((x) => x._id === r.body._id)).toBe(false);
    expect((await Booking.findById(r.body._id)).status).toBe("confirmed");
  });
});
