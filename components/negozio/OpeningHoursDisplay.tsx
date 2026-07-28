"use client";

import { useMemo } from "react";
import type { DaySchedule, Orari } from "@/types/orari";
import { DAYS, ITALIAN_DAYS, parseTime } from "@/types/orari";

const LABEL: Record<string, string> = {
  "lunedì": "Lunedì", "martedì": "Martedì", "mercoledì": "Mercoledì",
  "giovedì": "Giovedì", "venerdì": "Venerdì", "sabato": "Sabato", "domenica": "Domenica",
};

type Interval = { open: number; close: number };

function getIntervals(day: DaySchedule): Interval[] {
  if (day.chiuso) return [];
  const result: Interval[] = [];
  if (day.apertura1 && day.chiusura1) {
    result.push({ open: parseTime(day.apertura1), close: parseTime(day.chiusura1) });
  }
  if (day.apertura2 && day.chiusura2) {
    result.push({ open: parseTime(day.apertura2), close: parseTime(day.chiusura2) });
  }
  return result.sort((a, b) => a.open - b.open);
}

function fmt(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function formatInterval(i: Interval): string {
  return `${fmt(i.open)}–${fmt(i.close)}`;
}

export default function OpeningHoursDisplay({
  orari,
}: {
  orari: Orari | string | null | undefined;
}) {
  const schedule = useMemo<Orari | null>(() => {
    if (!orari) return null;
    if (typeof orari === "object") return orari;
    return null;
  }, [orari]);

  if (!schedule) {
    if (typeof orari === "string" && orari) {
      return (
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="text-sm text-slate-500">{orari}</p>
        </div>
      );
    }
    return null;
  }

  const now = new Date();
  const todayName = ITALIAN_DAYS[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const today = schedule[todayName];
  const todayIntervals = today ? getIntervals(today) : [];

  let statusText = "";
  let statusType: "open" | "closed" = "closed";

  if (!today || today.chiuso || todayIntervals.length === 0) {
    for (let i = 1; i <= 7; i++) {
      const nextIdx = (now.getDay() + i) % 7;
      const nextName = ITALIAN_DAYS[nextIdx];
      const next = schedule[nextName];
      const nextIntervals = next ? getIntervals(next) : [];
      if (next && !next.chiuso && nextIntervals.length > 0) {
        const prefix = i === 1 ? "domani" : LABEL[nextName] ?? nextName;
        statusText = `Riapre ${prefix} alle ${fmt(nextIntervals[0].open)}`;
        break;
      }
    }
    if (!statusText) {
      statusText = "Chiuso oggi";
    }
  } else {
    for (const iv of todayIntervals) {
      if (currentMinutes >= iv.open && currentMinutes < iv.close) {
        statusText = `Chiude alle ${fmt(iv.close)}`;
        statusType = "open";
        break;
      }
    }
    if (statusType === "closed") {
      const nextInterval = todayIntervals.find((iv) => currentMinutes < iv.open);
      if (nextInterval) {
        statusText = `Apre oggi alle ${fmt(nextInterval.open)}`;
      } else {
        for (let i = 1; i <= 7; i++) {
          const nextIdx = (now.getDay() + i) % 7;
          const nextName = ITALIAN_DAYS[nextIdx];
          const next = schedule[nextName];
          const nextIntervals = next ? getIntervals(next) : [];
          if (next && !next.chiuso && nextIntervals.length > 0) {
            const prefix = i === 1 ? "domani" : LABEL[nextName] ?? nextName;
            statusText = `Riapre ${prefix} alle ${fmt(nextIntervals[0].open)}`;
            break;
          }
        }
        if (!statusText) {
          statusText = "Chiuso oggi";
        }
      }
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
      <div className="bg-gradient-to-r from-slate-50 to-white px-5 py-4">
        <h3 className="text-sm font-bold text-slate-900">Orari di apertura</h3>
        <div className="mt-2 flex items-center gap-2 text-sm">
          {statusType === "open" ? (
            <>
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Aperto ora
              </span>
              <span className="text-slate-500">{statusText}</span>
            </>
          ) : (
            <>
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-amber-50 px-2.5 text-[11px] font-bold text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Chiuso
              </span>
              <span className="text-slate-500">{statusText}</span>
            </>
          )}
        </div>
      </div>

      <div className="divide-y divide-slate-100 px-5 py-1">
        {DAYS.map((day) => {
          const d = schedule[day];
          const isToday = day === todayName;
          const intervals = d ? getIntervals(d) : [];
          const closed = !d || d.chiuso || intervals.length === 0;

          return (
            <div
              key={day}
              className={`flex items-center justify-between py-2 ${
                isToday ? "bg-blue-50/50 -mx-5 px-5" : ""
              }`}
            >
              <span className={`w-28 shrink-0 text-sm ${isToday ? "font-bold text-blue-700" : "text-slate-700"}`}>
                {LABEL[day] ?? day}
                {isToday && (
                  <span className="ml-2 rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                    Oggi
                  </span>
                )}
              </span>
              <span className={`shrink-0 text-right text-sm tabular-nums ${closed ? "text-slate-300 italic" : "text-slate-600"}`}>
                {closed ? "Chiuso" : intervals.map((iv) => formatInterval(iv)).join("  ")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}