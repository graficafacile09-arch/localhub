"use client";

import { useMemo } from "react";
import { Clock } from "lucide-react";

type DaySchedule = { apertura: string; chiusura: string; chiuso: boolean };

const DAYS_ORDER = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"] as const;
const ITALIAN_DAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

function parseTime(t: string): number {
  const parts = t.split(":").map(Number);
  return parts[0] * 60 + (parts[1] ?? 0);
}

function formatTimeRange(apertura: string, chiusura: string): string {
  const a = apertura.slice(0, 5);
  const c = chiusura.slice(0, 5);
  const gap = parseTime(chiusura) - parseTime(apertura);
  const hasLunchBreak = gap > 360;
  if (hasLunchBreak) {
    const lunchEnd = apertura;
    const lunchStartMinutes = parseTime(apertura) + 60;
    const lunchStartH = Math.floor(lunchStartMinutes / 60);
    const lunchStartM = lunchStartMinutes % 60;
    const lunchStart = `${String(lunchStartH).padStart(2, "0")}:${String(lunchStartM).padStart(2, "0")}`;
    const lunchEndMinutes = parseTime(chiusura) - 60;
    const lunchEndH = Math.floor(lunchEndMinutes / 60);
    const lunchEndM = lunchEndMinutes % 60;
    const lunchEnd2 = `${String(lunchEndH).padStart(2, "0")}:${String(lunchEndM).padStart(2, "0")}`;
    return `${a}–${lunchStart} | ${lunchEnd2}–${c}`;
  }
  return `${a}–${c}`;
}

function getStatus(schedule: Record<string, DaySchedule> | null): {
  text: string;
  open: boolean;
  closesAt?: string;
  opensAt?: string;
} {
  if (!schedule) return { text: "Orari non disponibili", open: false };

  const todayName = ITALIAN_DAYS[new Date().getDay()];
  const today = schedule[todayName];

  if (!today || today.chiuso) {
    const nextDay = DAYS_ORDER.find((d) => schedule[d] && !schedule[d].chiuso);
    if (nextDay) {
      return {
        text: `Chiuso oggi — riapre ${nextDay} alle ${schedule[nextDay].apertura.slice(0, 5)}`,
        open: false,
        opensAt: schedule[nextDay].apertura.slice(0, 5),
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
      text: `Aperto adesso — chiude alle ${today.chiusura.slice(0, 5)}`,
      open: true,
      closesAt: today.chiusura.slice(0, 5),
    };
  }

  if (currentMinutes < openMinutes) {
    return {
      text: `Chiuso — riapre oggi alle ${today.apertura.slice(0, 5)}`,
      open: false,
      opensAt: today.apertura.slice(0, 5),
    };
  }

  return {
    text: `Chiuso — riapre domani`,
    open: false,
  };
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
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            Orari di apertura
          </div>
          <p className="text-sm text-slate-700">{orari}</p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        <Clock className="h-3.5 w-3.5" />
        Orari di apertura
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium">
        <span
          className={`inline-flex h-2 w-2 rounded-full ${status.open ? "bg-emerald-500" : "bg-slate-400"}`}
        />
        <span className={status.open ? "text-emerald-700" : "text-slate-500"}>{status.text}</span>
      </div>

      <div className="space-y-0.5">
        {DAYS_ORDER.map((day) => {
          const d = schedule[day];
          const isToday = day === todayName;
          const closed = !d || d.chiuso;

          return (
            <div
              key={day}
              className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${
                isToday ? "bg-blue-50 font-semibold text-blue-900" : "text-slate-700"
              }`}
            >
              <span className={isToday ? "font-semibold" : "font-medium"}>
                {day.charAt(0).toUpperCase() + day.slice(1)}
              </span>
              {closed ? (
                <span className="text-xs text-slate-400">Chiuso</span>
              ) : (
                <span className={`text-xs tabular-nums ${isToday ? "text-blue-700" : "text-slate-600"}`}>
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
