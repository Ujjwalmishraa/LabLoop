import { useState } from "react";
import { Icon } from "../../components/Icons.jsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch, upload, errorMessage } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { PanelShell, Badge, ErrorMsg, Field, Pager, QueryState, Stat } from "../../components/ui.jsx";
import { rs, prettyDate, prettyDateTime, LAB_SLOTS } from "../../utils.js";

const FLOW = [
  { key: "requested", label: "Nayi request", icon: "inbox" },
  { key: "confirmed", label: "Sample lena hai", icon: "truck" },
  { key: "collected", label: "Report daalni hai", icon: "upload" },
  { key: "report_ready", label: "Ho gaya", icon: "checkCircle" },
];

export default function LabPanel() {
  const { user } = useAuth();
  const [tab, setTab] = useState("requested");
  // Counts come with every bookings response; a tiny query keeps them fresh on every tab
  const counts = useQuery({ queryKey: ["labCounts"], queryFn: () => get("/lab/bookings", { limit: 1 }), refetchInterval: 15_000 });
  const c = counts.data?.counts || {};
  const tabs = [...FLOW.map((f) => ({ ...f, count: c[f.key] || 0 })), { key: "tests", label: "Rate list", icon: "list" }, { key: "money", label: "Hisaab & settlement", icon: "wallet" }];

  return (
    <PanelShell role={user.lab?.name ? `Lab · ${user.lab.name}` : "Lab panel"} tabs={tabs} value={tab} onChange={setTab}>
        {FLOW.some((f) => f.key === tab) && <BookingList status={tab} />}
        {tab === "tests" && <RateList />}
        {tab === "money" && <Settlements />}
    </PanelShell>
  );
}

