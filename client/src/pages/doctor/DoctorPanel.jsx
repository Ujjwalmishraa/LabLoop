import { useState } from "react";
import { Icon } from "../../components/Icons.jsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch, post, errorMessage, fieldErrors } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useT } from "../../i18n/I18nContext.jsx";
import { PanelShell, Badge, ErrorMsg, Field, Ok, Pager, QueryState, Stat, Steps } from "../../components/ui.jsx";
import { EtaBanner } from "../../components/EtaBanner.jsx";
import { rs, prettyDate, prettyDateTime, todayIso, DAYS } from "../../utils.js";

export default function DoctorPanel() {
  const { t } = useT();
  const { user } = useAuth();
  const [tab, setTab] = useState("today");
  const [walkIn, setWalkIn] = useState(false);
  const today = useQuery({ queryKey: ["docAppts", "today"], queryFn: () => get("/doctor/appointments", { when: "today" }), refetchInterval: 20_000 });
  const requests = useQuery({ queryKey: ["docRequests"], queryFn: () => get("/doctor/sample-requests", { limit: 50 }), refetchInterval: 20_000 });
  const tokens = today.data?.data || [];
  const open = (requests.data?.data || []).filter((b) => !["report_ready", "cancelled"].includes(b.status)).length;
  return (
    <PanelShell
      role={user.doctor?.name ? `${t("role.doctor")} · ${user.doctor.name}` : t("doc.panel")}
      tabs={[
        { key: "today", label: t("doc.tab.today"), icon: "clock" },
        { key: "upcoming", label: t("doc.tab.upcoming"), icon: "calendar" },
        { key: "past", label: t("doc.tab.past"), icon: "list" },
        { key: "requests", label: t("doc.tab.requests"), icon: "flask", count: open },
        { key: "schedule", label: t("doc.tab.schedule"), icon: "calendar" },
      ]}
      value={tab}
      onChange={setTab}
      actions={
        <button className="primary-btn small" onClick={() => setWalkIn(true)} data-testid="walk-in-btn">
          <Icon name="plus" size={18} /> {t("doc.walkIn")}
        </button>
      }
    >
      {walkIn && (
        <div className="card form-card">
          <h2>{t("doc.walkInTitle")}</h2>
          <p className="muted">{t("doc.walkInSub")}</p>
          <SampleRequestForm
            onCancel={() => setWalkIn(false)}
            onDone={() => {
              setWalkIn(false);
              setTab("requests");
            }}
          />
        </div>
      )}
      {!["schedule", "requests"].includes(tab) && (
        <div className="stat-row">
          <Stat icon="users" label={t("doc.stat.today")} value={tokens.filter((a) => a.status !== "cancelled").length} />
          <Stat icon="clock" tone="amber" label={t("doc.stat.waiting")} value={tokens.filter((a) => a.status === "booked").length} />
          <Stat icon="checkCircle" tone="green" label={t("doc.stat.seen")} value={tokens.filter((a) => a.status === "seen").length} />
          <Stat icon="flask" tone="violet" label={t("doc.stat.referred")} value={tokens.filter((a) => a.referredBooking).length} />
        </div>
      )}
      {tab === "schedule" ? <ScheduleEditor /> : tab === "requests" ? <LabRequests /> : <ApptList when={tab} />}
    </PanelShell>
  );
}

