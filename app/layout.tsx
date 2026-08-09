import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AssistantFab from "../components/assistant/AssistantFab";
import AssistantPanel from "../components/assistant/AssistantPanel";
import { getImpostazioniPubbliche } from "@/lib/platform/settings";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const SITE_URL = getSiteUrl();

// Valori di fallback = quelli usati prima dell'introduzione delle impostazioni
// piattaforma: il sito resta identico anche senza DB o con righe vuote.
const DEFAULTS = {
  site_name: "InCittà",
  site_tagline: "Amazon della tua città",
  footer_text: "© 2026 InCittà · Castrovillari",
};

export async function generateMetadata(): Promise<Metadata> {
  const impostazioni = await getImpostazioniPubbliche();
  const nome = impostazioni.site_name?.trim() || DEFAULTS.site_name;
  const tagline = impostazioni.site_tagline?.trim() || DEFAULTS.site_tagline;

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${nome} | ${tagline}`,
      template: `%s | ${nome}`,
    },
    description:
      "Trova negozi, prodotti e servizi della tua città. Cerca, confronta e acquista localmente.",
    openGraph: {
      siteName: nome,
      locale: "it_IT",
      type: "website",
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const impostazioni = await getImpostazioniPubbliche();
  const footerText = impostazioni.footer_text?.trim() || DEFAULTS.footer_text;

  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50">
        {children}

        <footer className="border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-400">
          {footerText}
        </footer>

        <AssistantFab />
        <AssistantPanel />
      </body>
    </html>
  );
}