function BookingList({ status }) {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["labBookings", status, page],
    queryFn: () => get("/lab/bookings", { status, page, limit: 20, sort: status === "report_ready" ? "-createdAt" : "date" }),
    refetchInterval: 15_000, // new requests appear on their own
  });
  return (
    <QueryState query={q} empty="Is section mein abhi kuch nahi hai.">
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

function LabCard({ b }) {
  const qc = useQueryClient();
  const [time, setTime] = useState(LAB_SLOTS.find((s) => b.slot?.startsWith(s.slice(0, 8))) || LAB_SLOTS[0]);
  const [otp, setOtp] = useState("");
  const [payMode, setPayMode] = useState(b.payment?.mode === "upi" ? "upi" : "cash");
  const [file, setFile] = useState(null);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setErr("");
    setBusy(true);
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ["labBookings"] });
      qc.invalidateQueries({ queryKey: ["labCounts"] });
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
    <div className="card" data-testid="lab-card">
      <div className="row-between">
        <h3>
          {b.patientName}
          {b.patientAge ? `, ${b.patientAge} saal` : ""}
        </h3>
        <Badge status={b.status} />
      </div>
      {b.source === "doctor" && <div className="chip ref"><Icon name="steth" size={15} /> {b.referredBy?.name} ne refer kiya</div>}
      <p className="meta">
        <Icon name="pin" size={17} /> {b.village?.name} · {b.address}
      </p>
      <p className="meta">
        <Icon name="phone" size={17} />
        <a href={`tel:${b.patient?.phone}`} className="link-btn">
          {b.patient?.phone}
        </a>
        <span className="code-chip">{b.code}</span>
      </p>
      <p className="meta strong">
        <Icon name="flask" size={17} /> {b.items.map((i) => i.name).join(", ")}
      </p>
      <p className="meta">
        <Icon name="calendar" size={17} /> {prettyDate(b.date)} · {b.collectionTime || b.slot}
      </p>
      <div className="row-between">
        <span className="muted">
          Patient dega ({b.payment?.mode === "upi" ? "UPI" : "Cash"})
        </span>
        <strong>{rs(b.total)}</strong>
      </div>
      <div className="row-between">
        <span className="muted small">Lab ka hissa</span>
        <span className="small">{rs(b.labPayout)}</span>
      </div>

      {b.status === "requested" && (
        <div className="actions">
          <Field label="Collector kab jaayega?">
            <select value={time} onChange={(e) => setTime(e.target.value)}>
              {LAB_SLOTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          {rejecting ? (
            <>
              <Field label="Mana karne ka kaaran">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Collector nahi hai, test nahi hota…" />
              </Field>
              <div className="btn-row">
                <button className="secondary-btn small danger" disabled={busy} onClick={() => run(() => patch(`/lab/bookings/${b._id}/reject`, { reason: reason || undefined }))}>
                  Haan, mana karein
                </button>
                <button className="link-btn" onClick={() => setRejecting(false)}>
                  Rehne dein
                </button>
              </div>
            </>
          ) : (
            <div className="btn-row">
              <button className="primary-btn small" disabled={busy} onClick={() => run(() => patch(`/lab/bookings/${b._id}/confirm`, { collectionTime: time }))}>
                ✓ Confirm, sample lene aayenge
              </button>
              <button className="secondary-btn small" disabled={busy} onClick={() => setRejecting(true)}>
                Mana karein
              </button>
            </div>
          )}
        </div>
      )}

      {b.status === "confirmed" && (
        <div className="actions">
          {b.otpLocked ? (
            <p className="error">OTP 5 baar galat hua, booking lock hai. NidaanSetu team ko call karein.</p>
          ) : (
            <>
              <Field label="Patient se OTP lekar daalein">
                <input inputMode="numeric" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="4 ank" aria-label="OTP" />
              </Field>
              <div className="pill-row" role="radiogroup" aria-label="Payment">
                {[
                  ["cash", "Cash liya"],
                  ["upi", "UPI se mila"],
                ].map(([k, l]) => (
                  <button key={k} role="radio" aria-checked={payMode === k} className={`pill ${payMode === k ? "on" : ""}`} onClick={() => setPayMode(k)}>
                    {l}
                  </button>
                ))}
              </div>
              <button className="primary-btn small" disabled={busy || otp.length !== 4} onClick={() => run(() => patch(`/lab/bookings/${b._id}/collect`, { otp, paymentMode: payMode }))}>
                Sample le liya ✓
              </button>
            </>
          )}
        </div>
      )}

      {b.status === "collected" && (
        <div className="actions">
          <Field label="Report upload karein (PDF, JPG ya PNG, 5 MB tak)">
            <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} aria-label="Report file" />
          </Field>
          {file && file.size > 5 * 1024 * 1024 && <p className="error">File 5 MB se badi hai</p>}
          <button className="primary-btn small" disabled={busy || !file || file.size > 5 * 1024 * 1024} onClick={() => run(() => upload(`/lab/bookings/${b._id}/report`, "report", file))}>
            {busy ? "Upload ho raha hai…" : "📄 Report bhejein"}
          </button>
        </div>
      )}

      {b.status === "report_ready" && (
        <button className="secondary-btn small" onClick={viewReport}>
          Report dekhein ({b.report?.name})
        </button>
      )}
      <ErrorMsg msg={err} />
    </div>
  );
}

function RateList() {
  const q = useQuery({ queryKey: ["labTests"], queryFn: () => get("/lab/tests") });
  const [search, setSearch] = useState("");
  return (
    <QueryState query={q} empty="Abhi koi test nahi juda. Agent se rate list judwayein.">
      {(d) => (
        <>
          <p className="muted">
            Walk-in rate aapka counter rate hai. Patient rate app pe dikhta hai. Lab ka hissa = walk-in rate − {d.lab.commissionPercent}%.
          </p>
          <input className="search" placeholder="Test dhoondein" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Walk-in rate</th>
                  <th>Patient rate</th>
                  <th>Lab ka hissa</th>
                  <th>Chalu?</th>
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
        <input className="price-input" inputMode="numeric" value={walkIn} onChange={(e) => setWalkIn(e.target.value.replace(/\D/g, ""))} aria-label={`${test.name} walk-in rate`} />
      </td>
      <td>
        <input className="price-input" inputMode="numeric" value={listing} onChange={(e) => setListing(e.target.value.replace(/\D/g, ""))} aria-label={`${test.name} patient rate`} />
      </td>
      <td>{rs(test.b2bPrice)}</td>
      <td>
        <button className={`pill ${test.active ? "on" : ""}`} onClick={() => save({ active: !test.active })} aria-pressed={test.active}>
          {test.active ? "Haan" : "Band"}
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
            Save
          </button>
        )}
        {ok && <span className="ok-inline">✓</span>}
      </td>
    </tr>
  );
}

