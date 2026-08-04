import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Card base della dashboard Area Clienti.
 * Struttura grafica condivisa: icona, valore, titolo, descrizione e azione.
 */
export default function ClienteCardBase({
  icon: Icon,
  value,
  label,
  description,
  href,
  hrefLabel,
  accent = "text-teal-600",
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  description: string;
  href: string;
  hrefLabel: string;
  accent?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-[0_20px_40px_-32px_rgba(13,148,136,0.45)]"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 ring-1 ring-teal-100">
          <Icon className={`h-6 w-6 ${accent}`} aria-hidden />
        </span>
        <span className="text-4xl font-black tracking-tight text-slate-900">
          {value}
        </span>
      </div>

      <h3 className="mt-4 text-base font-black tracking-tight text-slate-900">
        {label}
      </h3>
      <p className="mt-1.5 flex-1 text-sm leading-6 text-slate-500">
        {description}
      </p>

      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-teal-700 transition group-hover:gap-2.5">
        {hrefLabel}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </span>
    </Link>
  );
}
