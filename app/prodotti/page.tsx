import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header/Header";
import IntestazionePagina from "@/components/editoriale/IntestazionePagina";
import { getSiteUrl } from "@/lib/site";
import { ArrowLeft, ScanLine, ShoppingBasket } from "lucide-react";

// Pagina TerraQ — riconoscimento e verifica dei prodotti.
//
// La vecchia pagina Prodotti è stata liberata: il catalogo (stesse query,
// stesse schede, stessi prezzi e funzioni di acquisto) vive ora in
// /filiere/prodotti. Qui resta solo la struttura della pagina, pronta per il
// servizio TerraQ: nessuna tabella Supabase, nessun record, nessuna immagine,
// nessun componente o API del catalogo è stato rimosso.
export const metadata: Metadata = {
  title: "TerraQ",
  description:
    "TerraQ è il servizio di Radici Calabria per riconoscere e verificare i prodotti delle filiere. Questa pagina è predisposta per ospitare il servizio.",
  alternates: { canonical: `${getSiteUrl()}/prodotti` },
};

export default function TerraQPage() {
  return (
    <main className="rd-pagina min-h-screen">
      <Header />

      <IntestazionePagina
        occhiello="Riconoscimento e verifica dei prodotti"
        titolo="TerraQ"
        icona={ScanLine}
        sommario="TerraQ è il servizio di Radici Calabria per riconoscere e verificare i prodotti. Questa pagina è pronta per ospitarlo."
        azione={
          <Link href="/filiere/prodotti" className="rd-azione">
            <ShoppingBasket className="h-4 w-4" aria-hidden />
            Scopri i prodotti della filiera
          </Link>
        }
      />

      <div className="rd-guscio py-7 md:py-10">
        <div className="rd-fascia p-5 md:p-8">
          <h2 className="rd-titolo-scheda text-lg">Servizio in arrivo</h2>
          <p className="mt-2 text-sm leading-7 text-[#57534e] md:text-base">
            Nel frattempo il catalogo dei prodotti resta disponibile nella sezione Filiere, con
            categorie, schede prodotto, prezzi, disponibilità e acquisto.
          </p>
          <Link href="/filiere" className="rd-azione-tenue mt-5">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Filiere
          </Link>
        </div>
      </div>
    </main>
  );
}
