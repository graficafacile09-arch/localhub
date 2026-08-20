"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  BellRing,
  CheckCircle2,
  Hammer,
  MessageSquareWarning,
  PackageCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

/** Conteggi per stato della lista ordini venditore (barra di navigazione). */
export type ConteggiOrdini = {
  nuovi: number;
  lavorazione: number;
  pronti: number;
  completati: number;
  annullati: number;
  reclami: number;
};

const ITEM_NAV: ReadonlyArray<{
  key: keyof ConteggiOrdini;
  etichetta: string;
  micro: string;
  filtro: string;
  icona: LucideIcon;
  neutro: string;
  /** true → il conteggio diventa ROSSO quando > 0 (attenzione). */
  urgente: boolean;
}> = [
  {
    key: "nuovi",
    etichetta: "Nuovi",
    micro: "Da confermare",
    filtro: "nuovi",
    icona: BellRing,
    neutro: "bg-yellow-50 text-yellow-700",
    urgente: true,
  },
  {
    key: "lavorazione",
    etichetta: "In lavorazione",
    micro: "In preparazione",
    filtro: "lavorazione",
    icona: Hammer,
    neutro: "bg-yellow-50 text-yellow-700",
    urgente: false,
  },
  {
    key: "pronti",
    etichetta: "Pronti",
    micro: "Pronti al ritiro",
    filtro: "pronti",
    icona: PackageCheck,
    neutro: "bg-blue-50 text-blue-700",
    urgente: false,
  },
  {
    key: "completati",
    etichetta: "Completati",
    micro: "Conclusi",
    filtro: "completati",
    icona: CheckCircle2,
    neutro: "bg-blue-50 text-blue-700",
    urgente: false,
  },
  {
    key: "annullati",
    etichetta: "Annullati",
    micro: "Annullati",
    filtro: "annullati",
    icona: XCircle,
    neutro: "bg-blue-50 text-blue-700",
    urgente: false,
  },
  {
    key: "reclami",
    etichetta: "Reclami",
    micro: "Da gestire",
    filtro: "reclami",
    icona: MessageSquareWarning,
    neutro: "bg-red-50 text-red-600",
    urgente: false,
  },
];

/**
 * BARRA DI NAVIGAZIONE DEGLI STATI ORDINI (area venditore).
 * Riquadri compatti e cliccabili: ognuno seleziona il proprio stato (il
 * riquadro attivo diventa BLU, gli altri neutri) e porta la pagina alla
 * sezione della lista che contiene quegli ordini (`#lista-ordini`), con
 * scroll automatico. Il conteggio "Nuovi" resta evidenziato in ROSSO quando
 * > 0 (attenzione), senza confliggere con il blu dello stato attivo.
 */
export function KpiOrdini({
  baseHref,
  conteggi,
  filtroAttivo,
}: {
  baseHref: string;
  conteggi: ConteggiOrdini;
  filtroAttivo: string;
}) {
  // Dopo ogni navigazione a un filtro, porta in vista la sezione della lista
  // che contiene gli ordini dello stato selezionato (scroll-margin-top sul
  // target gestisce l'offset dell'header mobile sticky).
  useEffect(() => {
    if (filtroAttivo === "tutti") return;
    const el = document.getElementById("lista-ordini");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [filtroAttivo]);

  return (
    <nav aria-label="Stati degli ordini">
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
        {ITEM_NAV.map(
          ({ key, etichetta, micro, filtro, icona: Icona, neutro, urgente }) => {
            const valore = conteggi[key] ?? 0;
            const attivo = filtroAttivo === filtro;
            const rossa = urgente && valore > 0 && !attivo;
            return (
              <Link
                key={key}
                href={`${baseHref}?filtro=${filtro}`}
                aria-current={attivo ? "page" : undefined}
                className={`group/nav min-w-0 rounded-xl px-2.5 py-2.5 ring-1 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                  attivo
                    ? "bg-blue-600 text-white ring-blue-700 shadow-md shadow-blue-600/25"
                    : rossa
                      ? "bg-white ring-red-200"
                      : "bg-white ring-slate-200"
                }`}
              >
                <span className="flex items-center justify-between gap-1">
                  <span
                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                      attivo
                        ? "bg-white/20 text-white"
                        : rossa
                          ? "bg-red-50 text-red-600"
                          : neutro
                    }`}
                  >
                    <Icona className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <p
                    className={`font-mono text-xl font-black leading-none tracking-tight tabular-nums ${
                      attivo ? "text-white" : rossa ? "text-red-600" : "text-slate-900"
                    }`}
                  >
                    {valore}
                  </p>
                </span>
                <p
                  className={`mt-1.5 text-[10px] font-bold uppercase leading-tight tracking-wide ${
                    attivo ? "text-blue-100" : "text-slate-700"
                  }`}
                >
                  {etichetta}
                </p>
                <p
                  className={`mt-0.5 text-[9px] leading-tight ${
                    attivo ? "text-blue-100/80" : "text-slate-400"
                  }`}
                >
                  {micro}
                </p>
              </Link>
            );
          }
        )}
      </div>
    </nav>
  );
}