function ApptList({ when }) {
  const { t } = useT();
  const q = useQuery({
    queryKey: ["docAppts", when],
    queryFn: () => get("/doctor/appointments", { when, sort: when === "past" ? "-date" : "date", limit: 100 }),
    refetchInterval: when === "today" ? 20_000 : false,
  });
  return (
    <QueryState query={q} empty={when === "today" ? t("doc.noToday") : t("doc.noAppts")} emptyIcon="🩺">
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
  const { t } = useT();
  const qc = useQueryClient();
  const [refer, setRefer] = useState(false);
  const [askCode, setAskCode] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const canMark = a.status === "booked" && a.date <= todayIso();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["docAppts"] });
    qc.invalidateQueries({ queryKey: ["docRequests"] });
  };

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
          {who.age ? `, ${t("common.years", { n: who.age })}` : ""}
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
      {a.visitLocked && <p className="error">{t("doc.visitLocked")}</p>}
      {a.referredBooking && (
        <div className="info">
          {t("doc.referredLine", { tests: a.referredBooking.items.map((i) => i.name).join(", "), lab: a.referredBooking.lab?.name || "" })}{" "}
          <Badge status={a.referredBooking.status} />
        </div>
      )}
      {refer ? (
        <SampleRequestForm
          appt={a}
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
              <Field label={t("doc.codeLabel")}>
                <input inputMode="numeric" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label={t("doc.visitCode")} />
              </Field>
              <div className="btn-row">
                <button className="primary-btn small" disabled={code.length !== 4} onClick={() => mark("seen")}>
                  <Icon name="check" size={18} /> {t("doc.codeOk")}
                </button>
                <button className="link-btn" onClick={() => setAskCode(false)}>
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}
          {canMark && !askCode && !a.visitLocked && (
            <button className="primary-btn small" onClick={() => setAskCode(true)}>
              <Icon name="check" size={18} /> {t("doc.seen")}
            </button>
          )}
          {canMark && (
            <button className="secondary-btn small" onClick={() => mark("no-show")}>
              {t("doc.noShow")}
            </button>
          )}
          {!a.referredBooking && a.status !== "cancelled" && (
            <button className="secondary-btn small" onClick={() => setRefer(true)}>
              <Icon name="flask" size={18} /> {t("doc.sendRequest")}
            </button>
          )}
        </div>
      )}
      <ErrorMsg msg={err} />
    </div>
  );
}

