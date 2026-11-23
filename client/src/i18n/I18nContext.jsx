import { createContext, useContext, useEffect, useMemo, useState } from "react";
import hi from "./hi.json";
import en from "./en.json";

// Tiny i18n: flat JSON dictionaries, {{var}} interpolation.
// hi = Hindi (Devanagari, default), en = English. One choice drives the whole app,
// including the Accept-Language header sent to the API (see api/client.js).
const DICTS = { hi, en };
export const LANGS = [
  { code: "hi", label: "हिंदी" },
  { code: "en", label: "English" },
];
const KEY = "nidaansetu_lang";
const Ctx = createContext(null);

function readLang() {
  try {
    const v = localStorage.getItem(KEY);
    // Older builds stored "hd" (Devanagari) or Roman Hindi as "hi"; both are Hindi now.
    if (v === "hd") return "hi";
    return v in DICTS ? v : "hi";
  } catch {
    return "hi";
  }
}

// The current language outside React (formatters, axios). Kept in step by the provider.
let current = readLang();
export const getLang = () => current;
export const locale = () => (current === "en" ? "en-IN" : "hi-IN");

// Translate with the current language. Components should prefer useT(), which re-renders on change;
// App subscribes to the context, so the whole tree re-renders when the language changes.
export function t(key, vars) {
  let s = DICTS[current][key] ?? DICTS.hi[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{{${k}}}`, String(v));
  return s;
}

// Called when the language changes while logged in, to save it to the profile (set by AuthProvider).
let onChange = () => {};
export const setOnLangChange = (fn) => (onChange = fn);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(readLang);
  current = lang;
  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* storage blocked: keep in memory */
    }
  }, [lang]);

  const value = useMemo(() => {
    const setLang = (l, { save = true } = {}) => {
      if (!(l in DICTS)) return;
      current = l;
      setLangState(l);
      if (save) onChange(l);
    };
    return { lang, t: (key, vars) => t(key, vars), setLang };
  }, [lang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx);