const todayIst = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10);
const MODE_LABEL = { cash: "Cash (aapne liya)", upi: "UPI (platform pe)", online: "Online (platform pe)" };

function downloadCsv(name, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

// Who pays whom, from the lab's side. value > 0: platform pays the lab.
function Owe({ value, big }) {
  if (!value) return <span className="muted">Barabar ₹0</span>;
  return (
    <span className={`net ${value > 0 ? "net-pay" : "net-get"} ${big ? "big" : ""}`}>
      {rs(Math.abs(value))}
      <small>{value > 0 ? "aapko milega" : "aapko dena hai"}</small>
    </span>
  );
}

function Settlements() {
  const [range, setRange] = useState({ from: `${todayIst().slice(0, 8)}01`, to: todayIst() });
  const q = useQuery({ queryKey: ["labFinance", range], queryFn: () => get("/lab/finance", range), placeholderData: (p) => p });
  const presets = [
    ["Is mahine", { from: `${todayIst().slice(0, 8)}01`, to: todayIst() }],
    ["Pichhle 7 din", { from: daysAgo(6), to: todayIst() }],
    ["Pichhle 30 din", { from: daysAgo(29), to: todayIst() }],
    ["Is saal", { from: `${todayIst().slice(0, 4)}-01-01`, to: todayIst() }],
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
            Se <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} />
          </label>
          <label className="small">
            Tak <input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} />
          </label>
        </div>
      </div>
      <QueryState query={q}>
        {(d) => {
          const t = d.totals;
          const net = t.pendingNet;
          return (
            <>
              <div className="card final-card">
                <div className="final-head">
                  <div>
                    <span className="flow-label">
                      Final hisaab · {prettyDate(d.range.from)} se {prettyDate(d.range.to)}
                    </span>
                    <h2>
                      {net > 0 ? (
                        <>
                          Platform aapko <span className="amt pay">{rs(net)}</span> dega
                        </>
                      ) : net < 0 ? (
                        <>
                          Aapko platform ko <span className="amt get">{rs(-net)}</span> dene hain
                        </>
                      ) : (
                        <>Hisaab barabar hai, kisi ko kuch nahi dena</>
                      )}
                    </h2>
                    <p className="muted small">Jo settlement abhi paid nahi hua, sirf uska. Admin ko bhi bilkul yahi hisaab dikhta hai.</p>
                  </div>
                  <div className="final-profit">
                    <span>Aapki kamai</span>
                    <strong>{rs(t.labEarning)}</strong>
                    <small>
                      {t.bookings} sample · {d.lab.commissionPercent}% commission kat ke
                    </small>
                  </div>
                </div>
                <div className="final-steps">
                  <div>
                    <span>Cash aapke paas</span>
                    <strong>{rs(t.cashCollected)}</strong>
                  </div>
                  <div>
                    <span>Online platform pe aaya</span>
                    <strong>{rs(t.onlineCollected)}</strong>
                  </div>
                  <div>
                    <span>Platform ka commission</span>
                    <strong>{rs(t.commission)}</strong>
                  </div>
                  <div className="hl">
                    <span>Aapka hissa</span>
                    <strong>{rs(t.labEarning)}</strong>
                  </div>
                </div>
              </div>

              <div className="flow-grid">
                <div className="card flow flow-get">
                  <span className="flow-label">Aapko platform ko dena hai</span>
                  <strong>{rs(t.labOwesUs)}</strong>
                  <p className="muted small">Cash bookings: mareez se poora paisa aapne liya, usme se platform ka commission.</p>
                </div>
                <div className="card flow flow-pay">
                  <span className="flow-label">Platform aapko dega</span>
                  <strong>{rs(t.weOweLab)}</strong>
                  <p className="muted small">Online bookings: paisa platform pe aaya, usme se aapka hissa.</p>
                </div>
                <div className="card flow flow-net">
                  <span className="flow-label">Weekly settlement (paid hona baaki)</span>
                  <Owe value={d.pendingSettlements.net} big />
                  <p className="muted small">{d.pendingSettlements.count} hafte ka hisaab bana hai, payment abhi baaki.</p>
                </div>
              </div>

              <div className="card">
                <div className="row-between wrap">
                  <div>
                    <h3>Har booking ka record</h3>
                    <p className="muted small">Sirf woh bookings jinka sample is samay mein liya gaya.</p>
                  </div>
                  {d.data.length > 0 && (
                    <button
                      className="secondary-btn small"
                      onClick={() =>
                        downloadCsv(`hisaab_${d.range.from}_${d.range.to}.csv`, [
                          ["Code", "Mareez", "Sample liya", "Payment", "Mareez ka bill", "Aapka hissa", "Platform ka commission", "Kaun dega", "Amount", "Settlement"],
                          ...d.data.map((b) => [
                            b.code,
                            b.patientName,
                            prettyDateTime(b.collectedAt),
                            MODE_LABEL[b.mode] || b.mode,
                            b.total,
                            b.labPayout,
                            b.commission,
                            b.net > 0 ? "Platform lab ko dega" : "Lab platform ko dega",
                            Math.abs(b.net),
                            settleText(b.settlement),
                          ]),
                        ])
                      }
                    >
                      ⬇ Excel (CSV)
                    </button>
                  )}
                </div>
                {d.data.length === 0 ? (
                  <p className="muted">Is samay mein koi sample nahi liya gaya.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Booking</th>
                          <th>Payment</th>
                          <th className="num">Mareez ka bill</th>
                          <th className="num">Aapka hissa</th>
                          <th className="num">Platform ka</th>
                          <th className="num">Lena / dena</th>
                          <th>Settlement</th>
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
                              <span className={`mode mode-${b.mode}`}>{MODE_LABEL[b.mode] || b.mode}</span>
                            </td>
                            <td className="num">{rs(b.total)}</td>
                            <td className="num strong">{rs(b.labPayout)}</td>
                            <td className="num">{rs(b.commission)}</td>
                            <td className="num">
                              <Owe value={b.net} />
                            </td>
                            <td className="small">{settleText(b.settlement)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th>Kul ({t.bookings})</th>
                          <th></th>
                          <th className="num">{rs(t.gross)}</th>
                          <th className="num">{rs(t.labEarning)}</th>
                          <th className="num">{rs(t.commission)}</th>
                          <th className="num">
                            <Owe value={t.net} />
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

const settleText = (s) => (s ? (s.status === "paid" ? `Paid · Ref ${s.reference}` : "Hafte ka hisaab bana, payment baaki") : "Agle Somvaar hisaab banega");

function WeeklySettlements() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["labSettlements", page], queryFn: () => get("/lab/settlements", { page }) });
  return (
    <div className="card">
      <h3>Hafte ke settlement</h3>
      <p className="muted small">Har Somvaar subah pichhle hafte ka hisaab banta hai. Final = aapka hissa − aapke paas aaya cash.</p>
      <QueryState query={q} empty="Abhi koi hafte ka hisaab nahi bana.">
        {(d) => (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Hafta</th>
                    <th className="num">Kul bill</th>
                    <th className="num">Aapka hissa</th>
                    <th className="num">Cash aapke paas</th>
                    <th className="num">Final</th>
                    <th>Status</th>
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
                        <Badge status={s.status} label={s.status === "paid" ? "Paid" : "Baaki"} />
                        {s.status === "paid" && (
                          <div className="muted small">
                            {prettyDateTime(s.paidAt)} · Ref {s.reference}
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
