import { Icon, Logo } from "./Icons.jsx";
import { useT } from "../i18n/I18nContext.jsx";
import { rs, prettyDate, time12, weekday, specialtyName } from "../utils.js";

// Doctor token receipt. The patient shows it at the clinic; the doctor types the 4-digit
// visit code to mark the visit done (like the lab collection OTP).
export function DoctorReceipt({ appt, onPrint = true }) {
  const { t } = useT();
  const d = appt.doctor || {};
  const slot = (d.schedule || []).find((s) => s.day === weekday(appt.date));
  const who = appt.familyMember?.name || appt.patientName;
  return (
    <div className="receipt" data-testid="receipt">
      <div className="receipt-head">
        <Logo size={34} />
        <div>
          <strong>LabLoop</strong>
          <div className="small muted">{t("receipt.title")}</div>
        </div>
        <span className="receipt-no">{appt.code}</span>
      </div>
      <div className="receipt-token">
        <span>{t("doctors.yourToken")}</span>
        <strong data-testid="token">{appt.token}</strong>
      </div>
      <dl className="receipt-rows">
        <dt>{t("receipt.patient")}</dt>
        <dd>{who}</dd>
        <dt>{t("receipt.doctor")}</dt>
        <dd>
          {d.name}
          {specialtyName(d) ? <div className="small muted">{specialtyName(d)}</div> : null}
        </dd>
        <dt>{t("receipt.clinic")}</dt>
        <dd>{[d.clinicName, d.clinicAddress].filter(Boolean).join(", ") || "—"}</dd>
        <dt>{t("receipt.when")}</dt>
        <dd>
          {prettyDate(appt.date)}
          {slot ? `, ${time12(slot.start)}–${time12(slot.end)}` : ""}
        </dd>
        <dt>{t("doctors.fee")}</dt>
        <dd>{rs(d.fee)} <span className="small muted">({t("receipt.payAtClinic")})</span></dd>
      </dl>
      {appt.visitCode ? (
        <div className="receipt-code">
          <span>{t("receipt.code")}</span>
          <strong data-testid="visit-code">{appt.visitCode}</strong>
          <small>{t("receipt.codeHint")}</small>
        </div>
      ) : (
        <div className="receipt-done">
          <Icon name="checkCircle" size={20} /> {t(`status.${appt.status}`)}
        </div>
      )}
      {onPrint && appt.visitCode && (
        <button className="secondary-btn small no-print" onClick={() => window.print()}>
          <Icon name="file" size={18} /> {t("receipt.print")}
        </button>
      )}
    </div>
  );
}