// Doctor sends a sample request to a lab: for an appointment (clinic or home pickup) or a walk-in
// patient without an account (clinic pickup only). Labs are the ones that serve the clinic
// (or the patient's village, for home pickup).
function SampleRequestForm({ appt, onCancel, onDone }) {
  const { t } = useT();
  const qc = useQueryClient();
  const villageId = appt?.village?._id;
  const [point, setPoint] = useState("clinic");
  const [person, setPerson] = useState({ name: "", age: "", gender: "", phone: "" });
  const home = point === "home";
  const labs = useQuery({
    queryKey: home ? ["labs", villageId] : ["clinicLabs"],
    queryFn: () => (home ? get("/labs", { villageId, limit: 20 }) : get("/doctor/clinic-labs")),
    enabled: !home || !!villageId,
  });
  const [labId, setLabId] = useState("");
  const labList = labs.data?.data || [];
  const chosen = labList.some((l) => l._id === labId) ? labId : labList[0]?._id;
  const tests = useQuery({ queryKey: ["labTests", chosen], queryFn: () => get(`/labs/${chosen}/tests`), enabled: !!chosen });
  const [picked, setPicked] = useState([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const list = tests.data?.data || [];
  const total = list.filter((x) => picked.includes(x._id)).reduce((s, x) => s + x.listingPrice, 0);

  async function submit() {
    const v = {};
    if (!appt && person.name.trim().length < 2) v["walkIn.name"] = t("doc.err.name");
    if (!picked.length) v.testIds = t("doc.err.tests");
    setErrs(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    setErr("");
    try {
      const body = {
        labId: chosen,
        testIds: picked,
        collectionPoint: point,
        note: note.trim() || undefined,
        ...(appt
          ? { appointmentId: appt._id }
          : { walkIn: { name: person.name.trim(), age: person.age || undefined, gender: person.gender || undefined, phone: person.phone || undefined } }),
      };
      const b = await post("/doctor/sample-requests", body);
      qc.invalidateQueries({ queryKey: ["docRequests"] });
      setSent(b);
    } catch (e) {
      setErrs(fieldErrors(e));
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <div className="actions sent-box" role="status">
        <p className="ok">{t("doc.sent", { lab: sent.lab?.name || "" })}</p>
        {sent.otp && <OtpBox otp={sent.otp} />}
        <button className="primary-btn small" onClick={onDone}>
          {t("common.done")}
        </button>
      </div>
    );

  return (
    <div className="actions sample-form">
      {!appt && (
        <div className="three">
          <Field label={t("doc.walkInName")} error={errs["walkIn.name"]}>
            <input value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} autoComplete="off" />
          </Field>
          <Field label={t("profile.age")}>
            <input inputMode="numeric" maxLength={3} value={person.age} onChange={(e) => setPerson({ ...person, age: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field label={t("doc.gender")}>
            <select value={person.gender} onChange={(e) => setPerson({ ...person, gender: e.target.value })}>
              <option value="">—</option>
              <option value="female">{t("gender.female")}</option>
              <option value="male">{t("gender.male")}</option>
              <option value="other">{t("gender.other")}</option>
            </select>
          </Field>
          <Field label={`${t("auth.mobile")} ${t("common.optional")}`} error={errs["walkIn.phone"]}>
            <input inputMode="numeric" maxLength={10} value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value.replace(/\D/g, "") })} />
          </Field>
        </div>
      )}
      <div className="field">
        <span className="field-label">{t("doc.where")}</span>
        <div className="pill-row" role="radiogroup" aria-label={t("doc.where")}>
          <button type="button" role="radio" aria-checked={!home} className={`pill ${!home ? "on" : ""}`} onClick={() => setPoint("clinic")}>
            <Icon name="building" size={16} /> {t("doc.atClinic")}
          </button>
          {appt && (
            <button type="button" role="radio" aria-checked={home} className={`pill ${home ? "on" : ""}`} onClick={() => setPoint("home")} disabled={!villageId}>
              <Icon name="home" size={16} /> {t("doc.atHome")}
            </button>
          )}
        </div>
        <span className="field-hint">{home ? t("doc.homeHint") : t("doc.clinicHint")}</span>
      </div>
      <QueryState query={labs} empty={home ? t("doc.noLabsVillage") : t("doc.noLabsClinic")}>
        {() => (
          <>
            <Field label={t("doc.whichLab")}>
              <select
                value={chosen}
                onChange={(e) => {
                  setLabId(e.target.value);
                  setPicked([]);
                }}
              >
                {labList.map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.name} ({t("common.km", { n: l.distanceKm })})
                  </option>
                ))}
              </select>
            </Field>
            <input className="search" placeholder={t("lab.searchTest")} aria-label={t("lab.searchTest")} value={search} onChange={(e) => setSearch(e.target.value)} />
            {errs.testIds && (
              <span className="field-error" role="alert">
                {errs.testIds}
              </span>
            )}
            <div className="mini-tests">
              {list
                .filter((x) => x.name.toLowerCase().includes(search.toLowerCase()))
                .map((x) => (
                  <label key={x._id} className={`mini-test ${picked.includes(x._id) ? "on" : ""}`}>
                    <input type="checkbox" checked={picked.includes(x._id)} onChange={() => toggle(x._id)} />
                    <span className="t-name">{x.name}</span> <span className="muted">{rs(x.listingPrice)}</span>
                  </label>
                ))}
            </div>
            <div className="row-between">
              <span className="muted">{t("doc.testsTotal")}</span>
              <strong>{rs(total)}</strong>
            </div>
          </>
        )}
      </QueryState>
      <Field label={`${t("doc.note")} ${t("common.optional")}`}>
        <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t("doc.notePh")} />
      </Field>
      <ErrorMsg msg={err} />
      <div className="btn-row">
        <button className="primary-btn small" disabled={busy || !chosen} onClick={submit}>
          <Icon name="truck" size={18} /> {busy ? t("common.loading") : t("doc.send")}
        </button>
        <button className="secondary-btn small" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

// Clinic pickup OTP: the doctor or clinic staff reads it out to the collector.
function OtpBox({ otp }) {
  const { t } = useT();
  return (
    <div className="otp-card" data-testid="doctor-otp-box">
      <div>
        <span className="otp-label">{t("doc.pickupOtp")}</span>
        <strong className="otp-digits" data-testid="doctor-otp">
          {otp}
        </strong>
      </div>
      <p className="small">{t("doc.pickupOtpHint")}</p>
    </div>
  );
}

// ---------- Lab requests ----------
function LabRequests() {
  const { t } = useT();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["docRequests", page], queryFn: () => get("/doctor/sample-requests", { page, limit: 20 }), refetchInterval: 20_000 });
  return (
    <QueryState query={q} empty={t("doc.noRequests")} emptyIcon="🧪">
      {(d) => (
        <>
          <div className="grid">
            {d.data.map((b) => (
              <RequestCard key={b._id} b={b} />
            ))}
          </div>
          <Pager meta={d.meta} onPage={setPage} />
        </>
      )}
    </QueryState>
  );
}

