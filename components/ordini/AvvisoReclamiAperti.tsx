import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

/**
 * AVVISO RECLAMI APERTI — banner rosso professionale dell'area venditore
 * quando ci sono reclami ATTIVI (aperto/in gestione): "N reclami aperti da
 * gestire". Compatto, cliccabile e non invasivo quando il conteggio è zero
 * (in quel caso non viene renderizzato). Stesso linguaggio visivo di
 * AvvisoNuoviOrdini.
 */
export function AvvisoReclamiAperti({
  conteggio,
  href,
}: {
  conteggio: number;
  href: string;
}) {
  if (!conteggio || conteggio <= 0) return null;

  return (
    <Link
      href={href}
      className="group flex items-center gap-4 overflow-hidden rounded-[1.75rem] border border-red-200 bg-white p-5 shadow-sm transition hover:border-red-300 hover:shadow-md"
    >
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-white shadow-md shadow-red-600/25">
        <AlertTriangle className="h-6 w-6" aria-hidden />
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-black text-white ring-2 ring-white">
          {conteggio > 9 ? "9+" : conteggio}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black uppercase tracking-tight text-red-900">
          {conteggio} reclamo{conteggio === 1 ? "" : "i"} aperto
          {conteggio === 1 ? "" : "i"} da gestire
        </p>
        <p className="mt-0.5 text-xs text-red-700">
          Un cliente ha segnalato un problema su un ordine: aprilo per
          prenderlo in carico.
        </p>
      </div>
      <span className="hidden shrink-0 items-center gap-1.5 rounded-xl bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 ring-1 ring-red-200 transition group-hover:bg-red-100 sm:inline-flex">
        Gestisci
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </span>
      <ArrowRight
        className="h-5 w-5 shrink-0 text-red-300 transition group-hover:translate-x-0.5 group-hover:text-red-500 sm:hidden"
        aria-hidden
      />
    </Link>
  );
}
