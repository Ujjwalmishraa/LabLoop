import { useState } from "react";
import { Icon } from "../../components/Icons.jsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch, post, errorMessage } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useT } from "../../i18n/I18nContext.jsx";
import { PanelShell, Badge, ErrorMsg, Field, Ok, QueryState, Stat } from "../../components/ui.jsx";
import { rs, prettyDate, todayIso, DAYS } from "../../utils.js";

export default function DoctorPanel() {
  const { user } = useAuth();
  const [tab, setTab] = useState("today");
  const today = useQuery({ queryKey: ["docAppts", "today"], queryFn: () => get("/doctor/appointments", { when: "today" }), refetchInterval: 20_000 });
  const tokens = today.data?.data || [];
  return (
    <PanelShell
      role={user.doctor?.name ? `Doctor · ${user.doctor.name}` : "Doctor panel"}
      tabs={[
        { key: "today", label: "Aaj", icon: "clock" },
        { key: "upcoming", label: "Aage ke din", icon: "calendar" },
        { key: "past", label: "Pehle ke", icon: "list" },
        { key: "schedule", label: "Mera samay", icon: "calendar" },
      ]}
      value={tab}
      onChange={setTab}
    >
      {tab !== "schedule" && (
        <div className="stat-row">
          <Stat icon="users" label="Aaj ke mareez" value={tokens.filter((a) => a.status !== "cancelled").length} />
          <Stat icon="clock" tone="amber" label="Abhi baaki" value={tokens.filter((a) => a.status === "booked").length} />
          <Stat icon="checkCircle" tone="green" label="Dekh liye" value={tokens.filter((a) => a.status === "seen").length} />
          <Stat icon="flask" tone="violet" label="Lab ko refer (aaj)" value={tokens.filter((a) => a.referredBooking).length} />
        </div>
      )}
      {tab === "schedule" ? <ScheduleEditor /> : <ApptList when={tab} />}
    </PanelShell>
  );
}

function ApptList({ when }) {
  const q = useQuery({
    queryKey: ["docAppts", when],
    queryFn: () => get("/doctor/appointments", { when, sort: when === "past" ? "-date" : "date", limit: 100 }),
    refetchInterval: when === "today" ? 20_000 : false,
  });
  return (
    <QueryState query={q} empty={when === "today" ? "Aaj abhi koi number nahi laga." : "Koi appointment nahi."} emptyIcon="🩺">
      {(d) => {
        const groups = {};
        for (const a of d.data) (groups[a.date] ||= []).push(a);
        return Object.entries(groups).map(([date, list]) => (
          <div key={date}>
            {when !== "today" && <h2 className="section-title">{prettyDate(date)}</h2>}
            <div className="grid">
              {list.map((a) => (
                <ApptCard key={a._id} a={a} />
              ))}
            </div>
          </div>
        ));
      }}
    </QueryState>
  );
}

function ApptCard({ a }) {
  const qc = useQueryClient();
  const [refer, setRefer] = useState(false);
  const [askCode, setAskCode] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const canMark = a.status === "booked" && a.date <= todayIso();
  const refresh = () => qc.invalidateQueries({ queryKey: ["docAppts"] });

  async function mark(kind) {
    setErr("");
    try {
      await patch(`/doctor/appointments/${a._id}/${kind}`, kind === "seen" ? { code } : {});
      refresh();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  const who = a.familyMember || { name: a.patientName, age: a.patientAge };
  return (
    <div className="card" data-testid="appt-card">
      <div className="row-between">
        <h3>
          <span className="token">#{a.token}</span> {who.name}
          {who.age ? `, ${who.age} saal` : ""}
        </h3>
        <Badge status={a.status} />
      </div>
      <p className="meta">
        <Icon name="pin" size={17} /> {a.village?.name || "—"}
        <Icon name="phone" size={17} />
        <a className="link-btn" href={`tel:${a.patient?.phone}`}>
          {a.patient?.phone}
        </a>
      </p>
      {a.visitLocked && <p className="error">Galat code 5 baar daala gaya. Yeh number lock hai, LabLoop team ko batayein.</p>}
      {a.referredBooking && (
        <div className="info">
          Lab test likha: {a.referredBooking.items.map((i) => i.name).join(", ")} → {a.referredBooking.lab?.name} <Badge status={a.referredBooking.status} />
        </div>
      )}
      {refer ? (
        <ReferForm
          a={a}
          onCancel={() => setRefer(false)}
          onDone={() => {
            setRefer(false);
            refresh();
          }}
        />
      ) : (
        <div className="btn-row">
          {canMark && askCode && !a.visitLocked && (
            <div className="code-entry">
              <Field label="Mareez ki receipt ka 4 ank ka code">
                <input inputMode="numeric" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Visit code" />
              </Field>
              <div className="btn-row">
                <button className="primary-btn small" disabled={code.length !== 4} onClick={() => mark("seen")}>
                  <Icon name="check" size={18} /> Code sahi, dekh liya
                </button>
                <button className="link-btn" onClick={() => setAskCode(false)}>
                  Rehne dein
                </button>
              </div>
            </div>
          )}
          {canMark && !askCode && !a.visitLocked && (
            <button className="primary-btn small" onClick={() => setAskCode(true)}>
              <Icon name="check" size={18} /> Dekh liya
            </button>
          )}
          {canMark && (
            <button className="secondary-btn small" onClick={() => mark("no-show")}>
              Nahi aaye
            </button>
          )}
          {!a.referredBooking && a.status !== "cancelled" && (
            <button className="secondary-btn small" onClick={() => setRefer(true)}>
              <Icon name="flask" size={18} /> Lab test likhein
            </button>
          )}
        </div>
      )}
      <ErrorMsg msg={err} />
    </div>
  );
}

function ReferForm({ a, onCancel, onDone }) {
  const villageId = a.village?._id;
  const labs = useQuery({ queryKey: ["labs", villageId], queryFn: () => get("/labs", { villageId, limit: 20 }), enabled: !!villageId });
  const [labId, setLabId] = useState("");
  const chosen = labId || labs.data?.data[0]?._id;
  const tests = useQuery({ queryKey: ["labTests", chosen], queryFn: () => get(`/labs/${chosen}/tests`), enabled: !!chosen });
  const [picked, setPicked] = useState([]);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const list = tests.data?.data || [];
  const total = list.filter((t) => picked.includes(t._id)).reduce((s, t) => s + t.listingPrice, 0);

  async function submit() {
    if (!picked.length) return setErr("Kam se kam ek test chunein");
    setBusy(true);
    setErr("");
    try {
      await post("/doctor/referrals", { appointmentId: a._id, labId: chosen, testIds: picked });
      onDone();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!villageId) return <ErrorMsg msg="Mareez ka gaon pata nahi, refer nahi ho sakta." />;
  return (
    <div className="actions">
      <QueryState query={labs} empty="Mareez ke gaon tak koi partner lab nahi pahunchta.">
        {(d) => (
          <>
            <Field label="Kaunse lab mein? (paas wale pehle)">
              <select
                value={chosen}
                onChange={(e) => {
                  setLabId(e.target.value);
                  setPicked([]);
                }}
              >
                {d.data.map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.name} ({l.distanceKm} km)
                  </option>
                ))}
              </select>
            </Field>
            <input className="search" placeholder="Test dhoondein" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="mini-tests">
              {list
                .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
                .map((t) => (
                  <label key={t._id} className={`mini-test ${picked.includes(t._id) ? "on" : ""}`}>
                    <input type="checkbox" checked={picked.includes(t._id)} onChange={() => toggle(t._id)} />
                    <span className="t-name">{t.name}</span> <span className="muted">{rs(t.listingPrice)}</span>
                  </label>
                ))}
            </div>
            <div className="row-between">
              <span className="muted">Patient ko ghar se sample milega</span>
              <strong>{rs(total)}</strong>
            </div>
          </>
        )}
      </QueryState>
      <ErrorMsg msg={err} />
      <div className="btn-row">
        <button className="primary-btn small" disabled={busy || !chosen} onClick={submit}>
          Lab ko bhejein →
        </button>
        <button className="secondary-btn small" onClick={onCancel}>
          Rehne dein
        </button>
      </div>
    </div>
  );
}

