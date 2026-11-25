import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Newspaper } from "lucide-react";
import Header from "@/components/Header/Header";
import IntestazionePagina from "@/components/editoriale/IntestazionePagina";
import ArchivioNotizie from "@/components/Notizie/ArchivioNotizie";
import {
  cercaNotiziePubbliche,
  NOTIZIE_PER_PAGINA,
} from "@/lib/notizie-pubbliche";
import { CATEGORIE_NOTIZIE } from "@/lib/notizie/types";
import { isCategoriaNotizia } from "@/lib/notizie/filtro";
import { aggiornaNotizieSeNecessario } from "@/lib/notizie/aggiornamento";
import { getSiteUrl } from "@/lib/site";

// Margine per l'import eseguito in `after()` (nessun effetto sul TTFB).
export const maxDuration = 60;

export const metadata: Metadata = {
  // title senza suffisso "| Radici Calabria": lo aggiunge il template del layout.
  title: "Notizie: agricoltura calabrese",
  description:
    "Notizie, eventi, fiere e bandi su agricoltura, filiere agroalimentari, olio, vino, agrumi e prodotti tipici della Calabria, aggiornati automaticamente da fonti ufficiali e testate specializzate.",
  alternates: {
    canonical: `${getSiteUrl()}/notizie`,
  },
  openGraph: {
    title: "Notizie: agricoltura calabrese",
    description:
      "Notizie, eventi, fiere e bandi su agricoltura, filiere agroalimentari, olio, vino, agrumi e prodotti tipici della Calabria, aggiornati automaticamente da fonti ufficiali e testate specializzate.",
    url: `${getSiteUrl()}/notizie`,
    type: "website",
    siteName: "Radici Calabria",
  },
};

/** Chip dei filtri: forma e colori da `.rd-filtro`, stato attivo da aria-current. */
const CLASSE_CHIP = "rd-filtro md:px-3.5 md:py-1.5 md:text-xs";
/** Numero di contenuti accanto al nome della categoria. */
const CLASSE_CONTEGGIO =
  "ml-1.5 inline-block rounded-full px-1.5 text-[10px] font-bold tabular-nums";

export default async function NotiziePage({
  searchParams,
}: {
  searchParams: Promise<{
    categoria?: string | string[];
    pagina?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const categoriaRaw = Array.isArray(sp.categoria)
    ? sp.categoria[0]
    : sp.categoria;
  const categoria = isCategoriaNotizia(categoriaRaw) ? categoriaRaw : null;
  const paginaRaw = Array.isArray(sp.pagina) ? sp.pagina[0] : sp.pagina;
  const paginaRichiesta = Number.parseInt(paginaRaw ?? "1", 10) || 1;

  const esito = await cercaNotiziePubbliche({
    categoria,
    pagina: paginaRichiesta,
    perPagina: NOTIZIE_PER_PAGINA,
  });

  // Se lo scheduler esterno è fermo, l'import riparte da qui dopo la risposta:
  // la visita successiva trova già i contenuti aggiornati.
  after(aggiornaNotizieSeNecessario);

  return (
    <main className="rd-pagina min-h-screen">
      <Header />

      <IntestazionePagina
        occhiello="Agricoltura calabrese"
        titolo="Notizie"
        icona={Newspaper}
        sommario="Agricoltura e agroalimentare calabrese: notizie, fiere, bandi e bollettini da fonti ufficiali e testate specializzate. Ogni contenuto rimanda alla fonte originale."
      >
        {/* ── Categorie con numero di contenuti ────────────────────────
            Una sola riga con scorrimento orizzontale: i filtri non rubano
            altezza all'elenco, che parte subito sotto. */}
        <div className="relative">
          <nav
            aria-label="Categorie delle notizie"
            className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <Link
              href="/notizie"
              aria-current={categoria === null ? "page" : undefined}
              className={CLASSE_CHIP}
            >
              Tutte
              <span
                className={`${CLASSE_CONTEGGIO} ${categoria === null ? "bg-white/25 text-white" : "bg-[#efe8d8] text-[#6b6459]"}`}
              >
                {esito.totaleArchivio}
              </span>
            </Link>
            {CATEGORIE_NOTIZIE.map((c) => (
              <Link
                key={c}
                href={`/notizie?categoria=${encodeURIComponent(c)}`}
                aria-current={categoria === c ? "page" : undefined}
                className={CLASSE_CHIP}
              >
                {c}
                <span
                  className={`${CLASSE_CONTEGGIO} ${categoria === c ? "bg-white/25 text-white" : "bg-[#efe8d8] text-[#6b6459]"}`}
                >
                  {esito.conteggi[c] ?? 0}
                </span>
              </Link>
            ))}
          </nav>
          {/* Sfumatura: segnala che i chip continuano oltre il bordo. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#f4efe4] to-transparent"
          />
        </div>
      </IntestazionePagina>

      <div className="rd-guscio py-8 md:py-10">
        <ArchivioNotizie esito={esito} categoria={categoria} />
      </div>
    </main>
  );
}
