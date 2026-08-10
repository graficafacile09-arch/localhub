import Link from "next/link";
import {
  BellRing,
  CheckCircle2,
  Clock,
  PackageCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

/** Conteggi per stato della lista ordini venditore. */
export type ConteggiOrdini = {
  nuovi: number;
  lavorazione: number;
  pronti: number;
  completati: number;
  annullati: number;
};

const ITEM_KPI: ReadonlyArray<{
  key: keyof ConteggiOrdini;
  etichetta: string;
  filtro: string;
  icona: LucideIcon;
  neutro: string;
  /** true → diventa ROSSO pieno quando il valore è > 0 (attenzione). */
  urgente: boolean;
}> = [
  {
    key: "nuovi",
    etichetta: "Nuovi",
    filtro: "nuovi",
    icona: BellRing,
    neutro: "bg-amber-50 text-amber-700",
    urgente: true,
  },
  {
    key: "lavorazione",
    etichetta: "In lavorazione",
    filtro: "lavorazione",
    icona: Clock,
    neutro: "bg-orange-50 text-orange-700",
    urgente: false,
  },
  {
    key: "pronti",
    etichetta: "Pronti",
    filtro: "pronti",
    icona: PackageCheck,
    neutro: "bg-green-50 text-green-700",
    urgente: false,
  },
  {
    key: "completati",
    etichetta: "Completati",
    filtro: "completati",
    icona: CheckCircle2,
    neutro: "bg-emerald-50 text-emerald-700",
    urgente: false,
  },
  {
    key: "annullati",
    etichetta: "Annullati",
    filtro: "annullati",
    icona: XCircle,
    neutro: "bg-red-50 text-red-700",
    urgente: false,
  },
];

/**
 * KPI ORDINI VENDITORE — striscia di KPI professionali per stato, ciascuno
 * collegato al relativo filtro della lista. Il KPI "Nuovi" riceve una forte
 * evidenza ROSSA quando il valore è > 0 (ordini da gestire, impossibile non
 * notarli), restando comunque compatto e non invasivo a zero.
 */
export function KpiOrdini({
  baseHref,
  conteggi,
}: {
  baseHref: string;
  conteggi: ConteggiOrdini;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
      {ITEM_KPI.map(({ key, etichetta, filtro, icona: Icona, neutro, urgente }) => {
        const valore = conteggi[key] ?? 0;
        const rossa = urgente && valore > 0;
        return (
          <Link
            key={key}
            href={`${baseHref}?filtro=${filtro}`}
            className={`group/kpi rounded-2xl px-3.5 py-3 ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${
              rossa
                ? "bg-red-600 text-white ring-red-700 shadow-md shadow-red-600/25"
                : "bg-white ring-slate-200"
            }`}
          >
            <span
              className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${
                rossa ? "text-red-100" : neutro
              }`}
            >
              <Icona className="h-3.5 w-3.5" aria-hidden />
              {etichetta}
            </span>
            <p
              className={`mt-1.5 text-2xl font-black tracking-tight ${
                rossa ? "text-white" : "text-slate-900"
              }`}
            >
              {valore}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
