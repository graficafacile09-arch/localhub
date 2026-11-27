import type { Metadata } from "next";
import Header from "@/components/Header/Header";
import IntestazionePagina from "@/components/editoriale/IntestazionePagina";
import RadiciScanStudio from "@/components/radiscan/RadiciScanStudio";
import ComeFunzionaRadiciScan from "@/components/radiscan/ComeFunzionaRadiciScan";
import { getSiteUrl } from "@/lib/site";
import { ScanLine } from "lucide-react";

// Pagina RadiciScan — riconoscimento e verifica documentale dei prodotti.
//
// La vecchia pagina Prodotti è stata liberata: il catalogo (stesse query,
// stesse schede, stessi prezzi e funzioni di acquisto) vive in
// /filiere/prodotti. Qui vive RadiciScan, collegato esclusivamente al proprio
// motore in lib/radiscan e alla route /api/radiscan/analisi.
export const metadata: Metadata = {
  title: "Catalogo Prodotti e Eccellenze",
  description:
    "RadiciScan è il servizio di Radici Calabria per riconoscere i prodotti e verificare la denominazione sulle fonti ufficiali. Carica o scatta una foto dell'etichetta.",
  alternates: { canonical: `${getSiteUrl()}/prodotti` },
};

export default function RadiciScanPage() {
  return (
    <main className="rd-pagina min-h-screen">
      <Header />

      <IntestazionePagina
        compatto
        occhiello="Verifica AI · DOP · IGP · IGT · PAT · BIO"
        titolo="RadiciScan"
        titoloExtra={<ComeFunzionaRadiciScan />}
        icona={ScanLine}
        sommario="Fotografa l'etichetta: l'AI verifica origine calabrese, marchio e filiera."
      />

      <div className="rd-guscio py-4 md:py-6">
        <RadiciScanStudio />
      </div>
    </main>
  );
}
