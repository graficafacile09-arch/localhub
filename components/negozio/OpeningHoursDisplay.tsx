"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Clock } from "lucide-react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { DAYS, parseTime, formatTime } from "@/types/orari";
import type { DaySchedule, Orari } from "@/types/orari";

// Font più elegante per la scheda orari (stesso pattern next/font del layout).
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

type Props = {
  orari: Orari | null | undefined;
};

type Slot = { open: number; close: number };

// Converte "HH:MM" in minuti (null se non valido). Riutilizza parseTime.
function toMinutes(t: string | null | undefined): number | null {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const m = parseTime(t);
  return Number.isFinite(m) ? m : null;
}

// Fasce orarie reali di un giorno (ignora fasce vuote/errate).
function daySlots(d: DaySchedule | null | undefined): Slot[] {
  if (!d || d.chiuso) return [];
  const slots: Slot[] = [];
  const a1 = toMinutes(d.apertura1);
  const c1 = toMinutes(d.chiusura1);
  if (a1 !== null && c1 !== null && c1 > a1) slots.push({ open: a1, close: c1 });
  const a2 = toMinutes(d.apertura2);
  const c2 = toMinutes(d.chiusura2);
  if (a2 !== null && c2 !== null && c2 > a2) slots.push({ open: a2, close: c2 });
  return slots.sort((a, b) => a.open - b.open);
}

// Giorno "24 ore": un'unica fascia che copre l'intera giornata.
function is24h(d: DaySchedule | null | undefined): boolean {
  if (!d || d.chiuso) return false;
  const slots = daySlots(d);
  return slots.length === 1 && slots[0].open === 0 && slots[0].close >= 1439;
}

// Testo degli orari di un singolo giorno.
function dayText(d: DaySchedule | null | undefined): string {
  if (!d || d.chiuso) return "Chiuso";
  if (is24h(d)) return "Aperto 24h";
  const slots = daySlots(d);
  if (slots.length === 0) return "—";
  return slots.map((s) => `${formatTime(s.open)}–${formatTime(s.close)}`).join(" · ");
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Stato attuale (Aperto/Apre/Chiuso) calcolato sui dati reali.
function computeStatus(orari: Orari | null | undefined): { text: string; open: boolean } | null {
  if (!orari) return null;
  const now = new Date();
  const todayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = DAYS[todayIdx];
  const todayD = orari[today];

  if (is24h(todayD)) return { text: "Aperto 24h su 24", open: true };

  const tSlots = daySlots(todayD);
  const inSlot = tSlots.find((s) => nowMin >= s.open && nowMin < s.close);
  if (inSlot) return { text: `Aperto fino alle ${formatTime(inSlot.close)}`, open: true };

  // Chiuso ora: cerca la prossima apertura di oggi.
  const laterToday = tSlots.find((s) => s.open > nowMin);
  if (laterToday) return { text: `Apre alle ${formatTime(laterToday.open)}`, open: false };

  // Chiuso per il resto della giornata: cerca i giorni successivi.
  for (let offset = 1; offset <= 7; offset++) {
    const idx = (todayIdx + offset) % 7;
    const dayName = DAYS[idx];
    const slots = daySlots(orari[dayName]);
    if (slots.length > 0) {
      const label = offset === 1 ? "Apre domani" : `Apre ${cap(dayName)}`;
      return { text: `${label} alle ${formatTime(slots[0].open)}`, open: false };
    }
  }

  return { text: "Chiuso", open: false };
}

// Scheda "Orari di apertura" a scomparsa (stile Google): una riga compatta
// cliccabile con lo stato attuale, e il dettaglio settimanale espandibile.
export default function OpeningHoursDisplay({ orari }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!orari || typeof orari !== "object") return null;

  const hasAny = DAYS.some((day) => daySlots(orari[day] as DaySchedule).length > 0);
  const status = mounted ? computeStatus(orari) : null;
  const todayIdx = mounted ? (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1) : -1;
  const todayDay = todayIdx >= 0 ? DAYS[todayIdx] : null;

  // Nessun orario configurato: riga informativa non espandibile.
  if (!hasAny) {
    return (
      <div className={`${jakarta.className} rounded-2xl border border-white/70 bg-white p-3.5 shadow-sm sm:p-4`}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
            <Clock className="h-4 w-4 text-amber-600" aria-hidden />
          </span>
          <h2 className="text-[13px] font-extrabold tracking-tight text-slate-900">Orari di apertura</h2>
          <span className="ml-auto text-[12px] font-medium italic text-slate-400">Orari non disponibili</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${jakarta.className} rounded-2xl border border-white/70 bg-white p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-4`}>
      {/* Riga compatta cliccabile */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 text-left"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
          <Clock className="h-4 w-4 text-amber-600" aria-hidden />
        </span>
        <h2 className="text-[13px] font-extrabold tracking-tight text-slate-900">Orari di apertura</h2>

        {status && (
          <span
            className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1 ${
              status.open
                ? "bg-emerald-50 text-emerald-600 ring-emerald-100"
                : "bg-slate-100 text-slate-500 ring-slate-200"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${status.open ? "bg-emerald-500" : "bg-slate-400"}`}
              aria-hidden
            />
            {status.text}
          </span>
        )}

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {/* Dettaglio espandibile con transizione fluida */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <ul className="mt-2.5 divide-y divide-slate-200/70 border-t border-slate-100">
            {DAYS.map((day) => {
              const d = orari[day] as DaySchedule | undefined;
              if (!d) return null;
              const isToday = day === todayDay;
              const chiuso = !!d.chiuso;
              const testo = dayText(d);

              return (
                <li
                  key={day}
                  className={`flex items-center justify-between gap-x-3 py-1.5 ${
                    isToday ? "-mx-2 rounded-lg bg-amber-50/70 px-2" : ""
                  }`}
                >
                  <span
                    className={`flex items-center gap-1.5 text-[13px] capitalize tracking-tight ${
                      isToday ? "font-extrabold text-amber-900" : "font-semibold text-slate-700"
                    }`}
                  >
                    {day}
                    {isToday && (
                      <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                        Oggi
                      </span>
                    )}
                  </span>
                  <span
                    className={`ml-auto text-right text-[13px] tracking-tight tabular-nums ${
                      chiuso
                        ? "font-medium italic text-slate-300"
                        : testo === "—"
                          ? "font-medium italic text-slate-300"
                          : "font-semibold text-slate-700"
                    }`}
                  >
                    {testo}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
