import type { Metadata } from "next";
import Header from "@/components/Header/Header";
import IntestazionePagina from "@/components/editoriale/IntestazionePagina";
import RadiciScanStudio from "@/components/radiscan/RadiciScanStudio";
import { getSiteUrl } from "@/lib/site";
import { ScanLine } from "lucide-react";

// Pagina RadiciScan — riconoscimento e verifica documentale dei prodotti.
//
// La vecchia pagina Prodotti è stata liberata: il catalogo (stesse query,
// stesse schede, stessi prezzi e funzioni di acquisto) vive in
// /filiere/prodotti. Qui vive RadiciScan, collegato esclusivamente al proprio
// motore in lib/radiscan e alla route /api/radiscan/analisi.
export const metadata: Metadata = {
  title: "RadiciScan",
  description:
    "RadiciScan è il servizio di Radici Calabria per riconoscere i prodotti e verificare la denominazione sulle fonti ufficiali. Carica o scatta una foto dell'etichetta.",
  alternates: { canonical: `${getSiteUrl()}/prodotti` },
};

export default function RadiciScanPage() {
  return (
    <main className="rd-pagina min-h-screen">
      <Header />

      <IntestazionePagina
        occhiello="Riconoscimento e verifica documentale"
        titolo="RadiciScan"
        icona={ScanLine}
        sommario="Scatta o carica una foto dell'etichetta: RadiciScan confronta la denominazione con le fonti ufficiali."
      />

      <div className="rd-guscio py-5 md:py-7">
        <RadiciScanStudio />
      </div>
    </main>
  );
}
