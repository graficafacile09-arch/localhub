import type { NextConfig } from "next";

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
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
