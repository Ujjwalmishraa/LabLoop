import { useState } from "react";
import { Icon } from "../../components/Icons.jsx";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del, errorMessage, fieldErrors } from "../../api/client.js";
import { PanelShell, Badge, ErrorMsg, Field, Pager, QueryState, Stat, TempPassword } from "../../components/ui.jsx";
import { rs, prettyDate, prettyDateTime, roleLabel, ROLES } from "../../utils.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { t as tx, locale } from "../../i18n/I18nContext.jsx";

const TABS = [
  { key: "dash", get label() { return tx("admin.dashboard"); }, icon: "chart" },
  { key: "finance", get label() { return tx("admin.hisaabCommission"); }, icon: "rupee" },
  { key: "rules", get label() { return tx("admin.rulesRates"); }, icon: "shield" },
  { key: "agents", get label() { return tx("admin.agents"); }, icon: "briefcase" },
  { key: "users", get label() { return tx("admin.users"); }, icon: "users" },
  { key: "labs", get label() { return tx("admin.labs"); }, icon: "flask" },
  { key: "doctors", get label() { return tx("admin.doctors"); }, icon: "steth" },
  { key: "villages", get label() { return tx("admin.gaon"); }, icon: "map" },
  { key: "bookings", get label() { return tx("admin.bookings"); }, icon: "file" },
  { key: "appts", get label() { return tx("admin.appointments"); }, icon: "calendar" },
  { key: "settle", get label() { return tx("admin.settlements"); }, icon: "wallet" },
  { key: "audit", get label() { return tx("admin.auditLog"); }, icon: "log" },
];

export default function AdminPanel() {
  const [tab, setTab] = useState("dash");
  return (
    <PanelShell
      role="Super admin"
      tabs={TABS}
      value={tab}
      onChange={setTab}
      actions={
        <Link className="primary-btn small" to="/agent">
          <Icon name="plus" size={18} />
          {tx("admin.labDoctorJodein")}
        </Link>
      }
    >
        {tab === "dash" && <Dashboard />}
        {tab === "finance" && <Finance />}
        {tab === "rules" && <RulesRates />}
        {tab === "agents" && <Agents />}
        {tab === "users" && <Users />}
        {tab === "labs" && <Labs />}
        {tab === "doctors" && <Doctors />}
        {tab === "villages" && <Villages />}
        {tab === "bookings" && <Bookings />}
        {tab === "appts" && <Appointments />}
        {tab === "settle" && <Settlements />}
        {tab === "audit" && <Audit />}
    </PanelShell>
  );
}

// Paginated list with a filter object; resets to page 1 when filters change.
function useList(key, url, filters) {
  const [page, setPage] = useState(1);
  const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "" && v !== undefined));
  const sig = JSON.stringify(clean);
  const [lastSig, setLastSig] = useState(sig);
  if (sig !== lastSig) {
    setLastSig(sig);
    setPage(1);
  }
  const q = useQuery({ queryKey: [key, page, clean], queryFn: () => get(url, { page, limit: 20, ...clean }), placeholderData: (prev) => prev });
  return { q, page, setPage };
}

function Filters({ children }) {
  return <div className="filters">{children}</div>;
}

// ---------- dashboard ----------
const fmtShort = (v) => (v >= 1e5 ? `₹${(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `₹${(v / 1e3).toFixed(1)}k` : `₹${v}`);

// Tiny trend line for the hero tiles.
function Spark({ data, valueKey }) {
  const vals = data.map((d) => d[valueKey] || 0);
  const max = Math.max(1, ...vals);
  const W = 120;
  const H = 34;
  const pts = vals.map((v, i) => `${((i / Math.max(1, vals.length - 1)) * W).toFixed(1)},${(H - 3 - (v / max) * (H - 6)).toFixed(1)}`);
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" />
    </svg>
  );
}

function Hero({ s, days }) {
  const { user } = useAuth();
  const first = (user?.name || "Admin").split(/\s+/)[0];
  const hour = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  const greet = hour < 12 ? tx("admin.suprabhat") : hour < 17 ? tx("admin.namaste") : tx("admin.shubhSandhya");
  const today = new Date().toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const tiles = [
    { icon: "file", label: tx("admin.bookings"), value: s.bookings, spark: "bookings" },
    { icon: "rupee", label: tx("admin.kulKaarobaarGmv"), value: rs(s.gmv), spark: "gmv" },
    { icon: "sparkle", label: tx("admin.platformKiKamai"), value: rs(s.platformMargin) },
    { icon: "users", label: tx("admin.mareezJudey"), value: s.counts.patients },
  ];
  return (
    <section className="hero-banner">
      <div className="hero-blob b1" aria-hidden="true" />
      <div className="hero-blob b2" aria-hidden="true" />
      <div className="hero-top">
        <div>
          <span className="hero-live">
            <span className="pulse" aria-hidden="true" /> {tx("admin.live")} {today}
          </span>
          <h2>
            {greet}, {first} 👋
          </h2>
          <p>{tx("admin.pichhle")} {days} {tx("admin.dinMeinLabloopKa")}</p>
        </div>
        <div className="hero-net">
          <span>{tx("admin.network")}</span>
          <strong>
            {s.counts.labs} {tx("admin.lab")} {s.counts.doctors} {tx("admin.doctor")} {s.counts.villages} {tx("admin.gaon2")}
          </strong>
        </div>
      </div>
      <div className="hero-tiles">
        {tiles.map((t, i) => (
          <div key={t.label} className="hero-tile" style={{ animationDelay: `${i * 70}ms` }}>
            <span className="hero-tile-icon">
              <Icon name={t.icon} size={18} />
            </span>
            <span className="hero-tile-label">{t.label}</span>
            <strong>{t.value}</strong>
            {t.spark && <Spark data={s.bookingsPerDay} valueKey={t.spark} />}
          </div>
        ))}
      </div>
    </section>
  );
}

// Smooth area chart that stretches to the card width.
function AreaChart({ data, valueKey, label, format = (v) => v, tone = "teal" }) {
  const vals = data.map((d) => d[valueKey] || 0);
  const total = vals.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...vals);
  const W = 600;
  const H = 170;
  const x = (i) => (i / Math.max(1, vals.length - 1)) * W;
  const y = (v) => H - 8 - (v / max) * (H - 24);
  let line = "";
  vals.forEach((v, i) => {
    if (i === 0) line += `M${x(i)},${y(v)}`;
    else {
      const cx = (x(i - 1) + x(i)) / 2;
      line += ` C${cx},${y(vals[i - 1])} ${cx},${y(v)} ${x(i)},${y(v)}`;
    }
  });
  const area = `${line} L${W},${H} L0,${H} Z`;
  const id = `g-${valueKey}`;
  const step = Math.ceil(data.length / 6);
  return (
    <figure className={`card area-chart tone-${tone}`}>
      <figcaption>
        <span className="field-label">{label}</span>
        <strong>{format(total)}</strong>
      </figcaption>
      {total === 0 ? (
        <p className="chart-empty">{tx("admin.isSamayMeinAbhi")}</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label}: ${format(total)}`}>
            <defs>
              <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="grid-line" />
            ))}
            <path d={area} fill={`url(#${id})`} />
            <path d={line} className="area-line" />
            {vals.map((v, i) => (
              <g key={i}>
                <title>{`${prettyDate(data[i].date)}: ${format(v)}`}</title>
                <rect x={x(i) - W / vals.length / 2} y="0" width={W / vals.length} height={H} fill="transparent" />
              </g>
            ))}
          </svg>
          <div className="area-axis">
            {data.map((d, i) =>
              i % step === 0 ? (
                <span key={d.date}>
                  {Number(d.date.slice(8))}/{Number(d.date.slice(5, 7))}
                </span>
              ) : null,
            )}
          </div>
        </>
      )}
    </figure>
  );
}

