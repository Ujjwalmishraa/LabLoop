import { useState } from "react";
import { Icon } from "../../components/Icons.jsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch, upload, errorMessage } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useT } from "../../i18n/I18nContext.jsx";
import { PanelShell, Badge, ErrorMsg, Field, Pager, QueryState } from "../../components/ui.jsx";
import { rs, prettyDate, prettyDateTime, LAB_SLOTS, slotLabel } from "../../utils.js";
import { RoutePanel } from "./RoutePanel.jsx";

const FLOW = [
  { key: "requested", label: "lab.tab.requested", icon: "inbox" },
  { key: "confirmed", label: "lab.tab.confirmed", icon: "truck" },
  { key: "collected", label: "lab.tab.collected", icon: "upload" },
  { key: "report_ready", label: "lab.tab.done", icon: "checkCircle" },
];

export default function LabPanel() {
  const { t } = useT();
  const { user } = useAuth();
  const [tab, setTab] = useState("requested");
  // Counts come with every bookings response; a tiny query keeps them fresh on every tab
  const counts = useQuery({ queryKey: ["labCounts"], queryFn: () => get("/lab/bookings", { limit: 1 }), refetchInterval: 15_000 });
  const clinics = useQuery({ queryKey: ["labClinics"], queryFn: () => get("/lab/clinic-pickups"), refetchInterval: 15_000 });
  const c = counts.data?.counts || {};
  const waitingAtClinics = (clinics.data?.data || []).reduce((s, g) => s + g.waiting, 0);
  const tabs = [
    ...FLOW.map((f) => ({ ...f, label: t(f.label), count: c[f.key] || 0 })),
    { key: "clinic", label: t("lab.tab.clinic"), icon: "building", count: waitingAtClinics },
    { key: "tests", label: t("lab.tab.rates"), icon: "list" },
    { key: "money", label: t("lab.tab.money"), icon: "wallet" },
  ];

  return (
    <PanelShell role={user.lab?.name ? `${t("lab.role")} · ${user.lab.name}` : t("lab.panel")} tabs={tabs} value={tab} onChange={setTab}>
      {FLOW.some((f) => f.key === tab) && <BookingList status={tab} />}
      {tab === "clinic" && <ClinicPickups query={clinics} />}
      {tab === "tests" && <RateList />}
      {tab === "money" && <Settlements />}
    </PanelShell>
  );
}

function BookingList({ status }) {
  const { t } = useT();
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["labBookings", status, page],
    queryFn: () => get("/lab/bookings", { status, page, limit: 20, sort: status === "report_ready" ? "-createdAt" : "date" }),
    refetchInterval: 15_000, // new requests appear on their own
  });
  return (
    <QueryState query={q} empty={t("lab.empty")} emptyIcon="🧪">
      {(d) => (
        <>
          <div className="grid">
            {d.data.map((b) => (
              <LabCard key={b._id} b={b} />
            ))}
          </div>
          <Pager meta={d.meta} onPage={setPage} />
        </>
      )}
    </QueryState>
  );
}

function useRefreshLab() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["labBookings"] });
    qc.invalidateQueries({ queryKey: ["labCounts"] });
    qc.invalidateQueries({ queryKey: ["labClinics"] });
  };
}

// Where the sample is picked up: the patient's home or a doctor's clinic.
function PickupPlace({ b }) {
  const { t } = useT();
  if (b.collectionPoint === "clinic")
    return (
      <p className="meta pickup-clinic">
        <Icon name="building" size={17} />
        <span>
          <strong>{t("lab.atClinic", { clinic: b.clinic?.name || "" })}</strong>
          {b.clinic?.address ? ` · ${b.clinic.address}` : ""}
        </span>
      </p>
    );
  return (
    <p className="meta">
      <Icon name="home" size={17} /> {t("lab.atHome")} · {b.village?.name} · {b.address}
    </p>
  );
}

