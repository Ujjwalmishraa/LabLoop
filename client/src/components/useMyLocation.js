import { useCallback, useState } from "react";

// Browser geolocation, only after the user taps a button. Errors are i18n keys.
export function useMyLocation() {
  const [position, setPosition] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locate = useCallback(() => {
    if (!navigator.geolocation) return setError("loc.unsupported");
    setBusy(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6, accuracy: Math.round(p.coords.accuracy) });
        setBusy(false);
      },
      (e) => {
        setError(e.code === 1 ? "loc.denied" : "loc.failed");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }, []);
  return { position, busy, error, locate, clear: () => setPosition(null) };
}
