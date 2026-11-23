import { useState } from "react";
import { Icon } from "../../components/Icons.jsx";
import { DoctorReceipt } from "../../components/Receipt.jsx";
import { EtaBanner } from "../../components/EtaBanner.jsx";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post, errorMessage } from "../../api/client.js";
import { useT } from "../../i18n/I18nContext.jsx";
import { Back, Badge, ErrorMsg, Pager, QueryState, Steps, Tabs } from "../../components/ui.jsx";
import { rs, prettyDate, slotLabel } from "../../utils.js";

export default function MyBookings() {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "doctor" ? "doctor" : "tests";
  return (
    <section>
      <Back to="/home" />
      <h1 className="big-title">{t("mine.title")}</h1>
      <Tabs
        tabs={[
          { key: "tests", label: t("mine.tabTests") },
          { key: "doctor", label: t("mine.tabDoctor") },
        ]}
        value={tab}
        onChange={(k) => setParams(k === "doctor" ? { tab: "doctor" } : {})}
      />
      {tab === "tests" ? <TestBookings /> : <Appointments />}
    </section>
  );
}

function TestBookings() {
  const { t } = useT();
  const [page, setPage] = useState(1);
  // Refresh every 30s so status changes from the lab show up without reloading
  const q = useQuery({ queryKey: ["myBookings", page], queryFn: () => get("/me/bookings", { page, limit: 10 }), refetchInterval: 30_000 });
  return (
    <QueryState query={q} empty={t("mine.noTests")} emptyIcon="🩸">
      {(d) => (
        <>
          {d.data.map((b) => (
            <BookingCard key={b._id} b={b} />
          ))}
          <Pager meta={d.meta} onPage={setPage} />
        </>
      )}
    </QueryState>
  );
}

function BookingCard({ b }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      await post(`/bookings/${b._id}/cancel`, {});
      qc.invalidateQueries({ queryKey: ["myBookings"] });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  }

  // Signed URL is fetched on demand and expires in 10 minutes.
  async function openReport() {
    setBusy(true);
    setErr("");
    try {
      const r = await get(`/bookings/${b._id}/report`);
      setReport(r);
      if (r.mime === "application/pdf") window.open(r.url, "_blank", "noopener");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" data-testid="booking-card">
      <div className="row-between">
        <h3>{b.items.map((i) => i.name).join(", ")}</h3>
      </div>
      <p className="muted">
        {b.code} · {b.lab?.name} · {prettyDate(b.date)}
      </p>
      {b.familyMember && <p className="muted small">{t("mine.for", { name: b.familyMember.name })}</p>}
      {b.source === "doctor" && b.referredBy && <div className="chip ref">{t("mine.referred", { doctor: b.referredBy.name })}</div>}
      {b.collectionPoint === "clinic" && (
        <p className="meta small">
          <Icon name="building" size={16} /> {t("mine.atClinic", { clinic: b.clinic?.name || "" })}
        </p>
      )}
      <Steps status={b.status} />
      <EtaBanner b={b} />
      {b.otp && (
        <div className="otp-card">
          <div>
            <span className="otp-label">{t("booked.otp")}</span>
            <strong className="otp-digits" data-testid="mine-otp">
              {b.otp}
            </strong>
          </div>
          <p className="small">
            {b.status === "confirmed" && b.collectionTime && (
              <>
                {t("mine.collector", { time: slotLabel(b.collectionTime) })}
                <br />
              </>
            )}
            {b.collectionPoint === "clinic" ? t("mine.otpClinicHint") : t("booked.otpHint")}
          </p>
        </div>
      )}
      {b.otpLocked && <p className="error">{t("mine.locked")}</p>}
      <div className="row-between wrap">
        <strong>{rs(b.total)}</strong>
        <div className="btn-row">
          {b.status === "report_ready" && (
            <button className="primary-btn small" disabled={busy} onClick={openReport}>
              {t("mine.report")}
            </button>
          )}
          {["requested", "confirmed"].includes(b.status) &&
            (confirmCancel ? (
              <>
                <span className="small">{t("mine.cancelSure")}</span>
                <button className="secondary-btn small danger" disabled={busy} onClick={cancel}>
                  {t("mine.cancel")} ✓
                </button>
                <button className="link-btn" onClick={() => setConfirmCancel(false)}>
                  {t("common.cancel")}
                </button>
              </>
            ) : (
              <button className="secondary-btn small" onClick={() => setConfirmCancel(true)}>
                {t("mine.cancel")}
              </button>
            ))}
        </div>
      </div>
      {report && (
        <div className="report-view">
          {report.mime.startsWith("image/") ? (
            <img className="report-img" src={report.url} alt={t("mine.reportAlt", { name: report.name })} />
          ) : (
            <a className="secondary-btn small" href={report.url} target="_blank" rel="noopener noreferrer" data-testid="report-link">
              📄 {report.name}
            </a>
          )}
        </div>
      )}
      <ErrorMsg msg={err} />
    </div>
  );
}

function Appointments() {
  const { t } = useT();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);
  const q = useQuery({ queryKey: ["myAppointments", page], queryFn: () => get("/me/appointments", { page, limit: 10, sort: "-date" }) });
  async function cancel(id) {
    try {
      await post(`/appointments/${id}/cancel`, {});
      qc.invalidateQueries({ queryKey: ["myAppointments"] });
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  return (
    <>
      <ErrorMsg msg={err} />
      <QueryState query={q} empty={t("mine.noAppts")} emptyIcon="🩺">
        {(d) => (
          <>
            {d.data.map((a) => (
              <div key={a._id} className="card">
                <div className="row-between">
                  <h3>{a.doctor?.name}</h3>
                  <Badge status={a.status} />
                </div>
                <p className="muted">
                  {prettyDate(a.date)} · <strong>{t("mine.token", { n: a.token })}</strong>
                </p>
                {a.familyMember && <p className="muted small">{t("mine.for", { name: a.familyMember.name })}</p>}
                <p className="meta small"><Icon name="building" size={16} /> {[a.doctor?.clinicName, a.doctor?.clinicAddress].filter(Boolean).join(", ")}</p>
                {a.referredBooking && (
                  <p className="info">
                    {t("mine.referredTests", { tests: a.referredBooking.items.map((i) => i.name).join(", ") })} → {a.referredBooking.lab?.name}{" "}
                    <Badge status={a.referredBooking.status} />
                  </p>
                )}
                <div className="btn-row">
                  <button className="primary-btn small" onClick={() => setOpen(open === a._id ? null : a._id)}>
                    {open === a._id ? t("receipt.hide") : t("receipt.show")}
                  </button>
                  {a.status === "booked" && (
                    <button className="secondary-btn small" onClick={() => cancel(a._id)}>
                      {t("mine.cancel")}
                    </button>
                  )}
                </div>
                {open === a._id && <DoctorReceipt appt={a} />}
              </div>
            ))}
            <Pager meta={d.meta} onPage={setPage} />
          </>
        )}
      </QueryState>
    </>
  );
}
