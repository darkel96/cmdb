import { useState, type ReactNode } from "react";

/**
 * Firmenlogo und Bilder liefert der Dienst aus einem lokalen Ordner (/branding/…), nicht aus dem öffentlichen
 * Repository. Auf der Pages-Testseite gibt es keinen Dienst, dort bleibt es neutral.
 */
export const BRANDING = import.meta.env.VITE_ROUTER !== "hash";

export const brandingUrl = (name: "logo.png" | "logo-weiss.png" | "anmeldung.jpg" | "favicon.ico") => `/branding/${name}`;

/** Logo, wenn vorhanden; sonst fallback (z. B. Symbol und Schriftzug) */
export function BrandLogo({ variant, className, fallback }: { variant: "dunkel" | "weiss"; className?: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(!BRANDING);
  if (failed) return <>{fallback}</>;
  return <img src={brandingUrl(variant === "weiss" ? "logo-weiss.png" : "logo.png")} alt="Logo" className={className} onError={() => setFailed(true)} draggable={false} />;
}

/** Favicon aus dem Branding-Ordner setzen, falls vorhanden (sonst bleibt das neutrale Symbol aus index.html) */
export function applyFavicon(): void {
  if (!BRANDING) return;
  const url = brandingUrl("favicon.ico");
  fetch(url, { method: "HEAD" })
    .then((r) => {
      if (!r.ok) return;
      const link = document.querySelector<HTMLLinkElement>("link[rel='icon']") ?? document.head.appendChild(Object.assign(document.createElement("link"), { rel: "icon" }));
      link.type = "image/x-icon";
      link.href = url;
    })
    .catch(() => undefined);
}