// Donut + legend: pending vs done, for lab tests and doctor tokens.
function Progress({ title, icon, groups }) {
  const total = groups.reduce((n, g) => n + g.n, 0);
  const done = groups.find((g) => g.main)?.n || 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="card work-card">
      <h3 className="meta strong">
        <Icon name={icon} size={20} /> {title}
      </h3>
      <div className="donut-wrap">
        <svg className="donut" viewBox="0 0 140 140" role="img" aria-label={`${title}: ${total}`}>
          <circle cx="70" cy="70" r={R} className="donut-track" />
          {total > 0 &&
            groups.map((g) => {
              if (!g.n) return null;
              const len = (g.n / total) * C;
              const el = <circle key={g.label} cx="70" cy="70" r={R} className={`donut-seg stroke-${g.tone}`} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />;
              offset += len;
              return el;
            })}
          <text x="70" y="68" textAnchor="middle" className="donut-num">
            {total}
          </text>
          <text x="70" y="88" textAnchor="middle" className="donut-sub">
            {total ? tx("admin.poora", { v1: Math.round((done / total) * 100) }) : tx("admin.kul")}
          </text>
        </svg>
        <div className="work-legend">
          {groups.map((g) => (
            <div key={g.label}>
              <span className={`dot-${g.tone}`} />
              <span>{g.label}</span>
              <strong>{g.n}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkStatus({ s }) {
  const b = s.byStatus || {};
  const a = s.apptByStatus || {};
  return (
    <div className="two">
      <Progress
        title={tx("admin.labJaanch")}
        icon="flask"
        groups={[
          { label: tx("admin.nayiRequestPending"), n: b.requested || 0, tone: "amber" },
          { label: tx("admin.sampleLenaBaaki"), n: b.confirmed || 0, tone: "violet" },
          { label: tx("admin.reportBaaki"), n: b.collected || 0, tone: "teal" },
          { label: tx("admin.pooraReportDi"), n: b.report_ready || 0, tone: "green", main: true },
          { label: tx("admin.cancel"), n: b.cancelled || 0, tone: "rose" },
        ]}
      />
      <Progress
        title={tx("admin.doctorKeNumber")}
        icon="steth"
        groups={[
          { label: tx("admin.aanaBaakiPending"), n: a.booked || 0, tone: "amber" },
          { label: tx("admin.dekhLiyaPoora"), n: a.seen || 0, tone: "green", main: true },
          { label: tx("admin.nahiAaye"), n: a.no_show || 0, tone: "violet" },
          { label: tx("admin.cancel"), n: a.cancelled || 0, tone: "rose" },
        ]}
      />
    </div>
  );
}

function TopVillages({ list }) {
  const max = Math.max(1, ...list.map((v) => v.gmv));
  return (
    <div className="card rank-card">
      <h3 className="meta strong">
        <Icon name="map" size={20} /> {tx("admin.sabseAageGaon")}
      </h3>
      {list.length === 0 ? (
        <p className="chart-empty">{tx("admin.abhiDataNahiBookings")}</p>
      ) : (
        <ol className="rank-list">
          {list.map((v, i) => (
            <li key={v._id}>
              <span className={`rank-no r${i + 1}`}>{i + 1}</span>
              <div className="rank-body">
                <div className="row-between">
                  <strong>{v.name}</strong>
                  <span>
                    {rs(v.gmv)} <small className="muted">· {v.bookings} {tx("admin.booking")}</small>
                  </span>
                </div>
                <div className="rank-bar">
                  <span style={{ width: `${Math.max(4, (v.gmv / max) * 100)}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Dashboard() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ["stats", days], queryFn: () => get("/admin/stats", { days }), refetchInterval: 60_000, placeholderData: (p) => p });
  return (
    <QueryState query={q}>
      {(s) => (
        <>
          <Hero s={s} days={days} />
          <MoneyPanel />
          <div className="row-between wrap dash-section-row">
            <h2 className="dash-section">{tx("admin.kaamKaajPichhle")} {days} {tx("admin.din")}</h2>
            <div className="pill-row">
              {[7, 30, 90].map((d) => (
                <button key={d} className={`pill ${days === d ? "on" : ""}`} onClick={() => setDays(d)}>
                  {d} {tx("admin.din2")}
                </button>
              ))}
            </div>
          </div>
          <div className="stat-row six">
            <Stat icon="chart" tone="violet" label={tx("admin.platformMargin")} value={rs(s.platformMargin)} />
            <Stat icon="wallet" tone="amber" label={tx("admin.labPayout")} value={rs(s.labPayout)} />
            <Stat icon="users" tone="rose" label={tx("admin.repeatRate")} value={`${s.repeatRate}%`} />
            <Stat icon="steth" label={tx("admin.doctorTokens")} value={s.counts.appointments} />
            <Stat icon="briefcase" tone="amber" label={tx("admin.agents")} value={s.counts.agents} />
            <Stat icon="wallet" tone="rose" label={tx("admin.settlementBaaki")} value={s.counts.pendingSettlements} />
          </div>
          <div className="two">
            <AreaChart data={s.bookingsPerDay} valueKey="bookings" label={tx("admin.rozKiBookings")} tone="teal" />
            <AreaChart data={s.bookingsPerDay} valueKey="gmv" label={tx("admin.rozKaKaarobaar")} format={fmtShort} tone="violet" />
          </div>
          <WorkStatus s={s} />
          <TopVillages list={s.topVillages} />
        </>
      )}
    </QueryState>
  );
}

// ---------- finance: commission and settlement per lab ----------
const monthStart = () => {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  return `${d.slice(0, 8)}01`;
};
const todayIst = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const daysAgoIst = (n) => new Date(Date.now() - n * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10);
const MODE_LABEL = { cash: tx("admin.cashLabNeLiya"), upi: tx("admin.upiSitePe"), online: tx("admin.onlineSitePe2") };

// "+₹110 hum denge" / "₹340 lab dega" — the sign alone is too easy to misread.
function Net({ value, big }) {
  if (!value) return <span className="muted">{tx("admin.barabar0")}</span>;
  return (
    <span className={`net ${value > 0 ? "net-pay" : "net-get"} ${big ? "big" : ""}`}>
      {rs(Math.abs(value))}
      <small>{value > 0 ? tx("admin.humLabKoDenge") : tx("admin.labHumeinDega")}</small>
    </span>
  );
}

function downloadCsv(name, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

function Finance() {
  const [range, setRange] = useState({ from: monthStart(), to: todayIst() });
  const [open, setOpen] = useState(null);
  const [onlyActive, setOnlyActive] = useState(true);
  const q = useQuery({ queryKey: ["finance", range], queryFn: () => get("/admin/finance", range), placeholderData: (p) => p });
  const presets = [
    [tx("admin.isMahine"), { from: monthStart(), to: todayIst() }],
    [tx("admin.pichhle7Din"), { from: new Date(Date.now() - 6 * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10), to: todayIst() }],
    [tx("admin.pichhle30Din"), { from: new Date(Date.now() - 29 * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10), to: todayIst() }],
    [tx("admin.isSaal"), { from: `${todayIst().slice(0, 4)}-01-01`, to: todayIst() }],
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
            {tx("admin.se")} <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} />
          </label>
          <label className="small">
            {tx("admin.tak")} <input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} />
          </label>
        </div>
      </div>
      <QueryState query={q}>
        {(d) => {
          const t = d.totals;
          const rows = d.data.filter((r) => !onlyActive || r.bookings > 0);
          return (
            <>
              <MoneyOverview d={d} />

              <div className="card">
                <div className="row-between">
                  <h3>{tx("admin.harLabKaHisaab")}</h3>
                  <div className="btn-row">
                    <label className="small check">
                      <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> {tx("admin.sirfJinkiBookingHai")}
                    </label>
                    <button
                      className="secondary-btn small"
                      onClick={() =>
                        downloadCsv(`hisaab_${d.range.from}_${d.range.to}.csv`, [
                          ["Lab", "Commission %", "Bookings", "GMV", tx("admin.hamaraCommission"), tx("admin.labKiKamai"), tx("admin.cashLabKePaas2"), tx("admin.onlineSitePe2"), tx("admin.labSeLena"), tx("admin.labKoDena"), tx("admin.netHumDengeLab"), tx("admin.netBaaki")],
                          ...d.data.map((r) => [r.lab.name, r.lab.commissionPercent, r.bookings, r.gross, r.commission, r.labEarning, r.cashCollected, r.onlineCollected, r.labOwesUs, r.weOweLab, r.net, r.pendingNet]),
                        ])
                      }
                    >
                      {tx("admin.excelCsv")}
                    </button>
                  </div>
                </div>
                {rows.length === 0 ? (
                  <p className="muted">{tx("admin.isSamayMeinKisi")}</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table finance-table">
                      <thead>
                        <tr>
                          <th>{tx("admin.lab2")}</th>
                          <th className="num">{tx("admin.bookings")}</th>
                          <th className="num">GMV</th>
                          <th className="num">{tx("admin.commission")}</th>
                          <th className="num">{tx("admin.labKiKamai")}</th>
                          <th className="num">{tx("admin.cashLabKePaas")}</th>
                          <th className="num">{tx("admin.onlineSitePe")}</th>
                          <th className="num">{tx("admin.labSeLena")}</th>
                          <th className="num">{tx("admin.labKoDena")}</th>
                          <th className="num">{tx("admin.netBaaki")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <FinanceRow key={r.lab._id} r={r} range={d.range} open={open === r.lab._id} onToggle={() => setOpen(open === r.lab._id ? null : r.lab._id)} />
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th>{tx("admin.kul2")}</th>
                          <th className="num">{t.bookings}</th>
                          <th className="num">{rs(t.gross)}</th>
                          <th className="num">{rs(t.commission)}</th>
                          <th className="num">{rs(t.labEarning)}</th>
                          <th className="num">{rs(t.cashCollected)}</th>
                          <th className="num">{rs(t.onlineCollected)}</th>
                          <th className="num">{rs(t.labOwesUs)}</th>
                          <th className="num">{rs(t.weOweLab)}</th>
                          <th className="num">
                            <Net value={t.pendingNet} />
                          </th>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                <p className="muted small">
                  {tx("admin.sirfWohBookingsGinti")}
                </p>
              </div>
              <TestProfit rows={d.byTest || []} collectionFees={t.collectionFees || 0} range={d.range} />
            </>
          );
        }}
      </QueryState>
    </>
  );
}

function FinanceRow({ r, range, open, onToggle }) {
  const q = useQuery({ queryKey: ["financeLab", r.lab._id, range], queryFn: () => get(`/admin/finance/labs/${r.lab._id}`, range), enabled: open });
  return (
    <>
      <tr className={`clickable ${open ? "open" : ""}`} onClick={onToggle}>
        <td>
          <button type="button" className="link-btn" aria-expanded={open}>
            {open ? "▾" : "▸"} {r.lab.name}
          </button>
          <div className="muted small">{r.lab.commissionPercent}{tx("admin.commission2")}</div>
        </td>
        <td className="num">{r.bookings}</td>
        <td className="num">{rs(r.gross)}</td>
        <td className="num strong">{rs(r.commission)}</td>
        <td className="num">{rs(r.labEarning)}</td>
        <td className="num">
          {rs(r.cashCollected)}
          {r.cashBookings > 0 && <div className="muted small">{r.cashBookings} {tx("admin.booking")}</div>}
        </td>
        <td className="num">{rs(r.onlineCollected)}</td>
        <td className="num">{rs(r.labOwesUs)}</td>
        <td className="num">{rs(r.weOweLab)}</td>
        <td className="num">
          <Net value={r.pendingNet} />
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={10}>
            <QueryState query={q} empty={tx("admin.koiBookingNahi")}>
              {(d) => (
                <table className="table inner">
                  <thead>
                    <tr>
                      <th>{tx("admin.code")}</th>
                      <th>{tx("admin.mareez")}</th>
                      <th>{tx("admin.sampleLiya")}</th>
                      <th>{tx("admin.payment")}</th>
                      <th className="num">{tx("admin.total")}</th>
                      <th className="num">{tx("admin.labKa")}</th>
                      <th className="num">{tx("admin.commission")}</th>
                      <th>{tx("admin.settlement")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.data.map((b) => (
                      <tr key={b._id}>
                        <td>
                          <code>{b.code}</code>
                        </td>
                        <td>{b.patientName}</td>
                        <td className="small">{prettyDateTime(b.collectedAt)}</td>
                        <td>
                          <span className={`mode mode-${b.mode}`}>{MODE_LABEL[b.mode] || b.mode}</span>
                        </td>
                        <td className="num">{rs(b.total)}</td>
                        <td className="num">{rs(b.labPayout)}</td>
                        <td className="num">{rs(b.commission)}</td>
                        <td className="small">{b.settlement ? (b.settlement.status === "paid" ? tx("admin.paid2", { reference: b.settlement.reference }) : tx("admin.hisaabBanaPaymentBaaki")) : tx("admin.abhiHisaabNahiBana")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </QueryState>
          </td>
        </tr>
      )}
    </>
  );
}

function TestProfit({ rows, collectionFees, range }) {
  const tot = rows.reduce((a, r) => ({ count: a.count + r.count, revenue: a.revenue + r.revenue, lab: a.lab + r.labShare, plat: a.plat + r.platformShare }), { count: 0, revenue: 0, lab: 0, plat: 0 });
  return (
    <div className="card">
      <div className="row-between wrap">
        <div>
          <h3>{tx("admin.testWiseProfit")}</h3>
          <p className="muted small">{tx("admin.kisTestSeKitna")}</p>
        </div>
        {rows.length > 0 && (
          <button
            className="secondary-btn small"
            onClick={() =>
              downloadCsv(`test_profit_${range.from}_${range.to}.csv`, [
                ["Test", tx("admin.kitniBaar"), tx("admin.patientRate"), tx("admin.mareezSeAaya"), tx("admin.labKaHissa"), tx("admin.platformKaHissa"), "Margin %"],
                ...rows.map((r) => [r.name, r.count, r.minRate === r.maxRate ? r.minRate : `${r.minRate}-${r.maxRate}`, r.revenue, r.labShare, r.platformShare, pct(r.platformShare, r.revenue)]),
              ])
            }
          >
            {tx("admin.excelCsv")}
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="muted">{tx("admin.isSamayMeinKoi")}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{tx("admin.test")}</th>
                <th className="num">{tx("admin.kitniBaar")}</th>
                <th className="num">{tx("admin.patientRate")}</th>
                <th className="num">{tx("admin.mareezSeAaya")}</th>
                <th className="num">{tx("admin.labKaHissa")}</th>
                <th className="num">{tx("admin.platformKaHissa")}</th>
                <th className="num">{tx("admin.margin")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td className="strong">{r.name}</td>
                  <td className="num">{r.count}</td>
                  <td className="num">{r.minRate === r.maxRate ? rs(r.minRate) : `${rs(r.minRate)}–${rs(r.maxRate)}`}</td>
                  <td className="num">{rs(r.revenue)}</td>
                  <td className="num">{rs(r.labShare)}</td>
                  <td className="num strong profit">{rs(r.platformShare)}</td>
                  <td className="num">
                    <span className="margin-chip">{pct(r.platformShare, r.revenue)}%</span>
                  </td>
                </tr>
              ))}
              {collectionFees > 0 && (
                <tr>
                  <td className="strong">{tx("admin.homeCollectionFee")}</td>
                  <td className="num">–</td>
                  <td className="num">–</td>
                  <td className="num">{rs(collectionFees)}</td>
                  <td className="num">{rs(0)}</td>
                  <td className="num strong profit">{rs(collectionFees)}</td>
                  <td className="num">
                    <span className="margin-chip">100%</span>
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <th>{tx("admin.kul2")}</th>
                <th className="num">{tot.count}</th>
                <th className="num"></th>
                <th className="num">{rs(tot.revenue + collectionFees)}</th>
                <th className="num">{rs(tot.lab)}</th>
                <th className="num">{rs(tot.plat + collectionFees)}</th>
                <th className="num">{pct(tot.plat + collectionFees, tot.revenue + collectionFees)}%</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const splitAt = (amount, commission) => {
  const lab = Math.round(amount * (1 - commission / 100));
  return { lab, platform: amount - lab };
};

// ---------- rules & rates (super admin only) ----------
// The written money rules + every lab's rate card, printable as a PDF for agreements with labs.
function RulesRates() {
  const q = useQuery({ queryKey: ["rateCard"], queryFn: () => get("/admin/rate-card") });
  const [labId, setLabId] = useState("all");
  const [amount, setAmount] = useState(1000);
  const [commission, setCommission] = useState(30);

  const printPdf = () => {
    const old = document.title;
    document.title = `LabLoop_Rules_and_Rates_${todayIst()}`;
    window.print();
    document.title = old;
  };

  return (
    <QueryState query={q}>
      {(d) => {
        const labs = d.data;
        const shown = labId === "all" ? labs : labs.filter((l) => l._id === labId);
        const rates = [...new Set([30, ...labs.map((l) => l.commissionPercent)])].sort((a, b) => a - b);
        const amt = Math.max(0, Number(amount) || 0);
        const calc = splitAt(amt, Number(commission) || 0);
        const def = labs[0] || { collectionFee: 49, freeCollectionAbove: 499, minOrderValue: 199 };
        return (
          <div className="rules">
            <div className="card toolbar no-print">
              <div>
                <strong>{tx("admin.rulesCommissionAurRate")}</strong>
                <div className="muted small">{tx("admin.yeSectionSirfSuper")}</div>
              </div>
              <button className="primary-btn small" onClick={printPdf}>
                <Icon name="file" size={18} /> {tx("admin.pdfDownloadKarein")}
              </button>
            </div>

            <article className="rules-doc">
              <header className="doc-head">
                <div>
                  <h2>{tx("admin.labloopPaiseKeNiyam")}</h2>
                  <p className="muted small">{tx("admin.taiyaarKiya")} {prettyDate(todayIst())} {tx("admin.sirfAndarKeIstemaal")}</p>
                </div>
              </header>

              <section>
                <h3>{tx("admin.1PaisaKaiseBatta")}</h3>
                <div className="formula">
                  <div>
                    <span>{tx("admin.patientRate")}</span>
                    <strong>{tx("admin.mareezJoDetaHai")}</strong>
                  </div>
                  <span className="op">=</span>
                  <div>
                    <span>{tx("admin.labKaHissaB2b")}</span>
                    <strong>{tx("admin.rate100Commission")}</strong>
                  </div>
                  <span className="op">+</span>
                  <div className="hl">
                    <span>{tx("admin.platformKaHissa")}</span>
                    <strong>{tx("admin.rateCommission")}</strong>
                  </div>
                </div>
                <ol className="rule-list">
                  <li>
                    <b>{tx("admin.patientRate")}</b> {tx("admin.labKaWalkIn")}
                  </li>
                  <li>
                    <b>{tx("admin.labKaHissa")}</b> {tx("admin.rate100CommissionPoore")}
                  </li>
                  <li>
                    <b>{tx("admin.platformKaHissa")}</b> {tx("admin.patientRateLabKa")}
                  </li>
                  <li>
                    <b>{tx("admin.homeCollectionFee")}</b> {tx("admin.abhi")}{def.collectionFee}{tx("admin.jabTestsKaTotal")}{def.freeCollectionAbove} {tx("admin.seKamHoYe")} <b>{tx("admin.pooriPlatformKi")}</b> {tx("admin.haiLabKaHissa")}
                  </li>
                  <li>
                    <b>{tx("admin.minimumBooking")}</b>: ₹{def.minOrderValue} {tx("admin.seKamKiJaanch")}
                  </li>
                  <li>
                    <b>{tx("admin.rateLock")}</b>{tx("admin.bookingKeTimeJo")}
                  </li>
                  <li>
                    <b>{tx("admin.cancelBooking")}</b> {tx("admin.peKisiKaKoi")}
                  </li>
                </ol>
              </section>

              <section>
                <h3>{tx("admin.2KaunKiskoDega")}</h3>
                <div className="two">
                  <div className="card inset">
                    <strong>{tx("admin.cashPaymentLabNe")}</strong>
                    <p className="small">{tx("admin.pooraPaisaLabKe")} <b>{tx("admin.labPlatformKoUska")}</b></p>
                  </div>
                  <div className="card inset">
                    <strong>{tx("admin.onlineUpiSitePe")}</strong>
                    <p className="small">{tx("admin.pooraPaisaPlatformKe")} <b>{tx("admin.platformLabKoUska")}</b></p>
                  </div>
                </div>
                <ol className="rule-list" start={8}>
                  <li>
                    <b>{tx("admin.settlementHarHafte")}</b>{tx("admin.somvaarSubah6Baje")}
                  </li>
                  <li>{tx("admin.paymentKeBaadAdmin")}</li>
                  <li>{tx("admin.gintiSirfUnBookings")}</li>
                </ol>
              </section>

              <section>
                <h3>{tx("admin.3OtpKeNiyam")}</h3>
                <ol className="rule-list" start={11}>
                  <li>{tx("admin.harBookingKaOtp")}</li>
                  <li>{tx("admin.otpSirfTabBand")}</li>
                  <li>{tx("admin.doctorAppointmentKeReceipt")}</li>
                </ol>
              </section>

              <section>
                <h3>{tx("admin.4KitneRupayeKe")}</h3>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{tx("admin.testRate")}</th>
                        {rates.map((c) => (
                          <th key={c} className="num">
                            {c}{tx("admin.commission2")}
                            <br />
                            <span className="sub-th">{tx("admin.labPlatform")}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000].map((a) => (
                        <tr key={a}>
                          <td className="strong">{rs(a)}</td>
                          {rates.map((c) => {
                            const x = splitAt(a, c);
                            return (
                              <td key={c} className="num">
                                {rs(x.lab)} / <span className="profit strong">{rs(x.platform)}</span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="calc no-print">
                  <strong>{tx("admin.calculator")}</strong>
                  <label>
                    {tx("admin.testRate2")}
                    <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </label>
                  <label>
                    {tx("admin.commission3")}
                    <input type="number" min="0" max="90" value={commission} onChange={(e) => setCommission(e.target.value)} />
                  </label>
                  <span>
                    {tx("admin.labKo")} <b>{rs(calc.lab)}</b> {tx("admin.platformKo")} <b className="profit">{rs(calc.platform)}</b>
                  </span>
                </div>
              </section>

              <section>
                <div className="row-between wrap">
                  <h3>{tx("admin.5HarLabKa")}</h3>
                  <select className="no-print" value={labId} onChange={(e) => setLabId(e.target.value)} aria-label={tx("admin.labChunein")}>
                    <option value="all">{tx("admin.sabLabs")}</option>
                    {labs.map((l) => (
                      <option key={l._id} value={l._id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                {shown.length === 0 && <p className="muted">{tx("admin.abhiKoiChaluLab")}</p>}
                {shown.map((l) => {
                  const tot = l.tests.reduce((a, t) => ({ p: a.p + t.patientPrice, lab: a.lab + t.labShare, plat: a.plat + t.platformShare }), { p: 0, lab: 0, plat: 0 });
                  return (
                    <div key={l._id} className="lab-rate">
                      <div className="lab-rate-head">
                        <div>
                          <strong>{l.name}</strong>
                          <div className="muted small">
                            {[l.block, l.phone].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <div className="chips">
                          <span className="chip ref">{l.commissionPercent}{tx("admin.commission2")}</span>
                          <span className="chip">{tx("admin.collectionFee")}{l.collectionFee} (₹{l.freeCollectionAbove}{tx("admin.peFree")}</span>
                          <span className="chip">{tx("admin.min")}{l.minOrderValue}</span>
                        </div>
                      </div>
                      {l.tests.length === 0 ? (
                        <p className="muted small">{tx("admin.isLabKiRate")}</p>
                      ) : (
                        <div className="table-wrap">
                          <table className="table">
                            <thead>
                              <tr>
                                <th>{tx("admin.test")}</th>
                                <th className="num">{tx("admin.patientRate")}</th>
                                <th className="num">{tx("admin.labKo")}</th>
                                <th className="num">{tx("admin.platformKo2")}</th>
                                <th className="num">{tx("admin.margin")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {l.tests.map((t) => (
                                <tr key={t._id}>
                                  <td>
                                    {t.name}
                                    {t.custom && <span className="chip small-chip">{tx("admin.custom")}</span>}
                                  </td>
                                  <td className="num">{rs(t.patientPrice)}</td>
                                  <td className="num">{rs(t.labShare)}</td>
                                  <td className="num strong profit">{rs(t.platformShare)}</td>
                                  <td className="num">
                                    <span className="margin-chip">{pct(t.platformShare, t.patientPrice)}%</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr>
                                <th>{l.tests.length} {tx("admin.test2")}</th>
                                <th className="num">{rs(tot.p)}</th>
                                <th className="num">{rs(tot.lab)}</th>
                                <th className="num">{rs(tot.plat)}</th>
                                <th className="num">{pct(tot.plat, tot.p)}%</th>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
              <footer className="doc-foot muted small">{tx("admin.labloopYeDocumentSystem")}</footer>
            </article>
          </div>
        );
      }}
    </QueryState>
  );
}

// ---------- master money view ----------
// Where the money came from, whose share is what, and per lab who pays whom.
// Labs are never netted against each other: "to pay" and "to collect" stay separate.
function MoneyOverview({ d, compact }) {
  const t = d.totals;
  const testMargin = t.commission - (t.collectionFees || 0);
  const pay = d.data.filter((r) => r.pendingNet > 0).sort((a, b) => b.pendingNet - a.pendingNet);
  const collect = d.data.filter((r) => r.pendingNet < 0).sort((a, b) => a.pendingNet - b.pendingNet);
  const cashPct = t.gross ? Math.round((t.cashCollected / t.gross) * 100) : 0;
  return (
    <div className="money">
      <div className="money-grid">
        <div className="card money-card">
          <span className="money-step">1</span>
          <span className="flow-label">{tx("admin.paisaKahanAaya")}</span>
          <strong className="money-big">{rs(t.gross)}</strong>
          <p className="muted small">{t.bookings} {tx("admin.sampleMareezonNeKul")}</p>
          <div className="split-bar" aria-hidden="true">
            <span className="seg-cash" style={{ flex: t.cashCollected || 0 }} />
            <span className="seg-online" style={{ flex: t.onlineCollected || 0 }} />
            {!t.gross && <span style={{ flex: 1 }} />}
          </div>
          <dl className="money-rows">
            <div>
              <dt>
                <i className="dot-cash" /> {tx("admin.cashLabsKePaas")}
              </dt>
              <dd>
                {rs(t.cashCollected)} <small>{cashPct}%</small>
              </dd>
            </div>
            <div>
              <dt>
                <i className="dot-online" /> {tx("admin.onlineAapkeAccountMein")}
              </dt>
              <dd>
                {rs(t.onlineCollected)} <small>{t.gross ? 100 - cashPct : 0}%</small>
              </dd>
            </div>
          </dl>
        </div>

        <div className="card money-card">
          <span className="money-step">2</span>
          <span className="flow-label">{tx("admin.kiskaKitnaBana")}</span>
          <strong className="money-big profit">{rs(t.commission)}</strong>
          <p className="muted small">{tx("admin.aapkaProfitPlatformKa")}</p>
          <dl className="money-rows">
            <div>
              <dt>{tx("admin.testMargin")}</dt>
              <dd>{rs(testMargin)}</dd>
            </div>
            <div>
              <dt>{tx("admin.homeCollectionFee")}</dt>
              <dd>{rs(t.collectionFees || 0)}</dd>
            </div>
            <div className="sep">
              <dt>{tx("admin.labsKaHissa")}</dt>
              <dd>{rs(t.labEarning)}</dd>
            </div>
          </dl>
        </div>

        <div className="card money-card money-settle">
          <span className="money-step">3</span>
          <span className="flow-label">{tx("admin.settlementAbhiBaaki")}</span>
          <div className="settle-pair">
            <div className="settle-out">
              <small>{tx("admin.aapkoLabsKoDena")}</small>
              <strong>{rs(t.payToLabs || 0)}</strong>
              <span>{t.labsToPay || 0} {tx("admin.lab3")}</span>
            </div>
            <div className="settle-in">
              <small>{tx("admin.labsSeLenaHai")}</small>
              <strong>{rs(t.collectFromLabs || 0)}</strong>
              <span>{t.labsToCollect || 0} {tx("admin.lab3")}</span>
            </div>
          </div>
          <p className="small settle-note">{tx("admin.harLabKaAlag")}</p>
        </div>
      </div>

      <div className="two who-lists">
        <WhoList title={tx("admin.inkoPaisaDenaHai")} tone="out" rows={pay} empty={tx("admin.abhiKisiLabKo")} />
        <WhoList title={tx("admin.insePaisaLenaHai")} tone="in" rows={collect} empty={tx("admin.abhiKisiLabSe")} />
      </div>

      {!compact && (
        <div className="card proof">
          <span className="flow-label">{tx("admin.sabSettleHoneKe")}</span>
          <div className="final-steps light">
            <div>
              <span>{tx("admin.onlineAaya")}</span>
              <strong>{rs(t.onlineCollected)}</strong>
            </div>
            <span className="op">−</span>
            <div>
              <span>{tx("admin.onlineKaLabHissa")}</span>
              <strong>{rs(t.weOweLab)}</strong>
            </div>
            <span className="op">+</span>
            <div>
              <span>{tx("admin.cashKaCommissionLena")}</span>
              <strong>{rs(t.labOwesUs)}</strong>
            </div>
            <span className="op">=</span>
            <div className="hl">
              <span>{tx("admin.aapkaProfit")}</span>
              <strong>{rs(t.onlineCollected - t.weOweLab + t.labOwesUs)}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WhoList({ title, tone, rows, empty }) {
  const total = rows.reduce((s, r) => s + Math.abs(r.pendingNet), 0);
  return (
    <div className={`card who who-${tone}`}>
      <div className="row-between">
        <h3>{title}</h3>
        <strong className="who-total">{rs(total)}</strong>
      </div>
      {rows.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ul className="who-rows">
          {rows.map((r) => (
            <li key={r.lab._id}>
              <span className="avatar sm" aria-hidden="true">
                {r.lab.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="who-name">
                <strong>{r.lab.name}</strong>
                <small>
                  {r.bookings} {tx("admin.sampleCash")} {rs(r.cashCollected)} {tx("admin.online")} {rs(r.onlineCollected)}
                  {r.lab.phone ? ` · ${r.lab.phone}` : ""}
                </small>
              </div>
              <strong className="who-amt">{rs(Math.abs(r.pendingNet))}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Money block on the main dashboard, with its own period.
function MoneyPanel() {
  const [range, setRange] = useState({ from: monthStart(), to: todayIst() });
  const q = useQuery({ queryKey: ["finance", range], queryFn: () => get("/admin/finance", range), placeholderData: (p) => p, refetchInterval: 60_000 });
  const presets = [
    [tx("admin.isMahine"), { from: monthStart(), to: todayIst() }],
    [tx("admin.pichhle7Din"), { from: daysAgoIst(6), to: todayIst() }],
    [tx("admin.pichhle30Din"), { from: daysAgoIst(29), to: todayIst() }],
    [tx("admin.isSaal"), { from: `${todayIst().slice(0, 4)}-01-01`, to: todayIst() }],
  ];
  return (
    <section>
      <div className="row-between wrap dash-section-row">
        <h2 className="dash-section">{tx("admin.paiseKaPooraHisaab")}</h2>
        <div className="pill-row">
          {presets.map(([label, r]) => (
            <button key={label} className={`pill ${range.from === r.from && range.to === r.to ? "on" : ""}`} onClick={() => setRange(r)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <QueryState query={q}>{(d) => <MoneyOverview d={d} />}</QueryState>
    </section>
  );
}

// ---------- agents ----------
function Agents() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["adminAgents"], queryFn: () => get("/admin/agents") });
  const [temp, setTemp] = useState(null);
  const [err, setErr] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["adminAgents"] });
  async function toggle(u) {
    setErr("");
    try {
      await patch(`/admin/users/${u._id}/status`, { status: u.status === "active" ? "disabled" : "active" });
      refresh();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  async function reset(u) {
    if (!window.confirm(tx("admin.kaPasswordResetKarein", { name: u.name }))) return;
    try {
      const r = await post(`/admin/users/${u._id}/reset-password`, {});
      setTemp({ email: r.user.email || r.user.phone, password: r.tempPassword });
      refresh();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  return (
    <>
      <CreateAgent startOpen onCreated={(t) => (setTemp(t), refresh())} />
      <TempPassword email={temp?.email} password={temp?.password} />
      <ErrorMsg msg={err} />
      <QueryState query={q} isEmpty={(d) => d.data.length === 0} empty={tx("admin.abhiKoiAgentNahi")}>
        {(d) => (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{tx("admin.agent")}</th>
                  <th>{tx("admin.login")}</th>
                  <th className="num">{tx("admin.labJode")}</th>
                  <th className="num">{tx("admin.doctorJode")}</th>
                  <th>{tx("admin.aakhriLogin")}</th>
                  <th>{tx("admin.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.data.map((u) => (
                  <tr key={u._id}>
                    <td>
                      <strong>{u.name}</strong>
                      {u.mustChangePassword && <div className="chip">{tx("admin.tempPassword")}</div>}
                    </td>
                    <td>
                      {u.email}
                      {u.phone && <div className="muted small">{u.phone}</div>}
                    </td>
                    <td className="num strong">{u.labs}</td>
                    <td className="num strong">{u.doctors}</td>
                    <td>{prettyDateTime(u.lastLoginAt) || "—"}</td>
                    <td>
                      <Badge status={u.status} label={u.status} />
                    </td>
                    <td>
                      <div className="btn-row">
                        <button className="secondary-btn small" onClick={() => toggle(u)}>
                          {u.status === "active" ? tx("admin.disable") : tx("admin.enable")}
                        </button>
                        <button className="link-btn" onClick={() => reset(u)}>
                          {tx("admin.resetPassword")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
    </>
  );
}

// ---------- users ----------
function Users() {
  const qc = useQueryClient();
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const { q, setPage } = useList("adminUsers", "/admin/users", { role, status, q: search });
  const [err, setErr] = useState("");
  const [temp, setTemp] = useState(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["adminUsers"] });

  async function toggle(u) {
    setErr("");
    try {
      await patch(`/admin/users/${u._id}/status`, { status: u.status === "active" ? "disabled" : "active" });
      refresh();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  async function reset(u) {
    if (!window.confirm(tx("admin.kaPasswordResetKarein", { name: u.name }))) return;
    try {
      const r = await post(`/admin/users/${u._id}/reset-password`, {});
      setTemp({ email: r.user.email || r.user.phone, password: r.tempPassword });
      refresh();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  return (
    <>
      <TempPassword email={temp?.email} password={temp?.password} />
      <Filters>
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label={tx("admin.role")}>
          <option value="">{tx("admin.sabhiRole")}</option>
          {ROLES.map((k) => [k, roleLabel(k)]).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={tx("admin.status")}>
          <option value="">{tx("admin.sabhiStatus")}</option>
          <option value="active">{tx("admin.active")}</option>
          <option value="disabled">{tx("admin.disabled")}</option>
        </select>
        <input placeholder={tx("admin.naamEmailPhone")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </Filters>
      <ErrorMsg msg={err} />
      <QueryState query={q} empty={tx("admin.koiUserNahiMila")}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{tx("admin.naam")}</th>
                    <th>{tx("admin.role")}</th>
                    <th>{tx("admin.login")}</th>
                    <th>{tx("admin.linked")}</th>
                    <th>{tx("admin.aakhriLogin")}</th>
                    <th>{tx("admin.status")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((u) => (
                    <tr key={u._id}>
                      <td>
                        {u.name}
                        {u.mustChangePassword && <div className="chip">{tx("admin.tempPassword")}</div>}
                      </td>
                      <td>{roleLabel(u.role)}</td>
                      <td>{u.email || u.phone}</td>
                      <td>{u.lab?.name || u.doctor?.name || "—"}</td>
                      <td>{prettyDateTime(u.lastLoginAt) || "—"}</td>
                      <td>
                        <Badge status={u.status} label={u.status} />
                      </td>
                      <td>
                        {u.role !== "super_admin" && (
                          <div className="btn-row">
                            <button className="secondary-btn small" onClick={() => toggle(u)}>
                              {u.status === "active" ? tx("admin.disable") : tx("admin.enable")}
                            </button>
                            <button className="link-btn" onClick={() => reset(u)}>
                              {tx("admin.resetPassword")}
                            </button>
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
    </>
  );
}

function CreateAgent({ onCreated, startOpen = false }) {
  const [open, setOpen] = useState(startOpen);
  const [f, setF] = useState({ name: "", email: "", phone: "" });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await post("/admin/users", { name: f.name, email: f.email, phone: f.phone || undefined, role: "agent" });
      onCreated({ email: r.user.email, password: r.tempPassword });
      setF({ name: "", email: "", phone: "" });
      setErrs({});
      setOpen(false);
    } catch (e2) {
      setErrs(fieldErrors(e2));
      setErr(errorMessage(e2));
    }
  }
  if (!open)
    return (
      <button className="primary-btn small" onClick={() => setOpen(true)}>
        {tx("admin.nayaFieldAgent")}
      </button>
    );
  return (
    <form className="card form-card" onSubmit={submit} noValidate>
      <h2>{tx("admin.nayaFieldAgentJodein")}</h2>
      <p className="muted small">{tx("admin.agentGaonLabAur")}</p>
      <div className="three">
        <Field label={tx("admin.naam")} error={errs.name}>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label={tx("admin.emailLoginId")} error={errs.email}>
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label={tx("admin.phone")} error={errs.phone}>
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
      </div>
      <ErrorMsg msg={err} />
      <div className="btn-row">
        <button className="primary-btn small">{tx("admin.agentBanayein")}</button>
        <button type="button" className="secondary-btn small" onClick={() => setOpen(false)}>
          {tx("admin.bandKarein")}
        </button>
      </div>
    </form>
  );
}

// ---------- catalog ----------
function Labs() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const { q, setPage } = useList("adminLabs", "/admin/labs", { status, q: search });
  const [err, setErr] = useState("");
  async function remove(l) {
    if (!window.confirm(tx("admin.koHameshaKeLiye", { name: l.name }))) return;
    setErr("");
    try {
      await del(`/admin/labs/${l._id}`);
      qc.invalidateQueries({ queryKey: ["adminLabs"] });
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  async function toggle(l) {
    try {
      await patch(`/agent/labs/${l._id}`, { status: l.status === "active" ? "disabled" : "active" });
      qc.invalidateQueries({ queryKey: ["adminLabs"] });
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  return (
    <>
      <Filters>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={tx("admin.status")}>
          <option value="">{tx("admin.sabhi")}</option>
          <option value="active">{tx("admin.chalu")}</option>
          <option value="disabled">{tx("admin.band")}</option>
        </select>
        <input placeholder={tx("admin.labKaNaam")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </Filters>
      <ErrorMsg msg={err} />
      <QueryState query={q} empty={tx("admin.koiLabNahi")}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{tx("admin.lab2")}</th>
                    <th>{tx("admin.radius")}</th>
                    <th>{tx("admin.fees")}</th>
                    <th>{tx("admin.commission")}</th>
                    <th>{tx("admin.agent")}</th>
                    <th>{tx("admin.status")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((l) => (
                    <tr key={l._id}>
                      <td>
                        {l.name}
                        <div className="muted small">{l.address}</div>
                      </td>
                      <td>{l.serviceRadiusKm} km</td>
                      <td className="small">
                        {rs(l.collectionFee)} {tx("admin.free")}{rs(l.freeCollectionAbove)} {tx("admin.min2")} {rs(l.minOrderValue)}
                      </td>
                      <td>{l.commissionPercent}%</td>
                      <td>{l.onboardedBy?.name}</td>
                      <td>
                        <Badge status={l.status} label={l.status} />
                      </td>
                      <td>
                        <div className="btn-row">
                          <button className="secondary-btn small" onClick={() => toggle(l)}>
                            {l.status === "active" ? tx("admin.band") : tx("admin.chalu")}
                          </button>
                          <button className="secondary-btn small danger" onClick={() => remove(l)}>
                            {tx("admin.delete")}
                          </button>
                        </div>
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
    </>
  );
}

function Doctors() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const { q, setPage } = useList("adminDoctors", "/admin/doctors", { status, q: search });
  const [err, setErr] = useState("");
  async function remove(d) {
    if (!window.confirm(tx("admin.koHameshaKeLiye2", { name: d.name }))) return;
    setErr("");
    try {
      await del(`/admin/doctors/${d._id}`);
      qc.invalidateQueries({ queryKey: ["adminDoctors"] });
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  async function toggle(d) {
    try {
      await patch(`/agent/doctors/${d._id}`, { status: d.status === "active" ? "disabled" : "active" });
      qc.invalidateQueries({ queryKey: ["adminDoctors"] });
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  return (
    <>
      <Filters>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={tx("admin.status")}>
          <option value="">{tx("admin.sabhi")}</option>
          <option value="active">{tx("admin.chalu")}</option>
          <option value="disabled">{tx("admin.band")}</option>
        </select>
        <input placeholder={tx("admin.doctorKaNaam")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </Filters>
      <ErrorMsg msg={err} />
      <QueryState query={q} empty={tx("admin.koiDoctorNahi")}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{tx("admin.doctor2")}</th>
                    <th>{tx("admin.specialty")}</th>
                    <th>{tx("admin.din3")}</th>
                    <th>{tx("admin.fees")}</th>
                    <th>{tx("admin.login")}</th>
                    <th>{tx("admin.agent")}</th>
                    <th>{tx("admin.status")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((x) => (
                    <tr key={x._id}>
                      <td>
                        {x.name}
                        <div className="muted small">{x.clinicName}</div>
                      </td>
                      <td>{x.specialty}</td>
                      <td className="small">{x.schedule.map((s) => s.day).join(", ")}</td>
                      <td>{rs(x.fee)}</td>
                      <td className="small">{x.user?.email}</td>
                      <td>{x.onboardedBy?.name}</td>
                      <td>
                        <Badge status={x.status} label={x.status} />
                      </td>
                      <td>
                        <div className="btn-row">
                          <button className="secondary-btn small" onClick={() => toggle(x)}>
                            {x.status === "active" ? tx("admin.band") : tx("admin.chalu")}
                          </button>
                          <button className="secondary-btn small danger" onClick={() => remove(x)}>
                            {tx("admin.delete")}
                          </button>
                        </div>
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
    </>
  );
}

function Villages() {
  const [search, setSearch] = useState("");
  const { q, setPage } = useList("adminVillages", "/admin/villages", { q: search });
  return (
    <>
      <Filters>
        <input placeholder={tx("admin.gaonKaNaam")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Link className="secondary-btn small" to="/agent">
          {tx("admin.gaonJodein")}
        </Link>
      </Filters>
      <QueryState query={q} empty={tx("admin.koiGaonNahi")}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{tx("admin.gaon")}</th>
                    <th>{tx("admin.block")}</th>
                    <th>{tx("admin.district")}</th>
                    <th>{tx("admin.latLng")}</th>
                    <th>{tx("admin.joda")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((v) => (
                    <tr key={v._id}>
                      <td>{v.name}</td>
                      <td>{v.block}</td>
                      <td>{v.district}</td>
                      <td className="small">
                        {v.location.coordinates[1]}, {v.location.coordinates[0]}
                      </td>
                      <td className="small">{v.createdBy?.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager meta={d.meta} onPage={setPage} />
          </>
        )}
      </QueryState>
    </>
  );
}

// ---------- bookings & appointments ----------
function Bookings() {
  const [f, setF] = useState({ status: "", source: "", code: "", from: "", to: "" });
  const { q, setPage } = useList("adminBookings", "/admin/bookings", f);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <Filters>
        <select value={f.status} onChange={set("status")} aria-label={tx("admin.status")}>
          <option value="">{tx("admin.sabhiStatus")}</option>
          {["requested", "confirmed", "collected", "report_ready", "cancelled"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={f.source} onChange={set("source")} aria-label={tx("admin.source")}>
          <option value="">{tx("admin.patientDoctor")}</option>
          <option value="patient">{tx("admin.patient")}</option>
          <option value="doctor">{tx("admin.doctorReferral")}</option>
        </select>
        <input placeholder={tx("admin.bookingCode")} value={f.code} onChange={set("code")} />
        <label className="small">
          {tx("admin.se")} <input type="date" value={f.from} onChange={set("from")} />
        </label>
        <label className="small">
          {tx("admin.tak")} <input type="date" value={f.to} onChange={set("to")} />
        </label>
      </Filters>
      <QueryState query={q} empty={tx("admin.koiBookingNahi")}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{tx("admin.code")}</th>
                    <th>{tx("admin.mareez")}</th>
                    <th>{tx("admin.gaon")}</th>
                    <th>{tx("admin.lab2")}</th>
                    <th>{tx("admin.test")}</th>
                    <th>{tx("admin.din3")}</th>
                    <th>{tx("admin.kul2")}</th>
                    <th>{tx("admin.labPayout")}</th>
                    <th>{tx("admin.margin")}</th>
                    <th>{tx("admin.pay")}</th>
                    <th>{tx("admin.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((b) => (
                    <tr key={b._id}>
                      <td>
                        {b.code}
                        {b.source === "doctor" && <div className="chip ref">🩺 {b.referredBy?.name}</div>}
                      </td>
                      <td>
                        {b.patientName}
                        <div className="muted small">{b.patient?.phone}</div>
                      </td>
                      <td>{b.village?.name}</td>
                      <td>{b.lab?.name}</td>
                      <td className="small">{b.items.map((i) => i.name).join(", ")}</td>
                      <td>{prettyDate(b.date)}</td>
                      <td>{rs(b.total)}</td>
                      <td>{rs(b.labPayout)}</td>
                      <td>{rs(b.platformMargin)}</td>
                      <td className="small">
                        {b.payment?.mode} / {b.payment?.status}
                      </td>
                      <td>
                        <Badge status={b.status} label={b.status} />
                        {b.otpLocked && <div className="chip no">{tx("admin.otpLock")}</div>}
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
    </>
  );
}

function Appointments() {
  const [f, setF] = useState({ status: "", date: "" });
  const { q, setPage } = useList("adminAppts", "/admin/appointments", f);
  return (
    <>
      <Filters>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label={tx("admin.status")}>
          <option value="">{tx("admin.sabhiStatus")}</option>
          {["booked", "seen", "no_show", "cancelled"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label={tx("admin.date")} />
      </Filters>
      <QueryState query={q} empty={tx("admin.koiAppointmentNahi")}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{tx("admin.code")}</th>
                    <th>{tx("admin.din3")}</th>
                    <th>{tx("admin.token")}</th>
                    <th>{tx("admin.doctor2")}</th>
                    <th>{tx("admin.mareez")}</th>
                    <th>{tx("admin.gaon")}</th>
                    <th>{tx("admin.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((a) => (
                    <tr key={a._id}>
                      <td>{a.code}</td>
                      <td>{prettyDate(a.date)}</td>
                      <td>#{a.token}</td>
                      <td>{a.doctor?.name}</td>
                      <td>
                        {a.patientName}
                        <div className="muted small">{a.patient?.phone}</div>
                      </td>
                      <td>{a.village?.name}</td>
                      <td>
                        <Badge status={a.status} label={a.status} />
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
    </>
  );
}

// ---------- settlements ----------
function Settlements() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const { q, setPage } = useList("adminSettlements", "/admin/settlements", { status });
  const [weekOf, setWeekOf] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["adminSettlements"] });

  async function generate() {
    setErr("");
    setMsg("");
    try {
      const r = await post("/admin/settlements/generate", weekOf ? { weekOf } : {});
      setMsg(tx("admin.labKaHisaabBana", { length: r.data.length, v2: prettyDate(r.weekStart.slice(0, 10)) }));
      refresh();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  async function markPaid(s) {
    const who = s.netPayable >= 0 ? tx("admin.humneLabKoDiya") : tx("admin.labNeHumeinDiya");
    const reference = window.prompt(tx("admin.paymentReferenceUtrLikhein", { v1: s.lab?.name, who, v3: rs(Math.abs(s.netPayable)) }));
    if (!reference) return;
    try {
      await patch(`/admin/settlements/${s._id}/paid`, { reference });
      refresh();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  return (
    <>
      <div className="card">
        <p className="muted">{tx("admin.harMonday6Baje")}</p>
        <Filters>
          <label className="small">
            {tx("admin.haftaKoiBhiDin")} <input type="date" value={weekOf} onChange={(e) => setWeekOf(e.target.value)} />
          </label>
          <button className="primary-btn small" onClick={generate}>
            {tx("admin.hisaabBanayein")}
          </button>
        </Filters>
        <ErrorMsg msg={err} />
        {msg && <div className="ok">{msg}</div>}
      </div>
      <Filters>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={tx("admin.status")}>
          <option value="">{tx("admin.sabhi")}</option>
          <option value="pending">{tx("admin.baaki")}</option>
          <option value="paid">{tx("admin.paid")}</option>
        </select>
      </Filters>
      <QueryState query={q} empty={tx("admin.abhiKoiSettlementNahi")}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{tx("admin.lab2")}</th>
                    <th>{tx("admin.hafta")}</th>
                    <th>{tx("admin.gross")}</th>
                    <th>{tx("admin.labKiKamai")}</th>
                    <th>{tx("admin.cashLabKePaas")}</th>
                    <th>{tx("admin.net")}</th>
                    <th>{tx("admin.status")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((s) => (
                    <tr key={s._id}>
                      <td>{s.lab?.name}</td>
                      <td className="small">{prettyDate(s.weekStart.slice(0, 10))}</td>
                      <td>{rs(s.gross)}</td>
                      <td>{rs(s.labPayout)}</td>
                      <td>{rs(s.cashWithLab)}</td>
                      <td>
                        <Net value={s.netPayable} />
                      </td>
                      <td>
                        <Badge status={s.status} label={s.status} />
                        {s.reference && <div className="small muted">{s.reference}</div>}
                      </td>
                      <td>
                        {s.status === "pending" && (
                          <button className="primary-btn small" onClick={() => markPaid(s)}>
                            {tx("admin.paidMarkKarein")}
                          </button>
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
    </>
  );
}

// ---------- audit ----------
function Audit() {
  const [f, setF] = useState({ action: "", entityType: "" });
  const { q, setPage } = useList("adminAudit", "/admin/audit", f);
  return (
    <>
      <Filters>
        <input placeholder={tx("admin.actionJaiseUserYa")} value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} />
        <select value={f.entityType} onChange={(e) => setF({ ...f, entityType: e.target.value })} aria-label={tx("admin.entity")}>
          <option value="">{tx("admin.sabhi")}</option>
          {["User", "Lab", "LabTest", "Doctor", "Village", "Booking", "Appointment", "Settlement", "FamilyMember"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </Filters>
      <QueryState query={q} empty={tx("admin.kuchNahiMila")}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{tx("admin.kab")}</th>
                    <th>{tx("admin.kisne")}</th>
                    <th>{tx("admin.kya")}</th>
                    <th>{tx("admin.entity")}</th>
                    <th>{tx("admin.pehleBaad")}</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((a) => (
                    <tr key={a._id}>
                      <td className="small">{prettyDateTime(a.at)}</td>
                      <td>
                        {a.actor?.name || tx("admin.system")}
                        <div className="muted small">{roleLabel(a.actorRole)}</div>
                      </td>
                      <td>
                        <code>{a.action}</code>
                      </td>
                      <td className="small">
                        {a.entityType}
                        <div className="muted">{a.entityId?.slice(-6)}</div>
                      </td>
                      <td className="small audit-diff">
                        {a.before && <pre>{JSON.stringify(a.before)}</pre>}
                        {a.after && <pre>{JSON.stringify(a.after)}</pre>}
                      </td>
                      <td className="small">{a.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager meta={d.meta} onPage={setPage} />
          </>
        )}
      </QueryState>
    </>
  );
}
