import axios from "axios";
import { getLang, t } from "../i18n/I18nContext.jsx";

const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

// Access token lives in memory only (never localStorage). The refresh token is an httpOnly cookie.
let accessToken = null;
let onSessionLost = () => {};
export const setAccessToken = (t) => (accessToken = t);
export const setOnSessionLost = (fn) => (onSessionLost = fn);

export const http = axios.create({ baseURL: `${BASE}/api/v1`, withCredentials: true, timeout: 30000 });

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  // Server error messages, emails and labels follow the language picked in the app.
  config.headers["Accept-Language"] = getLang();
  return config;
});

// One refresh at a time; concurrent 401s wait for the same promise.
let refreshing = null;
export function refreshSession() {
  refreshing ??= axios
    .post(`${BASE}/api/v1/auth/refresh`, {}, { withCredentials: true, headers: { "Accept-Language": getLang() } })
    .then((r) => {
      setAccessToken(r.data.accessToken);
      return r.data;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const NO_RETRY = ["/auth/login", "/auth/signup", "/auth/refresh", "/auth/logout"];

http.interceptors.response.use(
  (r) => r,
  async (error) => {
    const cfg = error.config;
    if (error.response?.status === 401 && cfg && !cfg._retried && !NO_RETRY.some((p) => cfg.url?.startsWith(p))) {
      cfg._retried = true;
      try {
        await refreshSession();
        return http(cfg);
      } catch {
        setAccessToken(null);
        onSessionLost();
      }
    }
    return Promise.reject(error);
  }
);

// Server errors are { error: { code, message } }
export function errorMessage(e, fallback) {
  if (e?.response?.data?.error?.message) return e.response.data.error.message;
  if (e?.code === "ECONNABORTED" || e?.message === "Network Error") return t("err.network");
  return fallback || t("err.generic");
}
export const errorCode = (e) => e?.response?.data?.error?.code;

// Thin helpers returning response data
export const get = (url, params) => http.get(url, { params }).then((r) => r.data);
export const post = (url, body) => http.post(url, body).then((r) => r.data);
export const patch = (url, body) => http.patch(url, body).then((r) => r.data);
export const del = (url) => http.delete(url).then((r) => r.data);
export const upload = (url, field, file) => {
  const fd = new FormData();
  fd.append(field, file);
  return http.post(url, fd).then((r) => r.data);
};

// Map server validation details to { field: message } for inline form errors.
export function fieldErrors(e) {
  const details = e?.response?.data?.error?.details;
  if (!Array.isArray(details)) return {};
  const out = {};
  for (const d of details) if (d.path && !out[d.path]) out[d.path] = d.message;
  return out;
}