function LabCard({ b }) {
  const { t } = useT();
  const refresh = useRefreshLab();
  const [time, setTime] = useState(LAB_SLOTS.includes(b.slot) ? b.slot : LAB_SLOTS[0]);
  const [file, setFile] = useState(null);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const phone = b.patient?.phone || b.walkIn?.phone;

  const run = async (fn) => {
    setErr("");
    setBusy(true);
    try {
      await fn();
      refresh();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  async function viewReport() {
    try {
      const r = await get(`/bookings/${b._id}/report`);
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  return (
    <div className="card lab-card-item" data-testid="lab-card">
      <div className="row-between">
        <h3>
          {b.patientName}
          {b.patientAge ? `, ${t("common.years", { n: b.patientAge })}` : ""}
        </h3>
        <Badge status={b.status} />
      </div>
      <div className="chips">
        {b.source === "doctor" && (
          <span className="chip ref">
            <Icon name="steth" size={15} /> {t("lab.referredBy", { doctor: b.referredBy?.name || "" })}
          </span>
        )}
        {b.walkIn?.name && <span className="chip">{t("lab.walkIn")}</span>}
      </div>
      <PickupPlace b={b} />
      <p className="meta">
        {phone && (
          <>
            <Icon name="phone" size={17} />
            <a href={`tel:${phone}`} className="link-btn">
              {phone}
            </a>
          </>
        )}
        <span className="code-chip">{b.code}</span>
      </p>
      <p className="meta strong">
        <Icon name="flask" size={17} /> {b.items.map((i) => i.name).join(", ")}
      </p>
      {b.note && (
        <p className="meta note">
          <Icon name="file" size={17} /> {t("lab.doctorNote")}: {b.note}
        </p>
      )}
      <p className="meta">
        <Icon name="calendar" size={17} /> {prettyDate(b.date)} · {slotLabel(b.collectionTime || b.slot)}
      </p>
      <div className="row-between">
        <span className="muted">{t("lab.patientPays", { mode: b.payment?.mode === "upi" ? "UPI" : t("lab.cash") })}</span>
        <strong>{rs(b.total)}</strong>
      </div>
      <div className="row-between">
        <span className="muted small">{t("lab.labShare")}</span>
        <span className="small">{rs(b.labPayout)}</span>
      </div>

      {["requested", "confirmed"].includes(b.status) && <RoutePanel b={b} />}

      {b.status === "requested" && (
        <div className="actions">
          <Field label={t("lab.whenGo")}>
            <select value={time} onChange={(e) => setTime(e.target.value)}>
              {LAB_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {slotLabel(s)}
                </option>
              ))}
            </select>
          </Field>
          {rejecting ? (
            <>
              <Field label={t("lab.rejectReason")}>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("lab.rejectPh")} />
              </Field>
              <div className="btn-row">
                <button className="secondary-btn small danger" disabled={busy} onClick={() => run(() => patch(`/lab/bookings/${b._id}/reject`, { reason: reason || undefined }))}>
                  {t("lab.rejectYes")}
                </button>
                <button className="link-btn" onClick={() => setRejecting(false)}>
                  {t("common.cancel")}
                </button>
              </div>
            </>
          ) : (
            <div className="btn-row">
              <button className="primary-btn small" disabled={busy} onClick={() => run(() => patch(`/lab/bookings/${b._id}/confirm`, { collectionTime: time }))}>
                <Icon name="check" size={18} /> {t("lab.confirm")}
              </button>
              <button className="secondary-btn small" disabled={busy} onClick={() => setRejecting(true)}>
                {t("lab.reject")}
              </button>
            </div>
          )}
        </div>
      )}

      {b.status === "confirmed" && <CollectForm b={b} onDone={refresh} />}

      {b.status === "collected" && (
        <div className="actions">
          <Field label={t("lab.uploadLabel")}>
            <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} aria-label={t("lab.reportFile")} />
          </Field>
          {file && file.size > 5 * 1024 * 1024 && <p className="error">{t("lab.fileTooBig")}</p>}
          <button className="primary-btn small" disabled={busy || !file || file.size > 5 * 1024 * 1024} onClick={() => run(() => upload(`/lab/bookings/${b._id}/report`, "report", file))}>
            <Icon name="upload" size={18} /> {busy ? t("lab.uploading") : t("lab.sendReport")}
          </button>
        </div>
      )}

      {b.status === "report_ready" && (
        <button className="secondary-btn small" onClick={viewReport}>
          <Icon name="file" size={18} /> {t("lab.viewReport", { name: b.report?.name || "" })}
        </button>
      )}
      <ErrorMsg msg={err} />
    </div>
  );
}

