import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Newspaper,
} from "lucide-react";
import type { EsitoArchivioNotizie } from "@/lib/notizie-pubbliche";
import { formattaPeriodoEvento } from "@/lib/notizie/editoriale";
import { isCategoriaNotizia } from "@/lib/notizie/filtro";
import type { CategoriaNotizia } from "@/lib/notizie/types";
import SchedaNotizia from "./SchedaNotizia";

/**
 * Archivio della sezione Notizie: elenco dei contenuti, prossimi appuntamenti
 * e paginazione. La prima pagina mostra i contenuti più recenti e l'elenco
 * parte subito sotto le categorie: il riquadro degli eventi futuri sta DOPO
 * le schede, così le notizie non finiscono in fondo alla pagina.
 */

function linkPagina(categoria: CategoriaNotizia | null, pagina: number): string {
  const params = new URLSearchParams();
  if (categoria) params.set("categoria", categoria);
  if (pagina > 1) params.set("pagina", String(pagina));
  const qs = params.toString();
  return qs ? `/notizie?${qs}` : "/notizie";
}

const CLASSE_PULSANTE = "rd-azione-tenue px-3.5 py-2 text-[11px] md:px-4 md:text-xs";
const CLASSE_PULSANTE_DISATTIVO =
  "inline-flex items-center gap-1 rounded-xl border border-[#ece6da] bg-white/50 px-3.5 py-2 text-[11px] font-bold text-[#b9b1a3] md:px-4 md:text-xs";

export default function ArchivioNotizie({
  esito,
  categoria,
}: {
  esito: EsitoArchivioNotizie;
  categoria: CategoriaNotizia | null;
}) {
  const categoriaValida = isCategoriaNotizia(categoria) ? categoria : null;

  return (
    <>
      {esito.notizie.length === 0 ? (
        <div className="rd-fascia mt-8 flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f4efe4] ring-1 ring-[#e5ded0]">
            <Newspaper className="h-8 w-8 text-[#8a5a3b]" aria-hidden />
          </div>
          <h2 className="rd-titolo-scheda mt-4 text-lg">
            Nessun contenuto in questa categoria.
          </h2>
          <p className="mt-1 max-w-sm text-sm leading-6 text-[#57534e]">
            L&apos;aggregatore controlla ogni giorno le fonti agricole
            calabresi. Torna presto a trovarci o consulta tutte le notizie.
          </p>
          <Link
            href="/notizie"
            className="rd-azione mt-6"
          >
            Vedi tutte le notizie
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 md:mt-8 md:gap-6">
          {esito.notizie.map((notizia) => (
            <SchedaNotizia key={notizia.id} notizia={notizia} />
          ))}
        </div>
      )}

      {esito.prossimiEventi.length > 0 && (
        <section className="rd-pannello mt-6 p-5 md:mt-8 md:p-6">
          <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8a5a3b]">
            <CalendarDays className="h-4 w-4" aria-hidden />
            Prossimi appuntamenti
          </h2>
          <ul className="mt-3 divide-y divide-[#f1ece1]">
            {esito.prossimiEventi.map((evento) => (
              <li key={`ev-${evento.id}`} className="py-2.5 first:pt-0 last:pb-0">
                <a
                  href={evento.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                >
                  <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-[#8a5a3b] md:text-xs">
                      {evento.eventoDataInizio
                        ? formattaPeriodoEvento(
                            evento.eventoDataInizio,
                            evento.eventoDataFine
                          )
                        : "In programma"}
                    </span>
                    <span className="min-w-0 truncate text-sm font-semibold text-[#1c2b22] group-hover:text-[#24462f] md:text-[15px]">
                      {evento.title}
                    </span>
                  </span>
                  {evento.eventoLuogo && (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-[#8a8378] md:text-xs">
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {evento.eventoLuogo}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {esito.totale > 0 && (
        <div className="mt-8 flex flex-col items-center gap-3">
          {esito.pagine > 1 && (
            <div className="flex items-center gap-2">
              {esito.pagina > 1 ? (
                <Link
                  href={linkPagina(categoriaValida, esito.pagina - 1)}
                  rel="prev"
                  className={CLASSE_PULSANTE}
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  Più recenti
                </Link>
              ) : (
                <span className={CLASSE_PULSANTE_DISATTIVO}>
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  Più recenti
                </span>
              )}
              <span className="px-1 text-[11px] font-semibold text-[#6b6459] md:text-xs">
                {esito.pagina} / {esito.pagine}
              </span>
              {esito.pagina < esito.pagine ? (
                <Link
                  href={linkPagina(categoriaValida, esito.pagina + 1)}
                  rel="next"
                  className={CLASSE_PULSANTE}
                >
                  Precedenti
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              ) : (
                <span className={CLASSE_PULSANTE_DISATTIVO}>
                  Precedenti
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              )}
            </div>
          )}
          <p className="rd-nota md:text-xs">
            {esito.totale} contenuti in archivio
            {categoriaValida ? ` · ${categoriaValida}` : ""}
          </p>
        </div>
      )}
    </>
  );
}
