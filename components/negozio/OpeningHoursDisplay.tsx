"use client";

import { useMemo } from "react";
import type { DaySchedule, Orari } from "@/types/orari";
import { DAYS, ITALIAN_DAYS, parseTime } from "@/types/orari";

const LABEL: Record<string, string> = {
  "lunedì": "Lunedì", "martedì": "Martedì", "mercoledì": "Mercoledì",
  "giovedì": "Giovedì", "venerdì": "Venerdì", "sabato": "Sabato", "domenica": "Domenica",
};

type Interval = { open: number; close: number };
type StatusInfo = {
  type: "open" | "closed";
  text: string;
};

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
  return `${fmt(i.open)}\u2013${fmt(i.close)}`;
}

function getStatus(schedule: Orari | null): StatusInfo {
  if (!schedule) return { type: "closed", text: "Orari non disponibili" };

  const now = new Date();
  const todayName = ITALIAN_DAYS[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const today = schedule[todayName];
  const intervals = today ? getIntervals(today) : [];

  if (!today || today.chiuso || intervals.length === 0) {
    for (let i = 1; i <= 7; i++) {
      const nextIdx = (now.getDay() + i) % 7;
      const nextName = ITALIAN_DAYS[nextIdx];
      const next = schedule[nextName];
      const nextIntervals = next ? getIntervals(next) : [];
      if (next && !next.chiuso && nextIntervals.length > 0) {
        const prefix = i === 1 ? "domani" : LABEL[nextName] ?? nextName;
        return { type: "closed", text: `Riapre ${prefix} alle ${fmt(nextIntervals[0].open)}` };
      }
    }
    return { type: "closed", text: "Chiuso oggi" };
  }

  for (const iv of intervals) {
    if (currentMinutes >= iv.open && currentMinutes < iv.close) {
      return { type: "open", text: `Chiude alle ${fmt(iv.close)}` };
    }
  }

  const nextInterval = intervals.find((iv) => currentMinutes < iv.open);
  if (nextInterval) {
    return { type: "closed", text: `Apre oggi alle ${fmt(nextInterval.open)}` };
  }

  for (let i = 1; i <= 7; i++) {
    const nextIdx = (now.getDay() + i) % 7;
    const nextName = ITALIAN_DAYS[nextIdx];
    const next = schedule[nextName];
    const nextIntervals = next ? getIntervals(next) : [];
    if (next && !next.chiuso && nextIntervals.length > 0) {
      const prefix = i === 1 ? "domani" : LABEL[nextName] ?? nextName;
      return { type: "closed", text: `Riapre ${prefix} alle ${fmt(nextIntervals[0].open)}` };
    }
  }

  return { type: "closed", text: "Chiuso oggi" };
}

function findNextOpenForDay(schedule: Orari, day: string): string | null {
  const d = schedule[day];
  const intervals = d ? getIntervals(d) : [];
  if (!d || d.chiuso || intervals.length === 0) return null;
  return formatInterval(intervals[0]);
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
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600">{orari}</p>
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
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-900">Orari di apertura</p>
        <div className="mt-2 flex items-center gap-1.5 text-sm">
          {statusType === "open" ? (
            <>
              <span className="text-lg leading-none">🟢</span>
              <span className="font-medium text-emerald-600">Aperto ora</span>
              <span className="text-slate-400">&middot;</span>
              <span className="text-slate-600">{statusText}</span>
            </>
          ) : (
            <>
              <span className="text-lg leading-none">🔴</span>
              <span className="font-medium text-amber-600">Chiuso</span>
              <span className="text-slate-400">&middot;</span>
              <span className="text-slate-600">{statusText}</span>
            </>
          )}
        </div>
      </div>

      <div className="space-y-3 text-sm">
        {DAYS.map((day) => {
          const d = schedule[day];
          const isToday = day === todayName;
          const intervals = d ? getIntervals(d) : [];
          const closed = !d || d.chiuso || intervals.length === 0;

          return (
            <div key={day} className="flex items-center justify-between py-1.5">
              <span className={`flex shrink-0 items-center gap-2 ${isToday ? "font-bold text-slate-900" : "text-slate-700"}`}>
                {LABEL[day] ?? day}
                {isToday && (
                  <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold leading-none text-white">
                    Oggi
                  </span>
                )}
              </span>
              <span className="tabular-nums text-right whitespace-pre leading-tight text-slate-600">
                {closed ? "Chiuso" : intervals.map((iv) => formatInterval(iv)).join("\n")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
