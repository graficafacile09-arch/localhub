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

const LABEL: Record<string, string> = {
  "lunedì": "Lunedì", "martedì": "Martedì", "mercoledì": "Mercoledì",
  "giovedì": "Giovedì", "venerdì": "Venerdì", "sabato": "Sabato", "domenica": "Domenica",
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
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {Object.keys(PRESETS).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => applyPreset(name)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600"
          >
            {name}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {DAYS.map((day) => {
          const s = schedule[day] ?? EMPTY_DAY;
          const hasSecond = !!(s.apertura2 && s.chiusura2);

          return (
            <div
              key={day}
              className={`rounded-xl border px-4 py-2.5 transition ${
                s.chiuso ? "border-slate-100 bg-slate-50/60" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-3">
                <label className="flex w-16 shrink-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!s.chiuso}
                    onChange={(e) => toggleChiuso(day, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`text-sm font-semibold ${s.chiuso ? "text-slate-400" : "text-slate-700"}`}>
                    {SHORT[day]}
                  </span>
                </label>

                {s.chiuso ? (
                  <span className="text-xs text-slate-400 italic">Chiuso</span>
                ) : (
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Mattina</span>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                        <input
                          type="time"
                          value={s.apertura1}
                          onChange={(e) => updateDay(day, { apertura1: e.target.value })}
                          className="h-7 w-24 rounded border border-slate-200 px-1.5 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                        />
                      </div>
                      <span className="text-xs text-slate-300">&rarr;</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="time"
                          value={s.chiusura1}
                          onChange={(e) => updateDay(day, { chiusura1: e.target.value })}
                          className="h-7 w-24 rounded border border-slate-200 px-1.5 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                        />
                      </div>
                    </div>

                    {hasSecond && (
                      <div className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Pomeriggio</span>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                          <input
                            type="time"
                            value={s.apertura2}
                            onChange={(e) => updateDay(day, { apertura2: e.target.value })}
                            className="h-7 w-24 rounded border border-slate-200 px-1.5 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                          />
                        </div>
                        <span className="text-xs text-slate-300">&rarr;</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="time"
                            value={s.chiusura2}
                            onChange={(e) => updateDay(day, { chiusura2: e.target.value })}
                            className="h-7 w-24 rounded border border-slate-200 px-1.5 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving || !isDirty}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-md shadow-blue-500/25 transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saving ? "Salvataggio..." : saved ? "Salvato!" : "Salva orari"}
        </button>
        {isDirty && !saving && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Non salvato
          </span>
        )}
      </div>
    </form>
  );
}