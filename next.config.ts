import type { NextConfig } from "next";
import { DOMINI_IMMAGINI_REMOTE, HOST_IMMAGINI_REMOTE } from "./lib/immagini-remote";

// Content-Security-Policy: le inline script di Next (bootstrap degli RSC) e
// Stripe.js richiedono 'unsafe-inline'/'unsafe-eval'. Tutto il resto resta
// limitato all'origine del sito; frame-ancestors impedisce il clickjacking.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://*.stripe.com",
  "worker-src 'self' blob:",
  "media-src 'self' blob: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Non esporre la tecnologia usata (header X-Powered-By).
  poweredByHeader: false,
  // Permette al dev server di servire risorse a richieste originate da
  // 127.0.0.1 (necessario per i test E2E con browser in sviluppo).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // Microfono e fotocamera servono al venditore (dettatura e foto
            // prodotto) e restano quindi consentiti alla sola origine del sito.
            value: "camera=(self), microphone=(self), geolocation=(self), payment=(self)",
          },
        ],
      },
    ];
  },
  images: {
    // La stessa lista usata da `puoUsareNextImage`: host dei negozi esterni
    // inclusi, così anche le loro foto passano da resize e cache CDN.
    remotePatterns: [
      ...HOST_IMMAGINI_REMOTE.map((hostname) => ({
        protocol: "https" as const,
        hostname,
      })),
      // Storage Supabase: il sottodominio cambia tra ambienti/progetti.
      ...DOMINI_IMMAGINI_REMOTE.map((dominio) => ({
        protocol: "https" as const,
        hostname: `*.${dominio}`,
      })),
    ],
    // Le immagini prodotto sono salvate con nome UUID: quando un commerciante
    // cambia foto cambia anche l'URL, quindi la variante ottimizzata può
    // restare in cache CDN molto più dei 4 ore di default.
    minimumCacheTTL: 60 * 60 * 24 * 31,
  },
};

export default nextConfig;
