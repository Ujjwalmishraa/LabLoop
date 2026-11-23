import { createContext, useContext, useEffect, useMemo, useState } from "react";
import hi from "./hi.json";
import en from "./en.json";
import hd from "./hd.json";

// Tiny i18n: flat JSON dictionaries, {{var}} interpolation.
// hi = Hindi in Roman letters (default), hd = Hindi in Devanagari, en = English.
const DICTS = { hi, hd, en };
export const LANGS = [
  { code: "hd", label: "हिंदी" },
  { code: "hi", label: "Hinglish" },
  { code: "en", label: "English" },
];
const KEY = "nidaansetu_lang";
const Ctx = createContext(null);

function readLang() {
  try {
    const v = localStorage.getItem(KEY);
    return v in DICTS ? v : "hi";
  } catch {
    return "hi";
  }
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(readLang);
  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "hi";
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* storage blocked: keep in memory */
    }
  }, [lang]);

  const value = useMemo(() => {
    const t = (key, vars) => {
      let s = DICTS[lang][key] ?? DICTS.hi[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{{${k}}}`, String(v));
      return s;
    };
    return { lang, t, setLang: (l) => l in DICTS && setLang(l) };
  }, [lang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx);
