import type { NextConfig } from "next";

// L'ottimizzatore di Next rifiuta con INVALID_IMAGE_OPTIMIZE_REQUEST le URL
// remote se l'host non è dichiarato esattamente: ricaviamo l'host del progetto
// Supabase dall'ambiente, senza scriverlo nel codice.
const HOST_SUPABASE = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname || null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  // Permette al dev server di servire risorse a richieste originate da
  // 127.0.0.1 (necessario per i test E2E con browser in sviluppo).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      ...(HOST_SUPABASE
        ? [{ protocol: "https" as const, hostname: HOST_SUPABASE }]
        : []),
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
