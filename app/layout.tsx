import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AssistantFab from "../components/assistant/AssistantFab";
import AssistantPanel from "../components/assistant/AssistantPanel";
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

export const metadata: Metadata = {
  title: "InCittà | Amazon della tua città",
  description:
    "Trova negozi, prodotti e servizi della tua città. Cerca, confronta e acquista localmente.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50">
        {children}

        <footer className="border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-400">
          © 2026 InCittà · Castrovillari
        </footer>

        <AssistantFab />
        <AssistantPanel />
      </body>
    </html>
  );
}
