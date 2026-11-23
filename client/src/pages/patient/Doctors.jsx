import { useState } from "react";
import { Icon } from "../../components/Icons.jsx";
import { DoctorReceipt } from "../../components/Receipt.jsx";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post, errorMessage } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useT } from "../../i18n/I18nContext.jsx";
import { Back, ErrorMsg, QueryState } from "../../components/ui.jsx";
import { rs, dayLabel, time12, DAYS, specialtyName } from "../../utils.js";

export function scheduleText(schedule, t) {
  const sorted = [...(schedule || [])].sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day));
  return sorted.map((s) => `${t(`day.${s.day}`)} ${time12(s.start)}–${time12(s.end)}`);
}

export function DoctorList() {
  const { t } = useT();
  const { user } = useAuth();
  const nav = useNavigate();
  const [specialty, setSpecialty] = useState("");
  const specs = useQuery({ queryKey: ["specialties"], queryFn: () => get("/specialties"), staleTime: 10 * 60_000 });
  const docs = useQuery({
    queryKey: ["doctors", user.village._id, specialty],
    queryFn: () => get("/doctors", { villageId: user.village._id, specialty: specialty || undefined, limit: 50 }),
  });

  return (
    <section>
      <Back to="/home" />
      <h1 className="big-title">{t("doctors.title")}</h1>
      <div className="pill-row scroll-row" role="radiogroup" aria-label={t("doctors.specialty")}>
        <button role="radio" aria-checked={!specialty} className={`pill ${!specialty ? "on" : ""}`} onClick={() => setSpecialty("")}>
          {t("doctors.all")}
        </button>
        {specs.data?.data.map((s) => (
          <button role="radio" aria-checked={specialty === s.specialty} key={s.specialty} className={`pill ${specialty === s.specialty ? "on" : ""}`} onClick={() => setSpecialty(s.specialty)}>
            {specialtyName(s)}
          </button>
        ))}
      </div>
      <QueryState query={docs} empty={t("doctors.none")} emptyIcon="🩺">
        {(d) =>
          d.data.map((doc) => (
            <div key={doc._id} className="card doc-card">
              <div className="row-between">
                <h3>{doc.name}</h3>
                <span className="km">{t("common.km", { n: doc.distanceKm })}</span>
              </div>
              <p className="doc-spec">
                {specialtyName(doc)} · <span className="muted">{doc.degree}</span>
              </p>
              <p className="meta"><Icon name="building" size={17} /> {[doc.clinicName, doc.clinicAddress].filter(Boolean).join(", ")}</p>
              <div className="doc-info">
                <div>
                  <span className="muted small">{t("doctors.when")}</span>
                  {scheduleText(doc.schedule, t).map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
                <div className="fee">
                  <span className="muted small">{t("doctors.fee")}</span>
                  <div className="fee-amt">{rs(doc.fee)}</div>
                </div>
              </div>
              <button className="primary-btn" onClick={() => nav(`/doctors/${doc._id}`)} disabled={!doc.schedule?.length}>
                {t("doctors.take")}
              </button>
            </div>
          ))
        }
      </QueryState>
    </section>
  );
}

export function DoctorBook() {
  const { id } = useParams();
  const { t } = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const avail = useQuery({ queryKey: ["availability", id], queryFn: () => get(`/doctors/${id}/availability`) });
  const family = useQuery({ queryKey: ["family"], queryFn: () => get("/me/family") });
  const [date, setDate] = useState("");
  const [who, setWho] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [appt, setAppt] = useState(null);

  async function submit() {
    if (!date) return setErr(t("doctors.pickDay"));
    setBusy(true);
    setErr("");
    try {
      const a = await post("/appointments", { doctorId: id, date, familyMemberId: who || undefined, villageId: user.village._id });
      qc.invalidateQueries({ queryKey: ["myAppointments"] });
      qc.invalidateQueries({ queryKey: ["availability", id] });
      setAppt(a);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (appt)
    return (
      <section className="center">
        <div className="success-icon" aria-hidden="true">✓</div>
        <h1 className="big-title">{t("doctors.done")}</h1>
        <DoctorReceipt appt={appt} />
        <Link className="primary-btn" to="/meri-booking?tab=doctor">
          {t("booked.mine")}
        </Link>
        <Link className="secondary-btn" to="/home">
          {t("common.home")}
        </Link>
      </section>
    );

  return (
    <section>
      <Back to="/doctors" />
      <QueryState query={avail}>
        {(d) => (
          <>
            <h1 className="big-title">{d.doctor.name}</h1>
            <p className="muted">
              {specialtyName(d.doctor)} · {t("doctors.fee")} {rs(d.doctor.fee)}
            </p>
            <div className="field">
              <span className="field-label">{t("details.who")}</span>
              <div className="pill-row" role="radiogroup">
                <button role="radio" aria-checked={!who} className={`pill ${!who ? "on" : ""}`} onClick={() => setWho("")}>
                  {t("common.self")}
                </button>
                {family.data?.data.map((m) => (
                  <button role="radio" aria-checked={who === m._id} key={m._id} className={`pill ${who === m._id ? "on" : ""}`} onClick={() => setWho(m._id)}>
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field-label">{t("doctors.pickDay")}</span>
              {d.data.length === 0 ? (
                <p className="muted">{t("doctors.noDays")}</p>
              ) : (
                <div className="date-grid" role="radiogroup">
                  {d.data.map((s) => (
                    <button
                      key={s.date}
                      role="radio"
                      aria-checked={date === s.date}
                      disabled={s.tokensLeft === 0}
                      className={`date-btn ${date === s.date ? "on" : ""}`}
                      onClick={() => setDate(s.date)}
                    >
                      <strong>{dayLabel(s.date, t)}</strong>
                      <span>
                        {time12(s.start)}–{time12(s.end)}
                      </span>
                      <span className="small">{s.tokensLeft ? t("doctors.left", { n: s.tokensLeft }) : t("doctors.full")}</span>
                    </button>
                  ))}
                </div>
              )}
              <span className="field-hint">{t("doctors.onlyDays")}</span>
            </div>
            <ErrorMsg msg={err} />
            <button className="primary-btn" disabled={busy || !date} onClick={submit}>
              {busy ? t("doctors.taking") : t("doctors.confirm")}
            </button>
            <p className="muted small">{t("doctors.payAtClinic")}</p>
          </>
        )}
      </QueryState>
    </section>
  );
}
