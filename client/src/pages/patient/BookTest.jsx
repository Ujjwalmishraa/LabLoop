import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Icon } from "../../components/Icons.jsx";
import { Logo, BrandName } from "../../components/Logo.jsx";
import { testHint } from "../../testInfo.js";
import { useMyLocation } from "../../components/useMyLocation.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post, errorMessage, fieldErrors } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useT } from "../../i18n/I18nContext.jsx";
import { Back, Field, ErrorMsg, QueryState, Steps } from "../../components/ui.jsx";
import { rs, todayIso, addDays, dayLabel, prettyDate, SLOT_KEYS, slotLabel } from "../../utils.js";

// Steps: lab list -> test picker -> details -> booked
// "1 Lab → 2 Test → 3 Pata aur din" so the patient always knows how far along they are.
function FlowSteps({ at }) {
  const { t } = useT();
  const steps = [t("flow.s1"), t("flow.s2"), t("flow.s3")];
  return (
    <ol className="flow-steps" aria-label={t("flow.label")}>
      {steps.map((label, i) => (
        <li key={label} className={i < at ? "done" : i === at ? "now" : ""} aria-current={i === at ? "step" : undefined}>
          <span className="fs-dot">{i < at ? "✓" : i + 1}</span>
          <span className="fs-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

export default function BookTest() {
  const [step, setStep] = useState("labs");
  const [lab, setLab] = useState(null);
  const [cart, setCart] = useState([]);
  const [booking, setBooking] = useState(null);

  if (step === "labs")
    return (
      <>
        <FlowSteps at={0} />
        <LabList
        onPick={(l) => {
          setLab(l);
          setCart([]);
          setStep("tests");
        }}
        />
      </>
    );
  if (step === "tests")
    return (
      <>
        <FlowSteps at={1} />
        <TestPick lab={lab} cart={cart} setCart={setCart} onBack={() => setStep("labs")} onNext={() => setStep("details")} />
      </>
    );
  if (step === "details")
    return (
      <>
        <FlowSteps at={2} />
        <Details
        lab={lab}
        cart={cart}
        onBack={() => setStep("tests")}
        onDone={(b) => {
          setBooking(b);
          setStep("done");
        }}
        />
      </>
    );
  return <Booked booking={booking} />;
}

function LabList({ onPick }) {
  const { t } = useT();
  const { user } = useAuth();
  const labs = useQuery({ queryKey: ["labs", user.village._id], queryFn: () => get("/labs", { villageId: user.village._id, limit: 50 }) });
  return (
    <section>
      <Back to="/home" />
      <h1 className="big-title">{t("labs.title")}</h1>
      <p className="muted">{t("labs.sub", { village: user.village.name })}</p>
      <QueryState query={labs} empty={t("labs.none")} emptyIcon="🧪">
        {(d) =>
          d.data.map((l) => (
            <div key={l._id} className="card lab-card">
              <div className="lab-top">
                <span className="lab-badge" aria-hidden="true">
                  <Icon name="flask" size={22} />
                </span>
                <div className="lab-title">
                  <h3>{l.name}</h3>
                  <p className="muted small">{l.address}</p>
                </div>
                <span className="km">{t("common.km", { n: l.distanceKm })}</span>
              </div>
              <ul className="lab-facts">
                <li className="ok">
                  <Icon name="truck" size={16} /> {t("labs.home").replace(/^✓\s*/, "")}
                </li>
                <li>
                  <Icon name="list" size={16} /> {t("labs.tests", { n: l.testCount })}
                </li>
                <li>
                  <Icon name="rupee" size={16} /> {t("labs.freeAbove", { n: l.freeCollectionAbove })}
                </li>
              </ul>
              {l.pathologist?.name && (
                <p className="lab-doc small">
                  <Icon name="user" size={15} /> {l.pathologist.name}
                  {l.pathologist.qualification ? ` (${l.pathologist.qualification})` : ""} · {t("labs.min", { n: l.minOrderValue })}
                </p>
              )}
              <button className="primary-btn" onClick={() => onPick(l)}>
                {t("labs.pick")}
              </button>
            </div>
          ))
        }
      </QueryState>
    </section>
  );
}

function feeFor(lab, total) {
  return total === 0 || total >= lab.freeCollectionAbove ? 0 : lab.collectionFee;
}

function TestPick({ lab, cart, setCart, onBack, onNext }) {
  const { t, lang } = useT();
  const [q, setQ] = useState("");
  const tests = useQuery({ queryKey: ["labTests", lab._id], queryFn: () => get(`/labs/${lab._id}/tests`) });
  const has = (x) => cart.some((c) => c._id === x._id);
  const toggle = (x) => setCart(has(x) ? cart.filter((c) => c._id !== x._id) : [...cart, x]);
  const total = cart.reduce((s, x) => s + x.listingPrice, 0);
  const fee = feeFor(lab, total);
  const belowMin = cart.length > 0 && total < lab.minOrderValue;

  return (
    <section className="with-footer">
      <Back onClick={onBack} />
      <h1 className="big-title">{t("tests.title")}</h1>
      <p className="muted">{lab.name}</p>
      <input className="search" placeholder={t("tests.search")} aria-label={t("tests.search")} value={q} onChange={(e) => setQ(e.target.value)} />
      <QueryState query={tests} empty={t("tests.none")}>
        {(d) => {
          const needle = q.trim().toLowerCase();
          const list = d.data.filter((x) => !needle || `${x.name} ${testHint(x.name, "hi")} ${testHint(x.name, "en")} ${testHint(x.name, "roman")}`.toLowerCase().includes(needle));
          if (!list.length) return <p className="muted">{t("tests.none")}</p>;
          return (
            <div className="test-list">
              {list.map((x) => (
                <button
                  key={x._id}
                  className={`test-item ${has(x) ? "on" : ""}`}
                  onClick={() => toggle(x)}
                  aria-pressed={has(x)}
                  aria-label={`${x.name} ${rs(x.listingPrice)}`}
                  aria-describedby={testHint(x.name, lang) ? `hint-${x._id}` : undefined}
                >
                  <span className="tick" aria-hidden="true">{has(x) ? "✓" : "+"}</span>
                  <span className="t-name">
                    <span className="t-title">
                      {x.name}
                      {x.fastingRequired && <span className="chip small-chip">{t("tests.fasting")}</span>}
                    </span>
                    {testHint(x.name, lang) && (
                      <small id={`hint-${x._id}`} className="t-hint">
                        {testHint(x.name, lang)}
                      </small>
                    )}
                  </span>
                  <span className="t-price">{rs(x.listingPrice)}</span>
                </button>
              ))}
            </div>
          );
        }}
      </QueryState>
      <div className="footer-bar">
        <div>
          <div className="fb-total">{rs(total + fee)}</div>
          <div className="fb-sub">
            {belowMin
              ? t("tests.belowMin", { n: lab.minOrderValue })
              : t("tests.count", { n: cart.length }) + (fee ? t("tests.fee", { fee: rs(fee) }) : total ? t("tests.freeFee") : "")}
          </div>
        </div>
        <button className="primary-btn small" disabled={!cart.length || belowMin} onClick={onNext}>
          {t("common.next")}
        </button>
      </div>
    </section>
  );
}

function Details({ lab, cart, onBack, onDone }) {
  const { t } = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const family = useQuery({ queryKey: ["family"], queryFn: () => get("/me/family") });
  const days = useMemo(() => [1, 2, 3].map((n) => addDays(todayIso(), n)), []);
  const [f, setF] = useState({ familyMemberId: "", address: "", date: days[0], slot: SLOT_KEYS[0], paymentMode: "cash", consent: false });
  const [newMember, setNewMember] = useState(null);
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const total = cart.reduce((s, x) => s + x.listingPrice, 0);
  const fee = feeFor(lab, total);
  const fasting = cart.some((x) => x.fastingRequired);
  const loc = useMyLocation();

  async function addMember() {
    if (!newMember?.name?.trim()) return setErrs({ member: t("err.name") });
    try {
      const m = await post("/me/family", { name: newMember.name, age: newMember.age || undefined, relation: newMember.relation || undefined });
      await qc.invalidateQueries({ queryKey: ["family"] });
      setF({ ...f, familyMemberId: m._id });
      setNewMember(null);
      setErrs({});
    } catch (e) {
      setErrs({ member: errorMessage(e) });
    }
  }

  async function submit() {
    const v = {};
    if (f.address.trim().length < 3) v.address = t("err.address");
    if (!f.consent) v.consent = t("err.consent");
    setErrs(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    setErr("");
    try {
      const b = await post("/bookings", {
        labId: lab._id,
        testIds: cart.map((x) => x._id),
        villageId: user.village._id,
        familyMemberId: f.familyMemberId || undefined,
        address: f.address,
        date: f.date,
        slot: f.slot,
        paymentMode: f.paymentMode,
        consent: true,
        // Only if the patient tapped "Use my current location"; otherwise the village point is used.
        location: loc.position ? { lat: loc.position.lat, lng: loc.position.lng } : undefined,
      });
      qc.invalidateQueries({ queryKey: ["myBookings"] });
      onDone(b);
    } catch (e) {
      setErrs(fieldErrors(e));
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <Back onClick={onBack} />
      <h1 className="big-title">{t("details.title")}</h1>

      <div className="field">
        <span className="field-label">{t("details.who")}</span>
        <div className="pill-row" role="radiogroup">
          <button type="button" role="radio" aria-checked={!f.familyMemberId} className={`pill ${!f.familyMemberId ? "on" : ""}`} onClick={() => setF({ ...f, familyMemberId: "" })}>
            {t("common.self")} ({user.name})
          </button>
          {family.data?.data.map((m) => (
            <button type="button" role="radio" aria-checked={f.familyMemberId === m._id} key={m._id} className={`pill ${f.familyMemberId === m._id ? "on" : ""}`} onClick={() => setF({ ...f, familyMemberId: m._id })}>
              {m.name}
              {m.relation ? ` (${m.relation})` : ""}
            </button>
          ))}
          {!newMember && (
            <button type="button" className="pill" onClick={() => setNewMember({ name: "", age: "", relation: "" })}>
              {t("details.addFamily")}
            </button>
          )}
        </div>
        {newMember && (
          <div className="card inset">
            <div className="three">
              <Field label={t("auth.name")} error={errs.member}>
                <input value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} />
              </Field>
              <Field label={t("profile.age")}>
                <input inputMode="numeric" value={newMember.age} onChange={(e) => setNewMember({ ...newMember, age: e.target.value.replace(/\D/g, "") })} />
              </Field>
              <Field label={t("profile.relation")}>
                <input value={newMember.relation} placeholder={t("profile.relationPh")} onChange={(e) => setNewMember({ ...newMember, relation: e.target.value })} />
              </Field>
            </div>
            <div className="btn-row">
              <button type="button" className="primary-btn small" onClick={addMember}>
                {t("profile.add")}
              </button>
              <button type="button" className="secondary-btn small" onClick={() => setNewMember(null)}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>

      <Field label={t("details.address")} hint={t("details.addressHint", { village: user.village.name })} error={errs.address}>
        <input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder={t("details.addressPh")} autoComplete="street-address" />
      </Field>
      <div className="loc-row">
        {loc.position ? (
          <p className="ok loc-ok" role="status" data-testid="loc-saved">
            <Icon name="pin" size={18} /> {t("loc.saved", { m: loc.position.accuracy })}{" "}
            <button type="button" className="link-btn" onClick={loc.clear}>
              {t("loc.remove")}
            </button>
          </p>
        ) : (
          <button type="button" className="secondary-btn small" onClick={loc.locate} disabled={loc.busy}>
            <Icon name="pin" size={18} /> {loc.busy ? t("route.locating") : t("loc.useMine")}
          </button>
        )}
        <span className="field-hint">{loc.error ? t(loc.error) : t("loc.hint", { village: user.village.name })}</span>
      </div>

      <div className="field">
        <span className="field-label">{t("details.day")}</span>
        <div className="pill-row" role="radiogroup">
          {days.map((d) => (
            <button type="button" role="radio" aria-checked={f.date === d} key={d} className={`pill ${f.date === d ? "on" : ""}`} onClick={() => setF({ ...f, date: d })}>
              {dayLabel(d, t)}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">{t("details.slot")}</span>
        <div className="pill-row" role="radiogroup">
          {SLOT_KEYS.map((s) => (
            <button type="button" role="radio" aria-checked={f.slot === s} key={s} className={`pill ${f.slot === s ? "on" : ""}`} onClick={() => setF({ ...f, slot: s })}>
              {slotLabel(s)}
            </button>
          ))}
        </div>
        {fasting && <span className="field-hint">{t("details.fastingHint")}</span>}
      </div>
      <div className="field">
        <span className="field-label">{t("details.pay")}</span>
        <div className="pill-row" role="radiogroup">
          {["cash", "upi"].map((m) => (
            <button type="button" role="radio" aria-checked={f.paymentMode === m} key={m} className={`pill ${f.paymentMode === m ? "on" : ""}`} onClick={() => setF({ ...f, paymentMode: m })}>
              {t(`details.${m}`)}
            </button>
          ))}
        </div>
        <span className="field-hint">{t("details.payHint")}</span>
      </div>

      <div className="card summary">
        <p className="muted">{lab.name}</p>
        {cart.map((x) => (
          <div key={x._id} className="row-between">
            <span>{x.name}</span>
            <span>{rs(x.listingPrice)}</span>
          </div>
        ))}
        <div className="row-between">
          <span>{t("details.homeFee")}</span>
          <span>{fee ? rs(fee) : t("common.free")}</span>
        </div>
        <div className="row-between total">
          <span>{t("common.total")}</span>
          <span>{rs(total + fee)}</span>
        </div>
      </div>

      <label className={`consent ${errs.consent ? "has-error" : ""}`}>
        <input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
        <span>{t("details.consent")}</span>
      </label>
      {errs.consent && (
        <span className="field-error" role="alert">
          {errs.consent}
        </span>
      )}
      <ErrorMsg msg={err} />
      <button className="primary-btn" disabled={busy} onClick={submit}>
        {busy ? t("details.sending") : t("details.confirm")}
      </button>
    </section>
  );
}

function Booked({ booking }) {
  const { t } = useT();
  return (
    <section className="center">
      <div className="success-icon" aria-hidden="true">✓</div>
      <h1 className="big-title">{t("booked.title")}</h1>
      <div className="ll-receipt" data-testid="booking-receipt">
        <div className="ll-receipt-head">
          <Logo size={36} />
          <BrandName />
          <span className="muted small">{t("receipt.testTitle")}</span>
        </div>
        <div className="ll-receipt-code">
          <span className="muted small">{t("booked.code")}</span>
          <strong data-testid="booking-code">{booking.code}</strong>
        </div>
        <div className="otp-box">
          <div className="muted">{t("booked.otp")}</div>
          <div className="otp" data-testid="booking-otp">
            {booking.otp}
          </div>
          <div className="muted small">{t("booked.otpHint")}</div>
        </div>
        <dl className="ll-receipt-rows">
          <dt>{t("receipt.lab")}</dt>
          <dd>{booking.lab?.name}</dd>
          <dt>{t("receipt.tests")}</dt>
          <dd>{booking.items.map((i) => i.name).join(", ")}</dd>
          <dt>{t("receipt.when")}</dt>
          <dd>
            {prettyDate(booking.date)}, {slotLabel(booking.slot)}
          </dd>
          <dt>{t("common.total")}</dt>
          <dd>
            <strong>{rs(booking.total)}</strong>
          </dd>
        </dl>
      </div>
      <Steps status={booking.status} />
      <Link className="primary-btn" to="/meri-booking">
        <Icon name="file" size={20} /> {t("booked.mine")}
      </Link>
      <Link className="secondary-btn" to="/home">
        <Icon name="home" size={20} /> {t("common.home")}
      </Link>
    </section>
  );
}
