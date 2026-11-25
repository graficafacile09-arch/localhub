import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import { CartProvider } from "@/lib/carrello/CartContext";
import { getImpostazioniPubbliche } from "@/lib/platform/settings";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";
import AreaTitleSync from "@/components/layout/AreaTitleSync";
import PinoHomepageHelper from "@/components/assistant/PinoHomepageHelper";
import AssistantPanel from "@/components/assistant/AssistantPanel";
import CookieNotice from "@/components/privacy/CookieNotice";
import LanguageProvider from "@/components/i18n/LanguageProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Corsivo editoriale del titolo hero ("che produce"): serif ad alto contrasto.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["italic"],
  display: "swap",
});


export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const SITE_URL = getSiteUrl();

const DEFAULTS = {
  site_name: "Radici Calabria",
  site_tagline: "Filiere, Prodotti e Territori",
  footer_text: "© 2026 Radici Calabria · Castrovillari",
};

export async function generateMetadata(): Promise<Metadata> {
  const impostazioni = await getImpostazioniPubbliche();
  const nome = impostazioni.site_name?.trim() || DEFAULTS.site_name;
  const tagline = impostazioni.site_tagline?.trim() || DEFAULTS.site_tagline;
  // Keep social preview image aligned with homepage hero.
  const ogImageUrl = `${SITE_URL}/hero-coppia-castrovillari.webp`;

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${nome} | ${tagline}`,
      template: `%s | ${nome}`,
    },
    description:
      "Radici Calabria collega produttori, trasformatori, distributori e consumatori: le filiere dei territori arrivano in città.",
    openGraph: {
      siteName: nome,
      locale: "it_IT",
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1400,
          height: 1050,
          alt: `Coppia a Castrovillari — ${nome}`,
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
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LanguageProvider>
        <AreaTitleSync />
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

        <footer data-pino-legal-footer="true" className="border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-600">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4">
            <span>{footerText}</span>
            <span aria-hidden="true">·</span>
            <a href="/privacy" className="font-semibold text-slate-700 underline-offset-2 transition hover:text-blue-600 hover:underline">Privacy Policy</a>
            <span aria-hidden="true">·</span>
            <a href="/termini" className="font-semibold text-slate-700 underline-offset-2 transition hover:text-blue-600 hover:underline">Termini d&apos;Uso</a>
            <span aria-hidden="true">·</span>
            <a href="/venditori" className="font-semibold text-slate-700 underline-offset-2 transition hover:text-blue-600 hover:underline">Produttori e Filiere</a>
            <span aria-hidden="true">·</span>
            <a href="/cookie" className="font-semibold text-slate-700 underline-offset-2 transition hover:text-blue-600 hover:underline">Cookie Policy</a>
            <span aria-hidden="true">·</span>
            <a href="/faq" className="font-semibold text-slate-700 underline-offset-2 transition hover:text-blue-600 hover:underline">FAQ</a>
          </div>
        </footer>

        <Suspense fallback={null}>
          <PinoHomepageHelper />
        </Suspense>
        <Suspense fallback={null}>
          <AssistantPanel />
        </Suspense>
        <CookieNotice />
        </LanguageProvider>
      </body>
    </html>
  );
}
