import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Footer from "../components/Footer/Footer";
import AssistantFab from "../components/assistant/AssistantFab";
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
  title: "LocalHub | Il portale delle attività locali",
  description:
    "Scopri negozi, ristoranti, professionisti, offerte e servizi della tua città.",
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
      <body className="min-h-full flex flex-col bg-[#eaeded]">
        {children}
        <Footer />
        <AssistantFab />
      </body>
    </html>
  );
}
