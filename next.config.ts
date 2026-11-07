import type { NextConfig } from "next";
import { DOMINI_IMMAGINI_REMOTE, HOST_IMMAGINI_REMOTE } from "./lib/immagini-remote";

const nextConfig: NextConfig = {
  // Permette al dev server di servire risorse a richieste originate da
  // 127.0.0.1 (necessario per i test E2E con browser in sviluppo).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
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