// OTP + payment mode -> collected. Used on each card and by "Collect all at this clinic".
function CollectForm({ b, onDone, autoFocus }) {
  const { t } = useT();
  const [otp, setOtp] = useState("");
  const [payMode, setPayMode] = useState(b.payment?.mode === "upi" ? "upi" : "cash");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (b.otpLocked) return <p className="error">{t("lab.otpLocked")}</p>;
  async function collect() {
    setErr("");
    setBusy(true);
    try {
      await patch(`/lab/bookings/${b._id}/collect`, { otp, paymentMode: payMode });
      setOtp("");
      onDone?.();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="actions">
      <Field label={b.collectionPoint === "clinic" ? t("lab.otpFromClinic") : t("lab.otpFromPatient")}>
        <input
          inputMode="numeric"
          maxLength={4}
          value={otp}
          autoFocus={autoFocus}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
          placeholder={t("lab.otpPh")}
          aria-label="OTP"
        />
      </Field>
      <div className="pill-row" role="radiogroup" aria-label={t("lab.payment")}>
        {[
          ["cash", t("lab.cashTaken")],
          ["upi", t("lab.upiTaken")],
        ].map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={payMode === k} className={`pill ${payMode === k ? "on" : ""}`} onClick={() => setPayMode(k)}>
            {l}
          </button>
        ))}
      </div>
      <button className="primary-btn small" disabled={busy || otp.length !== 4} onClick={collect}>
        <Icon name="check" size={18} /> {t("lab.collected")}
      </button>
      <ErrorMsg msg={err} />
    </div>
  );
}

// ---------- clinic pickups ----------
function ClinicPickups({ query }) {
  const { t } = useT();
  return (
    <>
      <p className="muted">{t("lab.clinicIntro")}</p>
      <QueryState query={query} empty={t("lab.clinicEmpty")} emptyIcon="🏥">
        {(d) => d.data.map((g) => <ClinicGroup key={String(g.clinic.doctor || g.clinic.name)} g={g} />)}
      </QueryState>
    </>
  );
}

function ClinicGroup({ g }) {
  const { t } = useT();
  const refresh = useRefreshLab();
  const [batch, setBatch] = useState(null); // index into `ready` while "collect all" runs
  const ready = g.bookings.filter((b) => b.status === "confirmed" && !b.otpLocked);
  return (
    <section className="card clinic-group" data-testid="clinic-group">
      <div className="row-between wrap">
        <div>
          <h2 className="clinic-name">
            <Icon name="building" size={22} /> {g.clinic.name}
          </h2>
          {g.clinic.address && <p className="muted">{g.clinic.address}</p>}
        </div>
        <span className="waiting-count" aria-label={t("lab.waitingAria", { n: g.waiting })}>
          <strong>{g.waiting}</strong> {t("lab.waiting")}
        </span>
      </div>
      <p className="small muted">
        {t("lab.clinicCounts", { requested: g.requested, confirmed: g.confirmed })}
      </p>
      {ready.length > 0 && batch === null && (
        <button className="primary-btn small" onClick={() => setBatch(0)}>
          <Icon name="truck" size={18} /> {t("lab.collectAll", { n: ready.length })}
        </button>
      )}
      {batch !== null && ready[batch] && (
        <div className="batch" role="region" aria-label={t("lab.collectAllTitle")}>
          <div className="row-between">
            <strong>{t("lab.batchStep", { i: batch + 1, n: ready.length })}</strong>
            <button className="link-btn" onClick={() => setBatch(null)}>
              {t("common.close")}
            </button>
          </div>
          <p className="meta strong">
            {ready[batch].patientName} · <span className="code-chip">{ready[batch].code}</span>
          </p>
          <p className="meta">{ready[batch].items.map((i) => i.name).join(", ")}</p>
          <CollectForm
            key={ready[batch]._id}
            b={ready[batch]}
            autoFocus
            onDone={() => {
              const next = batch + 1;
              setBatch(next < ready.length ? next : null);
              refresh();
            }}
          />
          <button className="link-btn" onClick={() => setBatch(batch + 1 < ready.length ? batch + 1 : null)}>
            {t("lab.skip")}
          </button>
        </div>
      )}
      <div className="grid">
        {g.bookings.map((b) => (
          <LabCard key={b._id} b={b} />
        ))}
      </div>
    </section>
  );
}

