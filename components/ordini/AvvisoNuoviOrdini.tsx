import Link from "next/link";
import { ArrowRight, BellRing } from "lucide-react";

/**
 * AVVISO NUOVI ORDINI — banner rosso dell'area venditore quando ci sono
 * ordini NON LETTI (letto_at null): "🔴 Hai N nuovi ordini da gestire".
 * Il conteggio usa il sistema letto_at già esistente (nessun sistema nuovo).
 */
export function AvvisoNuoviOrdini({
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
      className="group flex items-center gap-3.5 rounded-[1.75rem] border border-red-200 bg-red-50 p-5 shadow-sm transition hover:border-red-300 hover:bg-red-100/70"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm">
        <BellRing className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black uppercase tracking-tight text-red-900">
          Hai {conteggio} nuovo{conteggio === 1 ? "" : "i"} ordine
          {conteggio === 1 ? "" : "i"} da gestire
        </p>
        <p className="mt-0.5 text-xs text-red-700">
          Apri il dettaglio per confermare o annullare l&apos;ordine.
        </p>
      </div>
      <ArrowRight
        className="h-5 w-5 shrink-0 text-red-400 transition group-hover:translate-x-0.5 group-hover:text-red-600"
        aria-hidden
      />
    </Link>
  );
}
