import { useState } from "react";
import { Icon } from "../../components/Icons.jsx";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, errorMessage, fieldErrors } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { PanelShell, Badge, ErrorMsg, Field, Ok, Pager, QueryState, TempPassword } from "../../components/ui.jsx";
import { rs, prettyDate, prettyDateTime, DAYS } from "../../utils.js";
import { ScheduleRows } from "../doctor/DoctorPanel.jsx";
import { t as tx } from "../../i18n/I18nContext.jsx";

const SAMPLE_TESTS = `CBC = 400
Sugar Fasting = 50
Sugar PP = 50
HbA1c = 550
Thyroid (T3, T4, TSH) = 600
Lipid Profile = 650
LFT = 800
KFT = 600
Urine Routine = 100
Widal = 120
Malaria = 100`;

export default function AgentPanel() {
  const { user } = useAuth();
  const [tab, setTab] = useState("mine");
  const [openLab, setOpenLab] = useState(null);
  return (
    <PanelShell
      role={user.role === "super_admin" ? tx("agent.onboardingAdmin") : tx("agent.fieldAgent")}
      tabs={[
        { key: "mine", label: tx("agent.mereJodeHue"), icon: "list" },
        { key: "village", label: tx("agent.gaonJodein"), icon: "map" },
        { key: "lab", label: tx("agent.labJodein"), icon: "flask" },
        { key: "doctor", label: tx("agent.doctorJodein"), icon: "steth" },
        { key: "bookings", label: tx("agent.labBooking"), icon: "file" },
      ]}
      value={openLab ? "mine" : tab}
      onChange={(k) => {
        setOpenLab(null);
        setTab(k);
      }}
      actions={
        user.role === "super_admin" && (
          <Link className="secondary-btn small" to="/admin">
            <Icon name="chart" size={18} />
            {tx("agent.adminPanel")}
          </Link>
        )
      }
    >
      {openLab ? (
        <LabDetail id={openLab} onBack={() => setOpenLab(null)} />
      ) : (
        <>
          {tab === "mine" && <Onboarded onOpenLab={setOpenLab} />}
          {tab === "village" && <AddVillage />}
          {tab === "lab" && (
            <AddLab
              onDone={(id) => {
                setOpenLab(id);
                setTab("mine");
              }}
            />
          )}
          {tab === "doctor" && <AddDoctor />}
          {tab === "bookings" && <AgentBookings />}
        </>
      )}
    </PanelShell>
  );
}

