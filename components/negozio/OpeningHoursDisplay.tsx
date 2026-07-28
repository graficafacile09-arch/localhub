"use client";

import { useMemo } from "react";
import { Clock, CheckCircle2, XCircle } from "lucide-react";

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
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Clock className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold tracking-tight text-slate-800">Orari di apertura</span>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">{orari}</p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <Clock className="h-4 w-4" />
        </div>
        <span className="text-sm font-bold tracking-tight text-slate-800">Orari di apertura</span>
      </div>

      <div className={`mb-4 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm ${
        status.open ? "bg-emerald-50" : "bg-slate-50"
      }`}>
        {status.open ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
        ) : (
          <XCircle className="h-5 w-5 shrink-0 text-slate-400" />
        )}
        <span className={`font-semibold ${status.open ? "text-emerald-800" : "text-slate-600"}`}>
          {status.text}
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {DAYS_ORDER.map((day) => {
          const d = schedule[day];
          const isToday = day === todayName;
          const closed = !d || d.chiuso;

          return (
            <div
              key={day}
              className={`flex items-center justify-between py-2.5 ${
                isToday ? "-mx-3 rounded-xl bg-blue-50/70 px-3" : "px-0"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-sm ${isToday ? "font-bold text-blue-900" : "font-medium text-slate-700"}`}>
                  {day.charAt(0).toUpperCase() + day.slice(1)}
                </span>
                {isToday && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                    Oggi
                  </span>
                )}
              </div>
              {closed ? (
                <span className="text-sm italic text-slate-300">Chiuso</span>
              ) : (
                <span className={`text-sm tabular-nums tracking-tight ${
                  isToday ? "font-semibold text-blue-700" : "text-slate-600"
                }`}>
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
