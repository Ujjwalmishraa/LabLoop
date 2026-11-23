import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del, errorMessage, fieldErrors } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useT } from "../../i18n/I18nContext.jsx";
import { Back, ErrorMsg, Field, Ok, QueryState } from "../../components/ui.jsx";

export default function Profile() {
  const { t } = useT();
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email || "");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function save(e) {
    e.preventDefault();
    setMsg("");
    setErr("");
    try {
      setUser((await patch("/me", { name, ...(email ? { email } : {}) })).user);
      setMsg(t("profile.saved"));
    } catch (e2) {
      setErr(errorMessage(e2));
    }
  }

  return (
    <section>
      <Back to="/home" />
      <h1 className="big-title">{t("profile.title")}</h1>
      <form className="card" onSubmit={save}>
        <Field label={t("auth.name")}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("auth.mobile")} hint={t("profile.mobileHint")}>
          <input value={user.phone} disabled />
        </Field>
        <Field label={`${t("auth.email")} ${t("common.optional")}`} hint={t("profile.emailHint")}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <p>
          📍 {user.village?.name}{" "}
          <Link className="link-btn" to="/village">
            {t("village.change")}
          </Link>
        </p>
        <ErrorMsg msg={err} />
        <Ok msg={msg} />
        <div className="btn-row">
          <button className="primary-btn small">{t("common.save")}</button>
          <Link className="secondary-btn small" to="/change-password">
            {t("auth.changeBtn")}
          </Link>
        </div>
      </form>
      <Family />
    </section>
  );
}

const blank = { name: "", age: "", gender: "", relation: "" };

function Family() {
  const { t } = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["family"], queryFn: () => get("/me/family") });
  const [f, setF] = useState(blank);
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["family"] });

  async function add(e) {
    e.preventDefault();
    if (f.name.trim().length < 2) return setErrs({ name: t("err.name") });
    try {
      await post("/me/family", { name: f.name, relation: f.relation || undefined, gender: f.gender || undefined, age: f.age ? Number(f.age) : undefined });
      setF(blank);
      setErrs({});
      setErr("");
      refresh();
    } catch (e2) {
      setErrs(fieldErrors(e2));
      setErr(errorMessage(e2));
    }
  }
  async function remove(id) {
    try {
      await del(`/me/family/${id}`);
      refresh();
    } catch (e2) {
      setErr(errorMessage(e2));
    }
  }

  return (
    <>
      <h2 className="section-title">{t("profile.family")}</h2>
      <QueryState query={q} empty={t("profile.noFamily")} emptyIcon="👨‍👩‍👧">
        {(d) =>
          d.data.map((m) => (
            <div key={m._id} className="card row-between">
              <div>
                <strong>{m.name}</strong>
                <div className="muted small">{[m.relation, m.age != null ? `${m.age} saal` : null, m.gender ? t(`profile.${m.gender}`) : null].filter(Boolean).join(" · ")}</div>
              </div>
              <button className="secondary-btn small" onClick={() => remove(m._id)}>
                {t("profile.remove")}
              </button>
            </div>
          ))
        }
      </QueryState>
      <form className="card" onSubmit={add} noValidate>
        <h3>{t("profile.add")}</h3>
        <div className="two">
          <Field label={t("auth.name")} error={errs.name}>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label={t("profile.relation")}>
            <input value={f.relation} placeholder={t("profile.relationPh")} onChange={(e) => setF({ ...f, relation: e.target.value })} />
          </Field>
        </div>
        <div className="two">
          <Field label={t("profile.age")} error={errs.age}>
            <input inputMode="numeric" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
          </Field>
          <Field label={t("profile.gender")}>
            <select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
              <option value="">—</option>
              <option value="male">{t("profile.male")}</option>
              <option value="female">{t("profile.female")}</option>
              <option value="other">{t("profile.other")}</option>
            </select>
          </Field>
        </div>
        <ErrorMsg msg={err} />
        <button className="primary-btn small">{t("profile.add")}</button>
      </form>
    </>
  );
}