// ---------- location input: village, GPS or manual lat/lng ----------
function LocationPicker({ value, onChange, error, onVillage }) {
  const villages = useQuery({ queryKey: ["villages"], queryFn: () => get("/villages", { limit: 500 }) });
  const [gpsErr, setGpsErr] = useState("");
  const useGps = () => {
    if (!navigator.geolocation) return setGpsErr(tx("agent.isPhoneMeinGps"));
    navigator.geolocation.getCurrentPosition(
      (p) => onChange({ lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }),
      () => setGpsErr(tx("agent.locationNahiMiliPermission")),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };
  const valid = value.lat !== "" && value.lng !== "" && !Number.isNaN(Number(value.lat)) && !Number.isNaN(Number(value.lng));
  return (
    <fieldset className="location">
      <legend className="field-label">{tx("agent.location")}</legend>
      <div className="btn-row">
        <button type="button" className="secondary-btn small" onClick={useGps}>
          {tx("agent.meriAbhiKiLocation")}
        </button>
        <select
          aria-label={tx("agent.gaonKiLocationLo")}
          value=""
          onChange={(e) => {
            const v = villages.data?.data.find((x) => x._id === e.target.value);
            if (!v) return;
            onChange({ lat: String(v.location.coordinates[1]), lng: String(v.location.coordinates[0]) });
            onVillage?.(v._id);
          }}
        >
          <option value="">{tx("agent.yaGaonKiLocation")}</option>
          {villages.data?.data.map((v) => (
            <option key={v._id} value={v._id}>
              {v.name} ({v.block})
            </option>
          ))}
        </select>
      </div>
      <div className="two">
        <Field label={tx("agent.latitude")} hint={tx("agent.googleMapsPeJagah")} error={error}>
          <input inputMode="decimal" value={value.lat} onChange={(e) => onChange({ ...value, lat: e.target.value })} placeholder="26.1120" />
        </Field>
        <Field label={tx("agent.longitude")}>
          <input inputMode="decimal" value={value.lng} onChange={(e) => onChange({ ...value, lng: e.target.value })} placeholder="84.5000" />
        </Field>
      </div>
      {valid && (
        <a className="link-btn" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${value.lat}&mlon=${value.lng}#map=16/${value.lat}/${value.lng}`}>
          {tx("agent.mapPeCheckKarein")}
        </a>
      )}
      <ErrorMsg msg={gpsErr} />
    </fieldset>
  );
}

// ---------- villages a lab/doctor serves: patients of these villages always see it ----------
function VillagePicker({ value, onChange }) {
  const villages = useQuery({ queryKey: ["villages"], queryFn: () => get("/villages", { limit: 500 }) });
  const [q, setQ] = useState("");
  const all = villages.data?.data || [];
  const shown = all.filter((v) => value.includes(v._id) || v.name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <fieldset className="location">
      <legend className="field-label">{tx("agent.kinGaonKeMareezon")}{value.length} {tx("agent.chune")}</legend>
      <p className="muted small">{tx("agent.sirfInhiGaonKe")}</p>
      {all.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx("agent.gaonDhoondhein")} aria-label={tx("agent.gaonDhoondhein2")} />}
      <div className="pill-row">
        {shown.map((v) => (
          <button type="button" key={v._id} className={`pill ${value.includes(v._id) ? "on" : ""}`} aria-pressed={value.includes(v._id)} onClick={() => toggle(v._id)}>
            {value.includes(v._id) ? "✓ " : ""}
            {v.name}
          </button>
        ))}
        {!villages.isLoading && all.length === 0 && <span className="muted small">{tx("agent.pehleGaonJodeinSe")}</span>}
      </div>
    </fieldset>
  );
}
const addVillage = (setV) => (id) => setV((cur) => (cur.includes(id) ? cur : [...cur, id]));

const num = (v) => (v === "" || v === undefined ? undefined : Number(v));

function AddVillage() {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", block: "Maharajganj", district: "Siwan" });
  const [loc, setLoc] = useState({ lat: "", lng: "" });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  async function submit(e) {
    e.preventDefault();
    setOk("");
    setErr("");
    const v = {};
    if (f.name.trim().length < 2) v.name = tx("agent.gaonKaNaamLikhein");
    if (!loc.lat || !loc.lng) v.lat = tx("agent.locationDaalein");
    setErrs(v);
    if (Object.keys(v).length) return;
    try {
      const r = await post("/agent/villages", { ...f, lat: Number(loc.lat), lng: Number(loc.lng) });
      setOk(tx("agent.judGaya", { name: r.name }));
      setF({ ...f, name: "" });
      setLoc({ lat: "", lng: "" });
      qc.invalidateQueries({ queryKey: ["villages"] });
    } catch (e2) {
      setErrs(fieldErrors(e2));
      setErr(errorMessage(e2));
    }
  }
  return (
    <form className="card form-card" onSubmit={submit} noValidate>
      <h2>{tx("agent.nayaGaonJodein")}</h2>
      <div className="three">
        <Field label={tx("agent.gaonKaNaam")} error={errs.name}>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label={tx("agent.block")} error={errs.block}>
          <input value={f.block} onChange={(e) => setF({ ...f, block: e.target.value })} />
        </Field>
        <Field label={tx("agent.district")}>
          <input value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} />
        </Field>
      </div>
      <LocationPicker value={loc} onChange={setLoc} error={errs.lat} />
      <ErrorMsg msg={err} />
      <Ok msg={ok} />
      <button className="primary-btn">{tx("agent.gaonJodein")}</button>
    </form>
  );
}

