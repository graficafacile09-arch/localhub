import Image from "next/image";
import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import {
  formattaDataNotizia,
  type NotiziaPubblica,
} from "@/lib/notizie-pubbliche";
import { ETICHETTE_TIPO, formattaPeriodoEvento } from "@/lib/notizie/editoriale";
import type { TipoContenuto } from "@/lib/notizie/types";

/**
 * Scheda di un contenuto della sezione Notizie.
 *
 * Mantiene il formato editoriale esistente (card arrotondata, fonte con
 * emblema Radici, pulsante giallo verso la fonte) e aggiunge solo due
 * informazioni discrete: l'etichetta di tipologia e, per eventi e fiere,
 * il periodo e il luogo quando sono dichiarati nell'articolo.
 */

const STILE_TIPO: Record<TipoContenuto, string> = {
  notizia: "bg-[#f1ece1] text-[#5b5348]",
  evento: "bg-emerald-50 text-emerald-800",
  fiera: "bg-amber-50 text-amber-800",
  bollettino: "bg-sky-50 text-sky-800",
  opportunita: "bg-stone-100 text-stone-700",
};

export default function SchedaNotizia({ notizia }: { notizia: NotiziaPubblica }) {
  const data = formattaDataNotizia(notizia.publishedAt);
  const periodo = notizia.eventoDataInizio
    ? formattaPeriodoEvento(
        notizia.eventoDataInizio,
        notizia.eventoDataFine
      )
    : "";

  return (
    <article className="rd-scheda p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${STILE_TIPO[notizia.tipo]}`}
        >
          {ETICHETTE_TIPO[notizia.tipo]}
        </span>
        {notizia.category && (
          <span className="rounded-full bg-[#f1ece1] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#5b5348]">
            {notizia.category}
          </span>
        )}
        {data && <span className="text-[11px] text-[#8a8378]">{data}</span>}
      </div>

      <h2 className="rd-titolo-scheda mt-3 md:text-[1.3rem] md:leading-7">
        {notizia.title}
      </h2>

      {(periodo || notizia.eventoLuogo) && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-[#8a5a3b] md:text-xs">
          {periodo && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              {periodo}
            </span>
          )}
          {notizia.eventoLuogo && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {notizia.eventoLuogo}
            </span>
          )}
        </p>
      )}

      {notizia.excerpt && (
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#57534e] md:text-[0.95rem] md:leading-7">
          {notizia.excerpt}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <span className="flex min-w-0 items-center gap-1.5">
          {/* Marchio Radici Calabria accanto alla fonte: emblema ritagliato
              dal logo, nessun segno ridisegnato. */}
          <Image
            src="/notizie/logo-radici-emblema.png"
            alt=""
            width={26}
            height={26}
            aria-hidden
            className="h-[18px] w-[18px] shrink-0 object-contain md:h-5 md:w-5"
          />
          <span className="min-w-0 truncate text-[11px] font-semibold text-[#8a8378] md:text-xs">
            {notizia.sourceName}
          </span>
        </span>
        <a
          href={notizia.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rd-azione shrink-0 px-3.5 py-2 text-[11px] md:px-4 md:py-2.5 md:text-xs"
        >
          Leggi la fonte
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </article>
  );
}
