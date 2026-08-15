import type { ReactNode } from "react";
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
  accent = "text-blue-600",
  secondaryIcon: SecondaryIcon,
  badge,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  description: string;
  href: string;
  hrefLabel: string;
  accent?: string;
  /** Icona decorativa secondaria (gerarchia visiva della card). */
  secondaryIcon?: LucideIcon;
  /** Badge opzionale accanto al valore (es. stato ultimo ordine). */
  badge?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col card card-hover p-6 hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 ring-1 ring-blue-100">
          <Icon className={`h-6 w-6 ${accent}`} aria-hidden />
        </span>
        <span className="flex items-start gap-2">
          {SecondaryIcon ? (
            <SecondaryIcon
              className="mt-1.5 h-4 w-4 text-slate-200"
              aria-hidden
            />
          ) : null}
          <span className="text-4xl font-black tracking-tight text-slate-900">
            {value}
          </span>
          {badge ? <span className="mt-2 shrink-0">{badge}</span> : null}
        </span>
      </div>

      <h3 className="mt-4 text-base font-black tracking-tight text-slate-900">
        {label}
      </h3>
      <p className="mt-1.5 flex-1 text-sm leading-6 text-slate-500">
        {description}
      </p>

      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-blue-700 transition group-hover:gap-2.5">
        {hrefLabel}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </span>
    </Link>
  );
}