const LAB_BLANK = {
  name: "",
  phone: "",
  address: "",
  block: "Maharajganj",
  licenceNo: "",
  pathName: "",
  pathQual: "MD Pathology",
  pathReg: "",
  serviceRadiusKm: "5",
  collectionFee: "49",
  freeCollectionAbove: "499",
  minOrderValue: "199",
  commissionPercent: "30",
  tests: SAMPLE_TESTS,
};

function AddLab({ onDone }) {
  const qc = useQueryClient();
  const [f, setF] = useState(LAB_BLANK);
  const [loc, setLoc] = useState({ lat: "", lng: "" });
  const [villages, setVillages] = useState([]);
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const v = {};
    if (f.name.trim().length < 2) v.name = tx("agent.labKaNaamLikhein");
    if (f.phone && !/^[6-9]\d{9}$/.test(f.phone)) v.phone = tx("agent.10AnkKaMobile");
    if (!loc.lat || !loc.lng) v.lat = tx("agent.labKiLocationDaalein");
    setErrs(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    setErr("");
    try {
      const lab = await post("/agent/labs", {
        name: f.name,
        phone: f.phone || undefined,
        address: f.address || undefined,
        block: f.block || undefined,
        licenceNo: f.licenceNo || undefined,
        pathologist: { name: f.pathName || undefined, qualification: f.pathQual || undefined, registrationNo: f.pathReg || undefined },
        lat: Number(loc.lat),
        lng: Number(loc.lng),
        serviceRadiusKm: num(f.serviceRadiusKm),
        collectionFee: num(f.collectionFee),
        freeCollectionAbove: num(f.freeCollectionAbove),
        minOrderValue: num(f.minOrderValue),
        commissionPercent: num(f.commissionPercent),
        villages,
      });
      if (f.tests.trim()) await post(`/agent/labs/${lab._id}/tests`, { text: f.tests });
      qc.invalidateQueries({ queryKey: ["onboarded"] });
      onDone(lab._id);
    } catch (e2) {
      setErrs(fieldErrors(e2));
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-card" onSubmit={submit} noValidate>
      <h2>{tx("agent.nayaLabJodein")}</h2>
      <div className="two">
        <Field label={tx("agent.labKaNaam")} error={errs.name}>
          <input value={f.name} onChange={set("name")} placeholder={tx("agent.maaDurgaPathology")} />
        </Field>
        <Field label={tx("agent.phone")} error={errs.phone}>
          <input inputMode="numeric" maxLength={10} value={f.phone} onChange={set("phone")} />
        </Field>
      </div>
      <div className="two">
        <Field label={tx("agent.pata")}>
          <input value={f.address} onChange={set("address")} placeholder={tx("agent.mainBazaarMaharajganj")} />
        </Field>
        <Field label={tx("agent.block")}>
          <input value={f.block} onChange={set("block")} />
        </Field>
      </div>
      <LocationPicker value={loc} onChange={setLoc} error={errs.lat} onVillage={addVillage(setVillages)} />
      <VillagePicker value={villages} onChange={setVillages} />
      <h3>{tx("agent.pathologistReportSignKarne")}</h3>
      <div className="three">
        <Field label={tx("agent.naam")}>
          <input value={f.pathName} onChange={set("pathName")} placeholder={tx("agent.dr")} />
        </Field>
        <Field label={tx("agent.qualification")}>
          <input value={f.pathQual} onChange={set("pathQual")} />
        </Field>
        <Field label={tx("agent.registrationNo")}>
          <input value={f.pathReg} onChange={set("pathReg")} />
        </Field>
      </div>
      <Field label={tx("agent.labLicenceNo")}>
        <input value={f.licenceNo} onChange={set("licenceNo")} />
      </Field>
      <h3>{tx("agent.sevaAurFees")}</h3>
      <div className="three">
        <Field label={tx("agent.kitneKmTakSample")} error={errs.serviceRadiusKm}>
          <input inputMode="decimal" value={f.serviceRadiusKm} onChange={set("serviceRadiusKm")} />
        </Field>
        <Field label={tx("agent.collectionFee")} error={errs.collectionFee}>
          <input inputMode="numeric" value={f.collectionFee} onChange={set("collectionFee")} />
        </Field>
        <Field label={tx("agent.iskeUparCollectionFree")} error={errs.freeCollectionAbove}>
          <input inputMode="numeric" value={f.freeCollectionAbove} onChange={set("freeCollectionAbove")} />
        </Field>
      </div>
      <div className="two">
        <Field label={tx("agent.kamSeKamOrder")} error={errs.minOrderValue}>
          <input inputMode="numeric" value={f.minOrderValue} onChange={set("minOrderValue")} />
        </Field>
        <Field label={tx("agent.commissionWalkInRate")} error={errs.commissionPercent}>
          <input inputMode="decimal" value={f.commissionPercent} onChange={set("commissionPercent")} />
        </Field>
      </div>
      <Field label={tx("agent.testAurWalkIn")} hint={tx("agent.baadMeinBhiJod")}>
        <textarea rows={10} value={f.tests} onChange={set("tests")} />
      </Field>
      <ErrorMsg msg={err} />
      <button className="primary-btn" disabled={busy}>
        {busy ? tx("agent.jodRaheHain") : tx("agent.labJodein")}
      </button>
    </form>
  );
}

function LabDetail({ id, onBack }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["agentLab", id], queryFn: () => get(`/agent/labs/${id}`) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["agentLab", id] });
    qc.invalidateQueries({ queryKey: ["onboarded"] });
  };
  return (
    <section>
      <button className="back" onClick={onBack}>
        {tx("agent.peeche")}
      </button>
      <QueryState query={q}>
        {(d) => (
          <>
            <LabSettings lab={d.lab} onSaved={refresh} />
            <StaffSection lab={d.lab} staff={d.staff} onSaved={refresh} />
            <TestsSection lab={d.lab} tests={d.tests} onSaved={refresh} />
          </>
        )}
      </QueryState>
    </section>
  );
}

