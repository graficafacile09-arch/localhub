import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AssistantPanel from "../components/assistant/AssistantPanel";
import { CartProvider } from "@/lib/carrello/CartContext";
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
  const ogImageUrl = `${SITE_URL}/hero-via-roma-castrovillari-1400x1050.jpg`;

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
      images: [
        {
          url: ogImageUrl,
          width: 1400,
          height: 1050,
          alt: `Via Roma a Castrovillari — ${nome}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      images: [ogImageUrl],
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
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-yellow-400 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-blue-900 focus:shadow-lg"
        >
          Salta al contenuto
        </a>
        <CartProvider>
          <div id="main" tabIndex={-1} className="flex w-full flex-1 flex-col outline-none">
            {children}
          </div>
        </CartProvider>

        <footer className="border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-600">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4">
            <span>{footerText}</span>
            <span aria-hidden="true">·</span>
            <a
              href="/privacy"
              className="font-semibold text-slate-700 underline-offset-2 transition hover:text-blue-600 hover:underline"
            >
              Privacy
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="/termini"
              className="font-semibold text-slate-700 underline-offset-2 transition hover:text-blue-600 hover:underline"
            >
              Termini e condizioni
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="/venditori"
              className="font-semibold text-slate-700 underline-offset-2 transition hover:text-blue-600 hover:underline"
            >
              Termini per i Venditori
            </a>
          </div>
        </footer>

        {/* AssistantPanel risponde SOLO all'evento esplicito "assistant:open"
            (pulsanti dedicati, es. homepage). Nessun pulsante flottante
            globale: le bottom navigation mobile restano completamente libere. */}
        <AssistantPanel />
      </body>
    </html>
  );
}
