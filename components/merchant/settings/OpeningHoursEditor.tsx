"use client";

import { useEffect } from "react";
import { Check, Clock, Loader2 } from "lucide-react";
import { useSettingsForm } from "./useSettingsForm";
import { useSettingsContext } from "./SettingsShell";

type DaySchedule = { apertura: string; chiusura: string; chiuso: boolean };

const DAYS = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"] as const;
const SHORT: Record<string, string> = {
  "lunedì": "Lun", "martedì": "Mar", "mercoledì": "Mer",
  "giovedì": "Gio", "venerdì": "Ven", "sabato": "Sab", "domenica": "Dom",
};

const PRESETS: Record<string, Record<string, DaySchedule>> = {
  "Lun-Ven 9-18": {
    "lunedì":    { apertura: "09:00", chiusura: "18:00", chiuso: false },
    "martedì":   { apertura: "09:00", chiusura: "18:00", chiuso: false },
    "mercoledì": { apertura: "09:00", chiusura: "18:00", chiuso: false },
    "giovedì":   { apertura: "09:00", chiusura: "18:00", chiuso: false },
    "venerdì":   { apertura: "09:00", chiusura: "18:00", chiuso: false },
    "sabato":    { apertura: "", chiusura: "", chiuso: true },
    "domenica":  { apertura: "", chiusura: "", chiuso: true },
  },
  "Lun-Sab 9-20": {
    "lunedì":    { apertura: "09:00", chiusura: "20:00", chiuso: false },
    "martedì":   { apertura: "09:00", chiusura: "20:00", chiuso: false },
    "mercoledì": { apertura: "09:00", chiusura: "20:00", chiuso: false },
    "giovedì":   { apertura: "09:00", chiusura: "20:00", chiuso: false },
    "venerdì":   { apertura: "09:00", chiusura: "20:00", chiuso: false },
    "sabato":    { apertura: "09:00", chiusura: "20:00", chiuso: false },
    "domenica":  { apertura: "", chiusura: "", chiuso: true },
  },
  "Tutti 9-21": {
    "lunedì":    { apertura: "09:00", chiusura: "21:00", chiuso: false },
    "martedì":   { apertura: "09:00", chiusura: "21:00", chiuso: false },
    "mercoledì": { apertura: "09:00", chiusura: "21:00", chiuso: false },
    "giovedì":   { apertura: "09:00", chiusura: "21:00", chiuso: false },
    "venerdì":   { apertura: "09:00", chiusura: "21:00", chiuso: false },
    "sabato":    { apertura: "09:00", chiusura: "21:00", chiuso: false },
    "domenica":  { apertura: "09:00", chiusura: "21:00", chiuso: false },
  },
};

export default function OpeningHoursEditor({
  storeId,
  initial,
}: {
  storeId: string;
  initial: Record<string, DaySchedule>;
}) {
  const { setFormDirty } = useSettingsContext();
  const { data: schedule, updateAll, saving, saved, error, isDirty, handleSubmit } = useSettingsForm(initial);

  useEffect(() => {
    setFormDirty("hours", isDirty);
  }, [isDirty, setFormDirty]);

  function updateDay(day: string, field: keyof DaySchedule, value: string | boolean) {
    updateAll({ ...schedule, [day]: { ...schedule[day], [field]: value } });
  }

  function applyPreset(name: string) {
    const preset = PRESETS[name];
    if (preset) updateAll(preset);
  }

  function setAllDays(apertura: string, chiusura: string, chiuso: boolean) {
    const updated: Record<string, DaySchedule> = {};
    for (const day of DAYS) {
      updated[day] = { apertura, chiusura, chiuso };
    }
    updateAll(updated);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleSubmit(async (data) => {
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orari_apertura: data }),
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

      {/* Presets */}
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
          onClick={() => setAllDays("", "", true)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-red-300 hover:text-red-600"
        >
          Chiudi tutto
        </button>
      </div>

      {/* Grid */}
      <div className="space-y-2">
        {DAYS.map((day) => {
          const s = schedule[day] ?? { apertura: "", chiusura: "", chiuso: true };
          return (
            <div
              key={day}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
                s.chiuso ? "border-slate-100 bg-slate-50/60 opacity-60" : "border-slate-200 bg-white"
              }`}
            >
              <label className="flex w-16 shrink-0 items-center gap-2">
                <input
                  type="checkbox"
                  checked={!s.chiuso}
                  onChange={(e) => updateDay(day, "chiuso", !e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-semibold text-slate-700">{SHORT[day]}</span>
              </label>

              {s.chiuso ? (
                <span className="text-xs font-medium text-slate-400 italic">Chiuso</span>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="time"
                      value={s.apertura}
                      onChange={(e) => updateDay(day, "apertura", e.target.value)}
                      className="h-8 w-28 rounded-lg border border-slate-200 px-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                    />
                  </div>
                  <span className="text-xs text-slate-400">&rarr;</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={s.chiusura}
                      onChange={(e) => updateDay(day, "chiusura", e.target.value)}
                      className="h-8 w-28 rounded-lg border border-slate-200 px-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Salva */}
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