export function ScheduleRows({ value, onChange }) {
  const { t } = useT();
  const byDay = Object.fromEntries(value.map((s) => [s.day, s]));
  const set = (day, patchObj) => onChange(DAYS.map((d) => (d === day ? { ...(byDay[d] || { day: d, start: "10:00", end: "14:00", maxTokens: 30 }), ...patchObj } : byDay[d])).filter(Boolean));
  return (
    <div className="schedule">
      {DAYS.map((day) => {
        const s = byDay[day];
        return (
          <div key={day} className={`sched-row ${s ? "on" : ""}`}>
            <label className="sched-day">
              <input
                type="checkbox"
                checked={!!s}
                onChange={(e) => (e.target.checked ? set(day, {}) : onChange(value.filter((x) => x.day !== day)))}
              />
              {t(`day.${day}`)}
            </label>
            {s && (
              <>
                <input type="time" value={s.start} onChange={(e) => set(day, { start: e.target.value })} aria-label={`${day} start`} />
                <span>se</span>
                <input type="time" value={s.end} onChange={(e) => set(day, { end: e.target.value })} aria-label={`${day} end`} />
                <input
                  className="price-input"
                  inputMode="numeric"
                  value={s.maxTokens}
                  onChange={(e) => set(day, { maxTokens: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                  aria-label={`${day} max tokens`}
                />
                <span className="small muted">number</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScheduleEditor() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["docSchedule"], queryFn: () => get("/doctor/schedule") });
  const [draft, setDraft] = useState(null);
  const [fee, setFee] = useState(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  return (
    <QueryState query={q}>
      {(d) => {
        const schedule = draft ?? d.schedule;
        const feeVal = fee ?? String(d.fee ?? 0);
        async function save() {
          setErr("");
          setOk("");
          const bad = schedule.find((s) => s.start >= s.end || s.maxTokens < 1);
          if (bad) return setErr(`${bad.day}: shuru ka samay khatam se pehle ho, aur kam se kam 1 number`);
          try {
            await patch("/doctor/schedule", { schedule, fee: Number(feeVal) });
            setDraft(null);
            setFee(null);
            qc.invalidateQueries({ queryKey: ["docSchedule"] });
            setOk("Samay save ho gaya ✓");
          } catch (e) {
            setErr(errorMessage(e));
          }
        }
        return (
          <div className="card form-card">
            <h2>Kab baithte hain</h2>
            <p className="muted">Mareez sirf inhi dinon ka number le sakte hain. "Number" = us din zyada se zyada kitne mareez.</p>
            <ScheduleRows value={schedule} onChange={setDraft} />
            <Field label="Fees ₹">
              <input inputMode="numeric" value={feeVal} onChange={(e) => setFee(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <ErrorMsg msg={err} />
            <Ok msg={ok} />
            <button className="primary-btn" onClick={save}>
              Save karein
            </button>
          </div>
        );
      }}
    </QueryState>
  );
}
