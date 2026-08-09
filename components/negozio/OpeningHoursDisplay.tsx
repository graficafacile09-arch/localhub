import { Clock } from "lucide-react";
import type { Orari } from "@/types/orari";

const DAYS = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

type DayOrari = {
  chiuso: boolean;
  apertura1: string;
  chiusura1: string;
  apertura2: string;
  chiusura2: string;
};

type Props = {
  orari: Orari | Record<string, DayOrari>;
  /** Se true, omette card e intestazione: lista giorni usata dentro una card esterna. */
  embedded?: boolean;
};

// Scheda "Orari di apertura" — sola estetica. Dati e logica invariati:
// un'intestazione chiara, giorni in grassetto, orari ben leggibili e stato
// Aperto/Chiuso evidenziato con una pill colorata per ogni giorno.
export default function OpeningHoursDisplay({ orari, embedded = false }: Props) {
  if (!orari || typeof orari !== "object") return null;

  const lista = (
    <ul className="mt-3 divide-y divide-slate-100">
      {DAYS.map((day) => {
        const d = orari[day];
        if (!d) return null;

        const fascia1 = d.apertura1 && d.chiusura1 ? `${d.apertura1}–${d.chiusura1}` : "";
        const fascia2 = d.apertura2 && d.chiusura2 ? `${d.apertura2}–${d.chiusura2}` : "";
        const orariTesto = [fascia1, fascia2].filter(Boolean).join(" · ");

        return (
          <li
            key={day}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0"
          >
            <span className="text-[13px] font-black capitalize tracking-tight text-slate-800">
              {day}
            </span>

            {d.chiuso ? (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-rose-500 ring-1 ring-rose-100">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden />
                Chiuso
              </span>
            ) : orariTesto ? (
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <span className="text-right text-[13px] font-bold tabular-nums tracking-tight text-slate-700">
                  {orariTesto}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-600 ring-1 ring-emerald-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                  Aperto
                </span>
              </div>
            ) : (
              <span className="ml-auto text-xs font-medium italic text-slate-300">—</span>
            )}
          </li>
        );
      })}
    </ul>
  );

  // Modalità embedded: nessuna card/intestazione, solo la lista giorni.
  if (embedded) return lista;

  return (
    <div className="rounded-2xl border border-white/70 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      {/* Intestazione */}
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100">
          <Clock className="h-[18px] w-[18px] text-blue-600" aria-hidden />
        </span>
        <h2 className="text-sm font-black tracking-tight text-slate-900">
          Orari di apertura
        </h2>
      </div>

      {/* Giorni */}
      {lista}
    </div>
  );
}
