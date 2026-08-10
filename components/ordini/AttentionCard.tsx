import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

/**
 * ATTENTION CARD — il componente degli AVVISI URGENTI dell'area venditore.
 *
 * Non è un semplice banner/alert: è una vera "card di attenzione" con
 * gerarchia forte — numero ENORME, icona in chip, titolo, descrizione e CTA.
 * Accento laterale + sfondo tonalizzato rosso + leggero pulse (disattivato
 * con motion-reduce). Non viene renderizzato quando il conteggio è zero,
 * quindi non crea mai spazio vuoto.
 *
 * Usato da: AvvisoNuoviOrdini e AvvisoReclamiAperti (stessa identità grafica).
 */
export function AttentionCard({
  icon: Icon,
  count,
  titolo,
  descrizione,
  href,
  ctaLabel,
}: {
  icon: LucideIcon;
  count: number;
  titolo: string;
  descrizione: string;
  href: string;
  ctaLabel: string;
}) {
  if (!count || count <= 0) return null;

  return (
    <Link
      href={href}
      className="group relative flex items-stretch gap-4 overflow-hidden rounded-[1.75rem] border border-red-200/80 bg-white shadow-sm transition hover:border-red-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 sm:gap-5"
    >
      {/* Accento laterale */}
      <span
        className="w-1.5 shrink-0 self-stretch bg-linear-to-b from-red-500 to-red-600"
        aria-hidden
      />

      {/* Icona in chip con indicatore pulsante */}
      <span className="relative mt-5 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-white shadow-md shadow-red-600/30 sm:h-16 sm:w-16">
        <Icon className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden />
        <span
          className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-red-500 ring-2 ring-white motion-reduce:animate-none"
          aria-hidden
        />
      </span>

      {/* Contenuto */}
      <div className="min-w-0 flex-1 py-5 pr-4">
        <p className="font-mono text-5xl font-black leading-none tracking-tight text-red-700 tabular-nums sm:text-6xl">
          {count}
        </p>
        <p className="mt-2 text-sm font-black uppercase tracking-wide text-slate-900">
          {titolo}
        </p>
        <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
          {descrizione}
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition group-hover:bg-red-700 group-hover:shadow-md">
          {ctaLabel}
          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