function RequestCard({ b }) {
  const { t } = useT();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function openReport() {
    setBusy(true);
    setErr("");
    try {
      const r = await get(`/bookings/${b._id}/report`);
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const clinic = b.collectionPoint === "clinic";
  return (
    <div className="card" data-testid="request-card">
      <div className="row-between">
        <h3>
          {b.patientName}
          {b.patientAge ? `, ${t("common.years", { n: b.patientAge })}` : ""}
        </h3>
        <Badge status={b.status} />
      </div>
      <div className="chips">
        <span className="chip">
          <Icon name={clinic ? "building" : "home"} size={14} /> {clinic ? t("doc.atClinic") : t("doc.atHome")}
        </span>
        {b.walkIn?.name && <span className="chip">{t("lab.walkIn")}</span>}
        <span className="code-chip">{b.code}</span>
      </div>
      <p className="meta strong">
        <Icon name="flask" size={17} /> {b.items.map((i) => i.name).join(", ")}
      </p>
      <p className="meta">
        <Icon name="building" size={17} />
        <span>
          {b.lab?.name} · {prettyDate(b.date)}
        </span>
      </p>
      <Steps status={b.status} />
      {b.otp && <OtpBox otp={b.otp} />}
      <EtaBanner b={b} />
      {b.status === "report_ready" && (
        <button className="primary-btn small" disabled={busy} onClick={openReport}>
          <Icon name="file" size={18} /> {t("doc.viewReport")}
        </button>
      )}
      {b.report?.uploadedAt && <p className="muted small">{t("doc.reportAt", { when: prettyDateTime(b.report.uploadedAt) })}</p>}
      <ErrorMsg msg={err} />
    </div>
  );
}

// ---------- schedule ----------
export function ScheduleRows({ value, onChange }) {
  const { t } = useT();
  const byDay = Object.fromEntries(value.map((s) => [s.day, s]));
  const set = (day, patchObj) => onChange(DAYS.map((d) => (d === day ? { ...(byDay[d] || { day: d, start: "10:00", end: "14:00", maxTokens: 30 }), ...patchObj } : byDay[d])).filter(Boolean));
  return (
    <div className="schedule">
      {DAYS.map((day) => {
        const s = byDay[day];
        const dayName = t(`day.${day}`);
        return (
          <div key={day} className={`sched-row ${s ? "on" : ""}`}>
            <label className="sched-day">
              <input type="checkbox" checked={!!s} onChange={(e) => (e.target.checked ? set(day, {}) : onChange(value.filter((x) => x.day !== day)))} />
              {dayName}
            </label>
            {s && (
              <>
                <input type="time" value={s.start} onChange={(e) => set(day, { start: e.target.value })} aria-label={t("sched.startAria", { day: dayName })} />
                <span>{t("sched.to")}</span>
                <input type="time" value={s.end} onChange={(e) => set(day, { end: e.target.value })} aria-label={t("sched.endAria", { day: dayName })} />
                <input
                  className="price-input"
                  inputMode="numeric"
                  value={s.maxTokens}
                  onChange={(e) => set(day, { maxTokens: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                  aria-label={t("sched.maxAria", { day: dayName })}
                />
                <span className="small muted">{t("sched.tokens")}</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScheduleEditor() {
  const { t } = useT();
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
          if (bad) return setErr(t("sched.bad", { day: t(`day.${bad.day}`) }));
          try {
            await patch("/doctor/schedule", { schedule, fee: Number(feeVal) });
            setDraft(null);
            setFee(null);
            qc.invalidateQueries({ queryKey: ["docSchedule"] });
            setOk(t("sched.saved"));
          } catch (e) {
            setErr(errorMessage(e));
          }
        }
        return (
          <div className="card form-card">
            <h2>{t("sched.title")}</h2>
            <p className="muted">{t("sched.sub")}</p>
            <ScheduleRows value={schedule} onChange={setDraft} />
            <Field label={t("sched.fee")}>
              <input inputMode="numeric" value={feeVal} onChange={(e) => setFee(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <ErrorMsg msg={err} />
            <Ok msg={ok} />
            <button className="primary-btn" onClick={save}>
              {t("common.save")}
            </button>
          </div>
        );
      }}
    </QueryState>
  );
}