function LabSettings({ lab, onSaved }) {
  const isAdmin = useAuth().user.role === "super_admin";
  const [f, setF] = useState({
    serviceRadiusKm: String(lab.serviceRadiusKm),
    collectionFee: String(lab.collectionFee),
    freeCollectionAbove: String(lab.freeCollectionAbove),
    minOrderValue: String(lab.minOrderValue),
    commissionPercent: String(lab.commissionPercent),
    phone: lab.phone || "",
    address: lab.address || "",
  });
  const [villages, setVillages] = useState((lab.villages || []).map(String));
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(body) {
    setErr("");
    setOk("");
    try {
      await patch(`/agent/labs/${lab._id}`, body);
      setOk(tx("agent.saveHoGaya"));
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  return (
    <div className="card form-card">
      <div className="row-between">
        <h2>{lab.name}</h2>
        <Badge status={lab.status} label={lab.status === "active" ? tx("agent.chalu") : tx("agent.band")} />
      </div>
      <p className="muted">
        {lab.pathologist?.name} {lab.pathologist?.qualification ? `(${lab.pathologist.qualification})` : ""} {tx("agent.licence")} {lab.licenceNo || "—"}
      </p>
      <div className="two">
        <Field label={tx("agent.phone")}>
          <input value={f.phone} onChange={set("phone")} />
        </Field>
        <Field label={tx("agent.pata")}>
          <input value={f.address} onChange={set("address")} />
        </Field>
      </div>
      <div className="three">
        <Field label={tx("agent.kmTakSample")}>
          <input value={f.serviceRadiusKm} onChange={set("serviceRadiusKm")} />
        </Field>
        <Field label={tx("agent.collectionFee")}>
          <input value={f.collectionFee} onChange={set("collectionFee")} />
        </Field>
        <Field label={tx("agent.iskeUparFree")}>
          <input value={f.freeCollectionAbove} onChange={set("freeCollectionAbove")} />
        </Field>
        <Field label={tx("agent.kamSeKamOrder")}>
          <input value={f.minOrderValue} onChange={set("minOrderValue")} />
        </Field>
        <Field label={tx("agent.commission")}>
          <input value={f.commissionPercent} onChange={set("commissionPercent")} />
        </Field>
      </div>
      <VillagePicker value={villages} onChange={setVillages} />
      <ErrorMsg msg={err} />
      <Ok msg={ok} />
      <div className="btn-row">
        <button
          className="primary-btn small"
          onClick={() =>
            save({
              serviceRadiusKm: num(f.serviceRadiusKm),
              collectionFee: num(f.collectionFee),
              freeCollectionAbove: num(f.freeCollectionAbove),
              minOrderValue: num(f.minOrderValue),
              commissionPercent: num(f.commissionPercent),
              ...(f.phone ? { phone: f.phone } : {}),
              ...(f.address ? { address: f.address } : {}),
              villages,
            })
          }
        >
          {tx("agent.saveKarein")}
        </button>
        {isAdmin && (
          <button className="secondary-btn small" onClick={() => save({ status: lab.status === "active" ? "disabled" : "active" })}>
            {lab.status === "active" ? tx("agent.labBandKarein") : tx("agent.labChaluKarein")}
          </button>
        )}
      </div>
    </div>
  );
}

function StaffSection({ lab, staff, onSaved }) {
  const [f, setF] = useState({ name: "", email: "", phone: "" });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState("");
  const [created, setCreated] = useState(null);
  async function submit(e) {
    e.preventDefault();
    setErr("");
    setCreated(null);
    try {
      const r = await post(`/agent/labs/${lab._id}/staff`, { name: f.name, email: f.email, phone: f.phone || undefined });
      setCreated({ email: r.user.email, password: r.tempPassword });
      setF({ name: "", email: "", phone: "" });
      setErrs({});
      onSaved();
    } catch (e2) {
      setErrs(fieldErrors(e2));
      setErr(errorMessage(e2));
    }
  }
  return (
    <div className="card form-card">
      <h2>{tx("agent.labStaffLogin")}</h2>
      {staff.length === 0 ? (
        <p className="muted">{tx("agent.abhiKoiLoginNahi")}</p>
      ) : (
        <ul className="plain-list">
          {staff.map((s) => (
            <li key={s._id}>
              <strong>{s.name}</strong> · {s.email} <Badge status={s.status} label={s.status === "active" ? tx("agent.chalu") : tx("agent.band")} />{" "}
              {s.mustChangePassword && <span className="chip">{tx("agent.pehlaLoginBaaki")}</span>}
              {s.lastLoginAt && <span className="muted small"> {tx("agent.aakhriLogin")} {prettyDateTime(s.lastLoginAt)}</span>}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} noValidate>
        <div className="three">
          <Field label={tx("agent.naam")} error={errs.name}>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label={tx("agent.emailLoginId")} error={errs.email}>
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label={tx("agent.phoneZarooriNahi")} error={errs.phone}>
            <input inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
        </div>
        <ErrorMsg msg={err} />
        <button className="primary-btn small">{tx("agent.loginBanayein")}</button>
      </form>
      <TempPassword email={created?.email} password={created?.password} />
    </div>
  );
}

function TestsSection({ lab, tests, onSaved }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  async function importTests() {
    setErr("");
    setResult(null);
    try {
      setResult(await post(`/agent/labs/${lab._id}/tests`, { text }));
      setText("");
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  return (
    <div className="card form-card">
      <h2>{tx("agent.testRateList")}{tests.length})</h2>
      <Field label={tx("agent.nayeTestJodeinYa")} hint={tx("agent.sameNaamWalaTest")}>
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={tx("agent.cbc400Tsh200")} />
      </Field>
      <ErrorMsg msg={err} />
      {result && (
        <div className="ok">
          {result.created} {tx("agent.naye")} {result.updated} {tx("agent.update")}
          {result.errors.length > 0 && (
            <ul className="small">
              {result.errors.map((e, i) => (
                <li key={i}>
                  {e.text}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button className="primary-btn small" disabled={!text.trim()} onClick={importTests}>
        {tx("agent.importKarein")}
      </button>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{tx("agent.test")}</th>
              <th>{tx("agent.walkIn")}</th>
              <th>{tx("agent.patientRate")}</th>
              <th>B2B</th>
              <th>{tx("agent.status")}</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((t) => (
              <tr key={t._id} className={t.active ? "" : "row-off"}>
                <td>{t.name}</td>
                <td>{rs(t.walkInPrice)}</td>
                <td>{rs(t.listingPrice)}</td>
                <td>{rs(t.b2bPrice)}</td>
                <td>{t.active ? tx("agent.chalu") : tx("agent.band")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const DOC_BLANK = {
  name: "",
  email: "",
  phone: "",
  degree: "MBBS",
  registrationNo: "",
  specialty: "General Physician",
  specialtyHi: "सामान्य रोग चिकित्सक",
  clinicName: "",
  clinicAddress: "",
  block: "Maharajganj",
  fee: "300",
};

function AddDoctor() {
  const qc = useQueryClient();
  const [f, setF] = useState(DOC_BLANK);
  const [loc, setLoc] = useState({ lat: "", lng: "" });
  const [villages, setVillages] = useState([]);
  const [schedule, setSchedule] = useState(DAYS.slice(0, 6).map((day) => ({ day, start: "10:00", end: "14:00", maxTokens: 30 })));
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const v = {};
    if (f.name.trim().length < 2) v.name = tx("agent.naamLikhein");
    if (!/^\S+@\S+\.\S+$/.test(f.email)) v.email = tx("agent.sahiEmailLikheinYahi");
    if (f.phone && !/^[6-9]\d{9}$/.test(f.phone)) v.phone = tx("agent.10AnkKaMobile");
    if (!loc.lat || !loc.lng) v.lat = tx("agent.clinicKiLocationDaalein");
    if (schedule.some((s) => s.start >= s.end)) v.schedule = tx("agent.harDinShuruKa");
    setErrs(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    setErr("");
    try {
      const r = await post("/agent/doctors", {
        ...Object.fromEntries(Object.entries(f).filter(([, val]) => val !== "")),
        fee: Number(f.fee || 0),
        lat: Number(loc.lat),
        lng: Number(loc.lng),
        schedule,
        villages,
      });
      setCreated({ email: r.user.email, password: r.tempPassword, name: r.doctor.name });
      setF(DOC_BLANK);
      setLoc({ lat: "", lng: "" });
      setVillages([]);
      qc.invalidateQueries({ queryKey: ["onboarded"] });
    } catch (e2) {
      setErrs(fieldErrors(e2));
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-card" onSubmit={submit} noValidate>
      <h2>{tx("agent.nayaDoctorJodein")}</h2>
      <p className="muted">{tx("agent.doctorKhudRegisterNahi")}</p>
      {created && <TempPassword email={created.email} password={created.password} />}
      <div className="two">
        <Field label={tx("agent.doctorKaNaam")} error={errs.name}>
          <input value={f.name} onChange={set("name")} placeholder={tx("agent.dr")} />
        </Field>
        <Field label={tx("agent.emailLoginId")} error={errs.email}>
          <input type="email" value={f.email} onChange={set("email")} />
        </Field>
      </div>
      <div className="three">
        <Field label={tx("agent.phone")} error={errs.phone}>
          <input inputMode="numeric" maxLength={10} value={f.phone} onChange={set("phone")} />
        </Field>
        <Field label={tx("agent.degree")}>
          <input value={f.degree} onChange={set("degree")} />
        </Field>
        <Field label={tx("agent.registrationNo")}>
          <input value={f.registrationNo} onChange={set("registrationNo")} />
        </Field>
      </div>
      <div className="two">
        <Field label={tx("agent.specialtyEnglish")} error={errs.specialty}>
          <input value={f.specialty} onChange={set("specialty")} />
        </Field>
        <Field label={tx("agent.specialtyGaonKiBhasha")}>
          <input value={f.specialtyHi} onChange={set("specialtyHi")} />
        </Field>
      </div>
      <div className="two">
        <Field label={tx("agent.clinicKaNaam")}>
          <input value={f.clinicName} onChange={set("clinicName")} />
        </Field>
        <Field label={tx("agent.clinicKaPata")}>
          <input value={f.clinicAddress} onChange={set("clinicAddress")} />
        </Field>
      </div>
      <LocationPicker value={loc} onChange={setLoc} error={errs.lat} onVillage={addVillage(setVillages)} />
      <VillagePicker value={villages} onChange={setVillages} />
      <div className="field">
        <span className="field-label">{tx("agent.kabBaithteHain")}</span>
        <ScheduleRows value={schedule} onChange={setSchedule} />
        {errs.schedule && <span className="field-error">{errs.schedule}</span>}
      </div>
      <Field label={tx("agent.fees")}>
        <input inputMode="numeric" value={f.fee} onChange={set("fee")} />
      </Field>
      <ErrorMsg msg={err} />
      <button className="primary-btn" disabled={busy}>
        {busy ? tx("agent.jodRaheHain") : tx("agent.doctorJodeinAurLogin")}
      </button>
    </form>
  );
}

function Onboarded({ onOpenLab }) {
  const isAdmin = useAuth().user.role === "super_admin";
  const qc = useQueryClient();
  const [type, setType] = useState("lab");
  const [page, setPage] = useState(1);
  const [err, setErr] = useState("");
  const q = useQuery({ queryKey: ["onboarded", type, page], queryFn: () => get("/agent/my-onboarded", { type, page }) });
  async function toggleDoctor(d) {
    try {
      await patch(`/agent/doctors/${d._id}`, { status: d.status === "active" ? "disabled" : "active" });
      qc.invalidateQueries({ queryKey: ["onboarded"] });
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  return (
    <>
      <div className="pill-row">
        {[
          ["lab", tx("agent.labs")],
          ["doctor", tx("agent.doctors")],
        ].map(([k, l]) => (
          <button
            key={k}
            className={`pill ${type === k ? "on" : ""}`}
            onClick={() => {
              setType(k);
              setPage(1);
            }}
          >
            {l}
          </button>
        ))}
      </div>
      <ErrorMsg msg={err} />
      {!isAdmin && <p className="muted small">{tx("agent.labYaDoctorKo")}</p>}
      <QueryState query={q} empty={type === "lab" ? tx("agent.abhiKoiLabNahi") : tx("agent.abhiKoiDoctorNahi")}>
        {(d) => (
          <>
            <div className="grid">
              {d.data.map((x) =>
                type === "lab" ? (
                  <div key={x._id} className={`card ${x.status === "active" ? "" : "out"}`}>
                    <div className="row-between">
                      <h3>{x.name}</h3>
                      <Badge status={x.status} label={x.status === "active" ? tx("agent.chalu") : tx("agent.band")} />
                    </div>
                    <p className="muted">
                      {x.testCount} {tx("agent.test2")} {x.staffCount} {tx("agent.login")} {x.serviceRadiusKm} {tx("agent.kmTak")}
                    </p>
                    <p className="muted small">{tx("agent.joda")} {prettyDate(x.createdAt?.slice(0, 10))}</p>
                    <button className="secondary-btn small" onClick={() => onOpenLab(x._id)}>
                      {tx("agent.kholeinTestLoginSettings")}
                    </button>
                  </div>
                ) : (
                  <div key={x._id} className={`card ${x.status === "active" ? "" : "out"}`}>
                    <div className="row-between">
                      <h3>{x.name}</h3>
                      <Badge status={x.status} label={x.status === "active" ? tx("agent.chalu") : tx("agent.band")} />
                    </div>
                    <p className="muted">
                      {x.specialty} · {rs(x.fee)} · {x.schedule.map((s) => s.day).join(", ")}
                    </p>
                    <p className="muted small">
                      {tx("agent.login2")} {x.user?.email} {x.user?.mustChangePassword ? tx("agent.pehlaLoginBaaki2") : x.user?.lastLoginAt ? tx("agent.aakhriLogin2", { v1: prettyDateTime(x.user.lastLoginAt) }) : ""}
                    </p>
                    <DoctorVillages doctor={x} onSaved={() => qc.invalidateQueries({ queryKey: ["onboarded"] })} />
                    {isAdmin && (
                      <button className="secondary-btn small" onClick={() => toggleDoctor(x)}>
                        {x.status === "active" ? tx("agent.bandKarein") : tx("agent.chaluKarein")}
                      </button>
                    )}
                  </div>
                )
              )}
            </div>
            <Pager meta={d.meta} onPage={setPage} />
          </>
        )}
      </QueryState>
    </>
  );
}

function DoctorVillages({ doctor, onSaved }) {
  const [open, setOpen] = useState(false);
  const [villages, setVillages] = useState((doctor.villages || []).map(String));
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  if (!open)
    return (
      <button className="secondary-btn small" onClick={() => setOpen(true)}>
        {tx("agent.gaonChunein")}{(doctor.villages || []).length})
      </button>
    );
  async function save() {
    setErr("");
    setOk("");
    try {
      await patch(`/agent/doctors/${doctor._id}`, { villages });
      setOk(tx("agent.saveHoGaya"));
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  return (
    <>
      <VillagePicker value={villages} onChange={setVillages} />
      <ErrorMsg msg={err} />
      <Ok msg={ok} />
      <div className="btn-row">
        <button className="primary-btn small" onClick={save}>
          {tx("agent.gaonSaveKarein")}
        </button>
        <button className="secondary-btn small" onClick={() => setOpen(false)}>
          {tx("agent.bandKarein")}
        </button>
      </div>
    </>
  );
}

function AgentBookings() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const q = useQuery({ queryKey: ["agentBookings", page, status], queryFn: () => get("/agent/bookings", { page, status: status || undefined }) });
  return (
    <>
      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={tx("agent.statusFilter")}>
        <option value="">{tx("agent.sabhiStatus")}</option>
        {["requested", "confirmed", "collected", "report_ready", "cancelled"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <QueryState query={q} empty={tx("agent.aapkeLabsMeinAbhi")}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{tx("agent.code")}</th>
                    <th>{tx("agent.mareez")}</th>
                    <th>{tx("agent.gaon")}</th>
                    <th>{tx("agent.lab")}</th>
                    <th>{tx("agent.test")}</th>
                    <th>{tx("agent.din")}</th>
                    <th>{tx("agent.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((b) => (
                    <tr key={b._id}>
                      <td>
                        {b.code}
                        {b.source === "doctor" ? " 🩺" : ""}
                      </td>
                      <td>{b.patientName}</td>
                      <td>{b.village?.name}</td>
                      <td>{b.lab?.name}</td>
                      <td>{b.items.map((i) => i.name).join(", ")}</td>
                      <td>{prettyDate(b.date)}</td>
                      <td>
                        <Badge status={b.status} />
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
