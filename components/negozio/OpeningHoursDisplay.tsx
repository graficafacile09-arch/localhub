import { Clock } from "lucide-react";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { Orari } from "@/types/orari";

// Font più elegante per la scheda orari (stesso pattern next/font del layout).
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

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
};

// Scheda "Orari di apertura" — sola estetica. Dati e logica invariati:
// un'intestazione chiara, giorni in grassetto, orari ben leggibili e stato
// Aperto/Chiuso evidenziato con una pill colorata per ogni giorno.
export default function OpeningHoursDisplay({ orari }: Props) {
  if (!orari || typeof orari !== "object") return null;

  return (
    <div className={`${jakarta.className} rounded-2xl border border-white/70 bg-white p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-4`}>
      {/* Intestazione — accento amber coerente con il giallo InCittà */}
      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
          <Clock className="h-4 w-4 text-amber-600" aria-hidden />
        </span>
        <h2 className="text-[13px] font-extrabold tracking-tight text-slate-900">
          Orari di apertura
        </h2>
      </div>

      {/* Giorni — linee discrete per dare ordine */}
      <ul className="mt-2.5 divide-y divide-slate-200/70">
        {DAYS.map((day) => {
          const d = orari[day];
          if (!d) return null;

          const fascia1 = d.apertura1 && d.chiusura1 ? `${d.apertura1}–${d.chiusura1}` : "";
          const fascia2 = d.apertura2 && d.chiusura2 ? `${d.apertura2}–${d.chiusura2}` : "";
          const orariTesto = [fascia1, fascia2].filter(Boolean).join(" · ");

          return (
            <li
              key={day}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2 first:pt-0 last:pb-0"
            >
              <span className="text-[13px] font-extrabold capitalize tracking-tight text-slate-800">
                {day}
              </span>

              {d.chiuso ? (
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-rose-500 ring-1 ring-rose-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden />
                  Chiuso
                </span>
              ) : orariTesto ? (
                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  <span className="text-right text-[13px] font-bold tabular-nums tracking-tight text-slate-700">
                    {orariTesto}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-600 ring-1 ring-emerald-100">
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
    </div>
  );
}
