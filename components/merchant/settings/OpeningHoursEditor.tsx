"use client";

import { useEffect } from "react";
import { Check, Clock, Loader2, Plus, X } from "lucide-react";
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

const DEFAULT_TEMPLATE: DaySchedule = { chiuso: false, apertura1: "09:00", chiusura1: "18:00", apertura2: "", chiusura2: "" };

function buildDefault(days: readonly string[]): Orari {
  const r: Orari = {};
  for (const d of days) r[d] = { ...DEFAULT_TEMPLATE };
  return r;
}

const PRESETS: Record<string, Orari> = {
  "Lun-Ven 9-18": {
    ...buildDefault(["lunedì", "martedì", "mercoledì", "giovedì", "venerdì"]),
    sabato: { ...CLOSED_DAY },
    domenica: { ...CLOSED_DAY },
  },
  "Lun-Sab 9-20": {
    ...buildDefault(["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"]),
    domenica: { ...CLOSED_DAY },
  },
  "Tutti 9-21": {
    ...buildDefault(["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]),
  },
};

const QUICK_PRESETS: Array<{ label: string; patch: Partial<DaySchedule> | null }> = [
  { label: "09:00–13:00 / 16:00–20:00", patch: { apertura1: "09:00", chiusura1: "13:00", apertura2: "16:00", chiusura2: "20:00" } },
  { label: "08:00–13:00 / 15:30–19:30", patch: { apertura1: "08:00", chiusura1: "13:00", apertura2: "15:30", chiusura2: "19:30" } },
  { label: "07:30–13:00 / 16:30–20:00", patch: { apertura1: "07:30", chiusura1: "13:00", apertura2: "16:30", chiusura2: "20:00" } },
  { label: "10:00–14:30 / 18:00–23:00", patch: { apertura1: "10:00", chiusura1: "14:30", apertura2: "18:00", chiusura2: "23:00" } },
  { label: "09:00–20:00 continuato", patch: { apertura1: "09:00", chiusura1: "20:00", apertura2: "", chiusura2: "" } },
  { label: "Chiuso", patch: null },
];

function hasPreset(s: DaySchedule, patch: Partial<DaySchedule>): boolean {
  if (patch.apertura1 && s.apertura1 === patch.apertura1 && s.chiusura1 === patch.chiusura1) return true;
  if (patch.apertura2 && s.apertura2 === patch.apertura2 && s.chiusura2 === patch.chiusura2) return true;
  return false;
}

const INTERVAL_PRESETS: Record<string, Array<{ label: string; apertura: string; chiusura: string }>> = {
  mattina: [
    { label: "07:00–13:00", apertura: "07:00", chiusura: "13:00" },
    { label: "08:00–13:00", apertura: "08:00", chiusura: "13:00" },
    { label: "09:00–13:00", apertura: "09:00", chiusura: "13:00" },
    { label: "09:00–14:00", apertura: "09:00", chiusura: "14:00" },
    { label: "10:00–14:00", apertura: "10:00", chiusura: "14:00" },
  ],
  pomeriggio: [
    { label: "15:00–19:00", apertura: "15:00", chiusura: "19:00" },
    { label: "15:30–19:30", apertura: "15:30", chiusura: "19:30" },
    { label: "16:00–20:00", apertura: "16:00", chiusura: "20:00" },
    { label: "16:30–20:30", apertura: "16:30", chiusura: "20:30" },
    { label: "17:00–21:00", apertura: "17:00", chiusura: "21:00" },
    { label: "18:00–23:00", apertura: "18:00", chiusura: "23:00" },
  ],
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

  function addSecondInterval(day: string) {
    updateDay(day, { apertura2: "15:30", chiusura2: "20:00" });
  }

  function removeSecondInterval(day: string) {
    updateDay(day, { apertura2: "", chiusura2: "" });
  }

  function applyQuickPreset(patch: Partial<DaySchedule> | null, day: string) {
    if (patch === null) {
      updateAll({ ...schedule, [day]: { ...CLOSED_DAY } });
    } else {
      updateDay(day, patch);
    }
  }

  function applyIntervalPreset(interval: "mattina" | "pomeriggio", preset: { apertura: string; chiusura: string }, day: string) {
    if (interval === "mattina") {
      updateDay(day, { apertura1: preset.apertura, chiusura1: preset.chiusura });
    } else {
      updateDay(day, { apertura2: preset.apertura, chiusura2: preset.chiusura });
    }
  }

  function applyPreset(name: string) {
    const preset = PRESETS[name];
    if (preset) updateAll(preset);
  }

  function setAllClosed() {
    const updated: Orari = {};
    for (const day of DAYS) updated[day] = { ...CLOSED_DAY };
    updateAll(updated);
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

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Preimpostazioni:</span>
        {Object.keys(PRESETS).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => applyPreset(name)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600"
          >
            {name}
          </button>
        ))}
        <button
          type="button"
          onClick={setAllClosed}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-red-300 hover:text-red-600"
        >
          Chiudi tutto
        </button>
      </div>

      <div className="space-y-2">
        {DAYS.map((day) => {
          const s = schedule[day] ?? EMPTY_DAY;
          const hasSecond = !!(s.apertura2 && s.chiusura2);

          return (
            <div
              key={day}
              className={`rounded-xl border px-4 py-3 transition ${
                s.chiuso ? "border-slate-100 bg-slate-50/60 opacity-60" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                <label className="flex w-16 shrink-0 items-center gap-2 pt-0.5">
                  <input
                    type="checkbox"
                    checked={!s.chiuso}
                    onChange={(e) => toggleChiuso(day, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-semibold text-slate-700">{SHORT[day]}</span>
                </label>

                {s.chiuso ? (
                  <span className="pt-0.5 text-xs font-medium text-slate-400 italic">Chiuso</span>
                ) : (
                  <div className="flex flex-1 flex-col gap-2">
                    {/* Mattina */}
                    <div className="flex items-center gap-2">
                      <span className="w-[72px] shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Mattina</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="time"
                          value={s.apertura1}
                          onChange={(e) => updateDay(day, { apertura1: e.target.value })}
                          className="h-8 w-28 rounded-lg border border-slate-200 px-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                        />
                      </div>
                      <span className="text-xs text-slate-400">&rarr;</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="time"
                          value={s.chiusura1}
                          onChange={(e) => updateDay(day, { chiusura1: e.target.value })}
                          className="h-8 w-28 rounded-lg border border-slate-200 px-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                        />
                      </div>
                      <div className="relative group">
                          <button type="button" className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 transition">
                            Orario tipico
                          </button>
                          <div className="absolute top-full left-0 mt-1 z-10 hidden group-hover:block rounded-lg border border-slate-200 bg-white shadow-lg py-1 min-w-[160px]">
                            {INTERVAL_PRESETS.mattina.map((p) => (
                              <button
                                key={p.label}
                                type="button"
                                onClick={() => applyIntervalPreset("mattina", p, day)}
                                className="block w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-blue-50"
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </div>
                    </div>

                    {/* Pomeriggio */}
                    {hasSecond ? (
                      <div className="flex items-center gap-2">
                        <span className="w-[72px] shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pomeriggio</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="time"
                            value={s.apertura2}
                            onChange={(e) => updateDay(day, { apertura2: e.target.value })}
                            className="h-8 w-28 rounded-lg border border-slate-200 px-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                          />
                        </div>
                        <span className="text-xs text-slate-400">&rarr;</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="time"
                            value={s.chiusura2}
                            onChange={(e) => updateDay(day, { chiusura2: e.target.value })}
                            className="h-8 w-28 rounded-lg border border-slate-200 px-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                          />
                        </div>
                        <div className="relative group">
                          <button type="button" className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 transition">
                            Orario tipico
                          </button>
                          <div className="absolute top-full left-0 mt-1 z-10 hidden group-hover:block rounded-lg border border-slate-200 bg-white shadow-lg py-1 min-w-[160px]">
                            {INTERVAL_PRESETS.pomeriggio.map((p) => (
                              <button
                                key={p.label}
                                type="button"
                                onClick={() => applyIntervalPreset("pomeriggio", p, day)}
                                className="block w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-blue-50"
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSecondInterval(day)}
                          className="ml-1 rounded-lg p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => addSecondInterval(day)}
                          className="flex items-center gap-1 text-xs font-semibold text-blue-600 transition hover:text-blue-700"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Aggiungi turno pomeridiano
                        </button>
                        <div className="relative group">
                          <button type="button" className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 transition">
                            Orario tipico
                          </button>
                          <div className="absolute top-full left-0 mt-1 z-10 hidden group-hover:block rounded-lg border border-slate-200 bg-white shadow-lg py-1 min-w-[160px]">
                            {INTERVAL_PRESETS.pomeriggio.map((p) => (
                              <button
                                key={p.label}
                                type="button"
                                onClick={() => applyIntervalPreset("pomeriggio", p, day)}
                                className="block w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-blue-50"
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
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

      {/* Quick presets per singolo giorno */}
      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Compila rapido per giorno:</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {DAYS.map((day) => {
            const s = schedule[day] ?? EMPTY_DAY;
            return (
              <div key={day} className="flex items-center gap-1">
                <span className="w-8 shrink-0 text-[11px] font-semibold text-slate-500">{SHORT[day]}</span>
                {QUICK_PRESETS.map((qp) => (
                  <button
                    key={qp.label}
                    type="button"
                    onClick={() => applyQuickPreset(qp.patch, day)}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition border ${
                      qp.patch === null
                        ? "border-slate-200 bg-white text-slate-500 hover:border-red-300 hover:text-red-500"
                        : hasPreset(s, qp.patch)
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600"
                    }`}
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving || !isDirty}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white shadow-md shadow-blue-500/25 transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
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

function sHasInterval(s: DaySchedule, patch: Partial<DaySchedule>): boolean {
  if (patch.apertura1 && s.apertura1 === patch.apertura1 && s.chiusura1 === patch.chiusura1) return true;
  if (patch.apertura2 && s.apertura2 === patch.apertura2 && s.chiusura2 === patch.chiusura2) return true;
  return false;
}