// ---------- rate list ----------
function RateList() {
  const { t } = useT();
  const q = useQuery({ queryKey: ["labTests"], queryFn: () => get("/lab/tests") });
  const [search, setSearch] = useState("");
  return (
    <QueryState query={q} empty={t("lab.noTests")}>
      {(d) => (
        <>
          <p className="muted">{t("lab.rateIntro", { pct: d.lab.commissionPercent })}</p>
          <input className="search" placeholder={t("lab.searchTest")} aria-label={t("lab.searchTest")} value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("lab.col.test")}</th>
                  <th>{t("lab.col.walkIn")}</th>
                  <th>{t("lab.col.patient")}</th>
                  <th>{t("lab.labShare")}</th>
                  <th>{t("lab.col.active")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.data
                  .filter((x) => x.name.toLowerCase().includes(search.toLowerCase()))
                  .map((x) => (
                    <TestRow key={x._id} test={x} />
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </QueryState>
  );
}

function TestRow({ test }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [walkIn, setWalkIn] = useState(String(test.walkInPrice));
  const [listing, setListing] = useState(String(test.listingPrice));
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const dirty = Number(walkIn) !== test.walkInPrice || Number(listing) !== test.listingPrice;

  async function save(body) {
    setErr("");
    try {
      await patch(`/lab/tests/${test._id}`, body);
      qc.invalidateQueries({ queryKey: ["labTests"] });
      setOk(true);
      setTimeout(() => setOk(false), 1500);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  return (
    <tr className={test.active ? "" : "row-off"}>
      <td>
        {test.name}
        {err && <div className="field-error">{err}</div>}
      </td>
      <td>
        <input className="price-input" inputMode="numeric" value={walkIn} onChange={(e) => setWalkIn(e.target.value.replace(/\D/g, ""))} aria-label={t("lab.walkInAria", { test: test.name })} />
      </td>
      <td>
        <input className="price-input" inputMode="numeric" value={listing} onChange={(e) => setListing(e.target.value.replace(/\D/g, ""))} aria-label={t("lab.patientAria", { test: test.name })} />
      </td>
      <td>{rs(test.b2bPrice)}</td>
      <td>
        <button className={`pill ${test.active ? "on" : ""}`} onClick={() => save({ active: !test.active })} aria-pressed={test.active}>
          {test.active ? t("common.yes") : t("lab.off")}
        </button>
      </td>
      <td>
        {dirty && (
          <button
            className="primary-btn small"
            onClick={() =>
              save({
                ...(Number(walkIn) !== test.walkInPrice ? { walkInPrice: Number(walkIn) } : {}),
                ...(Number(listing) !== test.listingPrice ? { listingPrice: Number(listing) } : {}),
              })
            }
          >
            {t("common.save")}
          </button>
        )}
        {ok && <span className="ok-inline">✓</span>}
      </td>
    </tr>
  );
}

// ---------- money ----------
const todayIst = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10);
const modeLabel = (t, m) => ({ cash: t("lab.mode.cash"), upi: t("lab.mode.upi"), online: t("lab.mode.online") })[m] || m;

function downloadCsv(name, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

// Who pays whom, from the lab's side. value > 0: platform pays the lab.
function Owe({ value, big }) {
  const { t } = useT();
  if (!value) return <span className="muted">{t("lab.even")}</span>;
  return (
    <span className={`net ${value > 0 ? "net-pay" : "net-get"} ${big ? "big" : ""}`}>
      {rs(Math.abs(value))}
      <small>{value > 0 ? t("lab.youGet") : t("lab.youPay")}</small>
    </span>
  );
}

const settleText = (t, s) => (s ? (s.status === "paid" ? t("lab.settlePaid", { ref: s.reference }) : t("lab.settleMade")) : t("lab.settleNext"));

function Settlements() {
  const { t } = useT();
  const [range, setRange] = useState({ from: `${todayIst().slice(0, 8)}01`, to: todayIst() });
  const q = useQuery({ queryKey: ["labFinance", range], queryFn: () => get("/lab/finance", range), placeholderData: (p) => p });
  const presets = [
    [t("range.month"), { from: `${todayIst().slice(0, 8)}01`, to: todayIst() }],
    [t("range.7"), { from: daysAgo(6), to: todayIst() }],
    [t("range.30"), { from: daysAgo(29), to: todayIst() }],
    [t("range.year"), { from: `${todayIst().slice(0, 4)}-01-01`, to: todayIst() }],
  ];
  return (
    <>
      <div className="card toolbar">
        <div className="pill-row">
          {presets.map(([label, r]) => (
            <button key={label} className={`pill ${range.from === r.from && range.to === r.to ? "on" : ""}`} onClick={() => setRange(r)}>
              {label}
            </button>
          ))}
        </div>
        <div className="filters">
          <label className="small">
            {t("range.from")} <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} />
          </label>
          <label className="small">
            {t("range.to")} <input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} />
          </label>
        </div>
      </div>
      <QueryState query={q}>
        {(d) => {
          const tot = d.totals;
          const net = tot.pendingNet;
          return (
            <>
              <div className="card final-card">
                <div className="final-head">
                  <div>
                    <span className="flow-label">{t("lab.finalTitle", { from: prettyDate(d.range.from), to: prettyDate(d.range.to) })}</span>
                    <h2>{net > 0 ? t("lab.finalPay", { amt: rs(net) }) : net < 0 ? t("lab.finalGet", { amt: rs(-net) }) : t("lab.finalEven")}</h2>
                    <p className="muted small">{t("lab.finalNote")}</p>
                  </div>
                  <div className="final-profit">
                    <span>{t("lab.earning")}</span>
                    <strong>{rs(tot.labEarning)}</strong>
                    <small>{t("lab.earningSub", { n: tot.bookings, pct: d.lab.commissionPercent })}</small>
                  </div>
                </div>
                <div className="final-steps">
                  <div>
                    <span>{t("lab.cashWithYou")}</span>
                    <strong>{rs(tot.cashCollected)}</strong>
                  </div>
                  <div>
                    <span>{t("lab.onlineToUs")}</span>
                    <strong>{rs(tot.onlineCollected)}</strong>
                  </div>
                  <div>
                    <span>{t("lab.commission")}</span>
                    <strong>{rs(tot.commission)}</strong>
                  </div>
                  <div className="hl">
                    <span>{t("lab.yourShare")}</span>
                    <strong>{rs(tot.labEarning)}</strong>
                  </div>
                </div>
              </div>

              <div className="flow-grid">
                <div className="card flow flow-get">
                  <span className="flow-label">{t("lab.youOwe")}</span>
                  <strong>{rs(tot.labOwesUs)}</strong>
                  <p className="muted small">{t("lab.youOweSub")}</p>
                </div>
                <div className="card flow flow-pay">
                  <span className="flow-label">{t("lab.weOwe")}</span>
                  <strong>{rs(tot.weOweLab)}</strong>
                  <p className="muted small">{t("lab.weOweSub")}</p>
                </div>
                <div className="card flow flow-net">
                  <span className="flow-label">{t("lab.weeklyPending")}</span>
                  <Owe value={d.pendingSettlements.net} big />
                  <p className="muted small">{t("lab.weeklyPendingSub", { n: d.pendingSettlements.count })}</p>
                </div>
              </div>

              <div className="card">
                <div className="row-between wrap">
                  <div>
                    <h3>{t("lab.ledgerTitle")}</h3>
                    <p className="muted small">{t("lab.ledgerSub")}</p>
                  </div>
                  {d.data.length > 0 && (
                    <button
                      className="secondary-btn small"
                      onClick={() =>
                        downloadCsv(`ledger_${d.range.from}_${d.range.to}.csv`, [
                          [t("lab.csv.code"), t("lab.csv.patient"), t("lab.csv.collected"), t("lab.csv.payment"), t("lab.csv.bill"), t("lab.yourShare"), t("lab.commission"), t("lab.csv.who"), t("lab.csv.amount"), t("lab.csv.settlement")],
                          ...d.data.map((b) => [
                            b.code,
                            b.patientName,
                            prettyDateTime(b.collectedAt),
                            modeLabel(t, b.mode),
                            b.total,
                            b.labPayout,
                            b.commission,
                            b.net > 0 ? t("lab.csv.weePay") : t("lab.csv.labPays"),
                            Math.abs(b.net),
                            settleText(t, b.settlement),
                          ]),
                        ])
                      }
                    >
                      {t("lab.csvBtn")}
                    </button>
                  )}
                </div>
                {d.data.length === 0 ? (
                  <p className="muted">{t("lab.noSamples")}</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t("lab.col.booking")}</th>
                          <th>{t("lab.csv.payment")}</th>
                          <th className="num">{t("lab.csv.bill")}</th>
                          <th className="num">{t("lab.yourShare")}</th>
                          <th className="num">{t("lab.col.platform")}</th>
                          <th className="num">{t("lab.col.net")}</th>
                          <th>{t("lab.csv.settlement")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.data.map((b) => (
                          <tr key={b._id}>
                            <td>
                              <strong>{b.patientName}</strong>
                              <div className="muted small">
                                <code>{b.code}</code> · {prettyDateTime(b.collectedAt)}
                              </div>
                            </td>
                            <td>
                              <span className={`mode mode-${b.mode}`}>{modeLabel(t, b.mode)}</span>
                            </td>
                            <td className="num">{rs(b.total)}</td>
                            <td className="num strong">{rs(b.labPayout)}</td>
                            <td className="num">{rs(b.commission)}</td>
                            <td className="num">
                              <Owe value={b.net} />
                            </td>
                            <td className="small">{settleText(t, b.settlement)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th>{t("lab.totalN", { n: tot.bookings })}</th>
                          <th></th>
                          <th className="num">{rs(tot.gross)}</th>
                          <th className="num">{rs(tot.labEarning)}</th>
                          <th className="num">{rs(tot.commission)}</th>
                          <th className="num">
                            <Owe value={tot.net} />
                          </th>
                          <th></th>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
              <WeeklySettlements />
            </>
          );
        }}
      </QueryState>
    </>
  );
}

function WeeklySettlements() {
  const { t } = useT();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["labSettlements", page], queryFn: () => get("/lab/settlements", { page }) });
  return (
    <div className="card">
      <h3>{t("lab.weeklyTitle")}</h3>
      <p className="muted small">{t("lab.weeklySub")}</p>
      <QueryState query={q} empty={t("lab.weeklyEmpty")}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("lab.col.week")}</th>
                    <th className="num">{t("lab.col.gross")}</th>
                    <th className="num">{t("lab.yourShare")}</th>
                    <th className="num">{t("lab.cashWithYou")}</th>
                    <th className="num">{t("lab.col.final")}</th>
                    <th>{t("lab.col.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((s) => (
                    <tr key={s._id}>
                      <td className="strong">
                        {prettyDate(s.weekStart.slice(0, 10))} – {prettyDate(new Date(new Date(s.weekEnd).getTime() - 86400000).toISOString().slice(0, 10))}
                      </td>
                      <td className="num">{rs(s.gross)}</td>
                      <td className="num">{rs(s.labPayout)}</td>
                      <td className="num">{rs(s.cashWithLab)}</td>
                      <td className="num">
                        <Owe value={s.netPayable} />
                      </td>
                      <td>
                        <Badge status={s.status} label={s.status === "paid" ? t("status.paid") : t("status.pending")} />
                        {s.status === "paid" && (
                          <div className="muted small">
                            {prettyDateTime(s.paidAt)} · {t("lab.ref", { ref: s.reference })}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager meta={d.meta} onPage={setPage} />
          </>
        )}
      </QueryState>
    </div>
  );
}
