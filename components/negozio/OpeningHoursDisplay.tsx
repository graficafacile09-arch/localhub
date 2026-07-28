"use client";

import { useMemo } from "react";

type DaySchedule = { apertura: string; chiusura: string; chiuso: boolean };

const DAYS_ORDER = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"] as const;
const ITALIAN_DAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

function parseTime(t: string): number {
  const parts = t.split(":").map(Number);
  return parts[0] * 60 + (parts[1] ?? 0);
}

function formatTimeRange(apertura: string, chiusura: string): string {
  return `${apertura.slice(0, 5)} – ${chiusura.slice(0, 5)}`;
}

function getStatus(schedule: Record<string, DaySchedule> | null): {
  text: string;
  open: boolean;
} {
  if (!schedule) return { text: "Orari non disponibili", open: false };

  const todayName = ITALIAN_DAYS[new Date().getDay()];
  const today = schedule[todayName];

  if (!today || today.chiuso) {
    const nextDay = DAYS_ORDER.find((d) => schedule[d] && !schedule[d].chiuso);
    if (nextDay) {
      return {
        text: `Apre ${nextDay} alle ${schedule[nextDay].apertura.slice(0, 5)}`,
        open: false,
      };
    }
    return { text: "Chiuso", open: false };
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = parseTime(today.apertura);
  const closeMinutes = parseTime(today.chiusura);

  if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
    return {
      text: `Chiude alle ${today.chiusura.slice(0, 5)}`,
      open: true,
    };
  }

  if (currentMinutes < openMinutes) {
    return {
      text: `Apre oggi alle ${today.apertura.slice(0, 5)}`,
      open: false,
    };
  }

  return { text: "Chiuso", open: false };
}

function getTodayName(): string {
  return ITALIAN_DAYS[new Date().getDay()];
}

export default function OpeningHoursDisplay({
  orari,
}: {
  orari: Record<string, DaySchedule> | string | null | undefined;
}) {
  const schedule = useMemo<Record<string, DaySchedule> | null>(() => {
    if (!orari) return null;
    if (typeof orari === "object") return orari;
    return null;
  }, [orari]);

  const status = useMemo(() => getStatus(schedule), [schedule]);
  const todayName = useMemo(() => getTodayName(), []);

  if (!schedule) {
    if (typeof orari === "string" && orari) {
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600">{orari}</p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-900">Orari di apertura</p>
        <div className="mt-2 flex items-center gap-1.5 text-sm">
          {status.open ? (
            <>
              <span className="text-emerald-600 font-medium">Aperto</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600">{status.text}</span>
            </>
          ) : (
            <>
              <span className="text-amber-600 font-medium">Chiuso</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600">{status.text}</span>
            </>
          )}
        </div>
      </div>

      <div className="divide-y divide-slate-100 text-sm">
        {DAYS_ORDER.map((day) => {
          const d = schedule[day];
          const isToday = day === todayName;
          const closed = !d || d.chiuso;

          return (
            <div
              key={day}
              className="flex items-center justify-between py-2.5"
            >
              <span className="flex items-center gap-2">
                <span className={`${isToday ? "font-bold text-slate-900" : "text-slate-700"}`}>
                  {day.charAt(0).toUpperCase() + day.slice(1)}
                </span>
                {isToday && (
                  <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold leading-none text-white">
                    Oggi
                  </span>
                )}
              </span>
              {closed ? (
                <span className="text-slate-300">Chiuso</span>
              ) : (
                <span className={`tabular-nums ${isToday ? "font-bold text-slate-900" : "text-slate-600"}`}>
                  {formatTimeRange(d.apertura, d.chiusura)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
