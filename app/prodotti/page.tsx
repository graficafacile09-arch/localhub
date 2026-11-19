import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header/Header";
import IntestazionePagina from "@/components/editoriale/IntestazionePagina";
import RadiciScanStudio from "@/components/radiscan/RadiciScanStudio";
import { getSiteUrl } from "@/lib/site";
import { ScanLine, ShoppingBasket } from "lucide-react";

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
        sommario="Fotografa un prodotto, leggi l'etichetta e confronta la denominazione con il registro delle fonti ufficiali."
        azione={
          <Link href="/filiere/prodotti" className="rd-azione">
            <ShoppingBasket className="h-4 w-4" aria-hidden />
            Scopri i prodotti della filiera
          </Link>
        }
      />

      <div className="rd-guscio py-7 md:py-10">
        <RadiciScanStudio />
      </div>
    </main>
  );
}
