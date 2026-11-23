import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { http, post, patch, refreshSession, setAccessToken, setOnSessionLost } from "../api/client.js";
import { getLang, setOnLangChange, useT } from "../i18n/I18nContext.jsx";

const AuthCtx = createContext(null);

export const HOME_FOR = {
  patient: "/home",
  lab_staff: "/lab",
  doctor: "/doctor",
  agent: "/agent",
  super_admin: "/admin",
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();
  const { setLang } = useT();
  const userRef = useRef(null);
  userRef.current = user;

  // Switching language while logged in saves it to the profile (any role), so the next login
  // and the user's emails use it too. Best effort: offline switching still works locally.
  useEffect(() => {
    setOnLangChange((lang) => {
      if (userRef.current && userRef.current.lang !== lang) {
        userRef.current = { ...userRef.current, lang };
        setUser((u) => (u ? { ...u, lang } : u));
        patch("/auth/me/lang", { lang }).catch(() => {});
      }
    });
    return () => setOnLangChange(() => {});
  }, []);

  // Restore the session from the refresh cookie on page load.
  useEffect(() => {
    refreshSession()
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
    setOnSessionLost(() => setUser(null));
  }, []);

  const startSession = useCallback((data) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      setUser,
      // allowRoles: for role-specific login pages. A wrong-role login is undone before it ever
      // becomes the app's session, so the page can show the error instead of redirecting.
      login: async (identifier, password, allowRoles) => {
        const data = await post("/auth/login", { identifier, password });
        if (allowRoles && !allowRoles.includes(data.user.role)) {
          setAccessToken(data.accessToken);
          await post("/auth/logout", {}).catch(() => {});
          setAccessToken(null);
          const err = new Error("WRONG_PORTAL");
          err.role = data.user.role;
          throw err;
        }
        // After an explicit login: use the language the user saved earlier; if they never chose one,
        // keep what is on screen now and save it to their profile (so emails match too).
        if (data.user.langChosen && data.user.lang) setLang(data.user.lang, { save: false });
        else {
          data.user = { ...data.user, lang: getLang(), langChosen: true };
          setAccessToken(data.accessToken);
          await patch("/auth/me/lang", { lang: getLang() }).catch(() => {});
        }
        return startSession(data);
      },
      signup: async (body) => startSession(await post("/auth/signup", body)),
      changePassword: async (currentPassword, newPassword) => startSession(await post("/auth/change-password", { currentPassword, newPassword })),
      reloadMe: async () => setUser((await http.get("/auth/me")).data.user),
      logout: async () => {
        try {
          await post("/auth/logout", {});
        } finally {
          setAccessToken(null);
          setUser(null);
          qc.clear();
        }
      },
    }),
    [user, ready, startSession, qc, setLang]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
