"use client";

import { useEffect } from "react";
import { Check, Clock, Loader2 } from "lucide-react";
import { useSettingsForm } from "./useSettingsForm";
import { useSettingsContext } from "./SettingsShell";
import type { DaySchedule, Orari } from "@/types/orari";
import { DAYS, EMPTY_DAY, CLOSED_DAY } from "@/types/orari";

const SHORT: Record<string, string> = {
  "lunedì": "Lun", "martedì": "Mar", "mercoledì": "Mer",
  "giovedì": "Gio", "venerdì": "Ven", "sabato": "Sab", "domenica": "Dom",
};

function cloneDay(d: DaySchedule): DaySchedule {
  return { ...d };
}

function buildForDays(days: readonly string[], s: DaySchedule): Orari {
  const r: Orari = {};
  for (const d of DAYS) {
    r[d] = days.includes(d) ? { ...s } : { ...CLOSED_DAY };
  }
  return r;
}

const PRESETS: Record<string, Orari> = {
  "Negozio classico": buildForDays(
    ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì"],
    { chiuso: false, apertura1: "09:00", chiusura1: "13:00", apertura2: "16:00", chiusura2: "20:00" }
  ),
  "Apertura continuata": buildForDays(
    ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"],
    { chiuso: false, apertura1: "09:00", chiusura1: "20:00", apertura2: "", chiusura2: "" }
  ),
  "Bar": buildForDays(
    ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"],
    { chiuso: false, apertura1: "07:30", chiusura1: "13:00", apertura2: "15:30", chiusura2: "20:00" }
  ),
  "Ristorante": buildForDays(
    ["martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"],
    { chiuso: false, apertura1: "10:00", chiusura1: "14:30", apertura2: "18:00", chiusura2: "23:00" }
  ),
  "Chiuso": buildForDays([], { ...CLOSED_DAY }),
};

export default function OpeningHoursEditor({
  storeId,
  initial,
}: {
  storeId: string;
  initial: Orari;
}) {
  const { setFormDirty } = useSettingsContext();
  const { data: schedule, updateAll, saving, saved, error, isDirty, handleSubmit } = useSettingsForm(initial);

  useEffect(() => {
    setFormDirty("hours", isDirty);
  }, [isDirty, setFormDirty]);

  function updateDay(day: string, patch: Partial<DaySchedule>) {
    const current = schedule[day] ? cloneDay(schedule[day]) : { ...EMPTY_DAY };
    updateAll({ ...schedule, [day]: { ...current, ...patch } });
  }

  function toggleChiuso(day: string, aperto: boolean) {
    updateAll({
      ...schedule,
      [day]: aperto ? { ...EMPTY_DAY } : { ...CLOSED_DAY },
    });
  }

  function applyPreset(name: string) {
    const preset = PRESETS[name];
    if (preset) updateAll(preset);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleSubmit(async (data) => {
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orari: data }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? "Errore nel salvataggio.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {Object.keys(PRESETS).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => applyPreset(name)}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500 transition hover:border-blue-300 hover:text-blue-600"
          >
            {name}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        {DAYS.map((day) => {
          const s = schedule[day] ?? EMPTY_DAY;
          const hasSecond = !!(s.apertura2 && s.chiusura2);

          return (
            <div
              key={day}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 transition ${
                s.chiuso ? "bg-slate-50/70" : "bg-white"
              }`}
            >
              <label className="flex w-12 shrink-0 items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={!s.chiuso}
                  onChange={(e) => toggleChiuso(day, e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
                />
                <span className={`text-[11px] font-semibold ${s.chiuso ? "text-slate-400" : "text-slate-600"}`}>
                  {SHORT[day]}
                </span>
              </label>

              {s.chiuso ? (
                <span className="text-[10px] text-slate-400 italic">Chiuso</span>
              ) : (
                <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-12 shrink-0 text-[9px] font-medium uppercase tracking-wider text-slate-400">Mattina</span>
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                      <Clock className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                      <input
                        type="time"
                        value={s.apertura1}
                        onChange={(e) => updateDay(day, { apertura1: e.target.value })}
                        className="h-6 flex-1 min-w-0 rounded border border-slate-100 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-50"
                      />
                    </div>
                    <span className="text-[10px] text-slate-300 shrink-0">&ndash;</span>
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                      <input
                        type="time"
                        value={s.chiusura1}
                        onChange={(e) => updateDay(day, { chiusura1: e.target.value })}
                        className="h-6 flex-1 min-w-0 rounded border border-slate-100 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-50"
                      />
                    </div>
                  </div>

                  {hasSecond && (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-12 shrink-0 text-[9px] font-medium uppercase tracking-wider text-slate-400">Pomeriggio</span>
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <Clock className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                        <input
                          type="time"
                          value={s.apertura2}
                          onChange={(e) => updateDay(day, { apertura2: e.target.value })}
                          className="h-6 flex-1 min-w-0 rounded border border-slate-100 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-50"
                        />
                      </div>
                      <span className="text-[10px] text-slate-300 shrink-0">&ndash;</span>
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <input
                          type="time"
                          value={s.chiusura2}
                          onChange={(e) => updateDay(day, { chiusura2: e.target.value })}
                          className="h-6 flex-1 min-w-0 rounded border border-slate-100 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-50"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving || !isDirty}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
          {saving ? "Salvataggio..." : saved ? "Salvato!" : "Salva orari"}
        </button>
        {isDirty && !saving && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600">
            <span className="h-1 w-1 rounded-full bg-amber-500" />
           Non salvato
          </span>
        )}
      </div>
    </form>
  );
}