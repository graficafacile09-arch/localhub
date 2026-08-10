import Link from "next/link";
import {
  BellRing,
  CheckCircle2,
  Hammer,
  PackageCheck,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

/** Conteggi per stato della lista ordini venditore (KPI). */
export type ConteggiOrdini = {
  nuovi: number;
  lavorazione: number;
  inConsegna: number;
  pronti: number;
  completati: number;
  annullati: number;
};

const ITEM_KPI: ReadonlyArray<{
  key: keyof ConteggiOrdini;
  etichetta: string;
  micro: string;
  filtro: string;
  icona: LucideIcon;
  neutro: string;
  /** true → diventa ROSSO pieno quando il valore è > 0 (attenzione). */
  urgente: boolean;
}> = [
  {
    key: "nuovi",
    etichetta: "Nuovi",
    micro: "Da confermare",
    filtro: "nuovi",
    icona: BellRing,
    neutro: "bg-amber-50 text-amber-700",
    urgente: true,
  },
  {
    key: "lavorazione",
    etichetta: "In lavorazione",
    micro: "In preparazione",
    filtro: "lavorazione",
    icona: Hammer,
    neutro: "bg-orange-50 text-orange-700",
    urgente: false,
  },
  {
    key: "inConsegna",
    etichetta: "In consegna",
    micro: "In transito",
    filtro: "lavorazione",
    icona: Truck,
    neutro: "bg-sky-50 text-sky-700",
    urgente: false,
  },
  {
    key: "pronti",
    etichetta: "Pronti",
    micro: "Pronti al ritiro",
    filtro: "pronti",
    icona: PackageCheck,
    neutro: "bg-green-50 text-green-700",
    urgente: false,
  },
  {
    key: "completati",
    etichetta: "Completati",
    micro: "Conclusi",
    filtro: "completati",
    icona: CheckCircle2,
    neutro: "bg-emerald-50 text-emerald-700",
    urgente: false,
  },
  {
    key: "annullati",
    etichetta: "Annullati",
    micro: "Terminali",
    filtro: "annullati",
    icona: XCircle,
    neutro: "bg-red-50 text-red-700",
    urgente: false,
  },
];

/**
 * KPI ORDINI VENDITORE — striscia di KPI professionali per stato, ciascuno
 * con icona in chip, numero grande, etichetta e micro-descrizione, collegato
 * al relativo filtro della lista. Il KPI "Nuovi" riceve una forte evidenza
 * ROSSA quando > 0 (urgenza riservata: nuovi non letti, reclami, annullati).
 */
export function KpiOrdini({
  baseHref,
  conteggi,
}: {
  baseHref: string;
  conteggi: ConteggiOrdini;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      {ITEM_KPI.map(({ key, etichetta, micro, filtro, icona: Icona, neutro, urgente }) => {
        const valore = conteggi[key] ?? 0;
        const rossa = urgente && valore > 0;
        return (
          <Link
            key={key}
            href={`${baseHref}?filtro=${filtro}`}
            className={`group/kpi rounded-2xl px-3.5 py-3 ring-1 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
              rossa
                ? "bg-red-600 text-white ring-red-700 shadow-md shadow-red-600/25"
                : "bg-white ring-slate-200"
            }`}
          >
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${
                rossa ? "bg-white/20 text-white" : neutro
              }`}
            >
              <Icona className="h-4 w-4" aria-hidden />
            </span>
            <p
              className={`mt-2 font-mono text-2xl font-black leading-none tracking-tight tabular-nums ${
                rossa ? "text-white" : "text-slate-900"
              }`}
            >
              {valore}
            </p>
            <p
              className={`mt-1.5 text-[11px] font-bold uppercase tracking-wide ${
                rossa ? "text-red-100" : "text-slate-700"
              }`}
            >
              {etichetta}
            </p>
            <p
              className={`mt-0.5 text-[10px] ${
                rossa ? "text-red-100/80" : "text-slate-400"
              }`}
            >
              {micro}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
