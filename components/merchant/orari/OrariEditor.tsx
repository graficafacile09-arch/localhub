"use client";

import { useState, useCallback } from "react";
import { Check, Clock3, Copy, Plus, X } from "lucide-react";
import {
  DAYS,
  EMPTY_DAY,
  CLOSED_DAY,
  type DaySchedule,
  type Orari,
} from "@/types/negozio";
import {
  ORARI_PRESET_LABELS,
  ORARI_PRESETS,
  normalizzaGiorno,
  suggerisciSecondaFascia,
  giornoHaSovrapposizioni,
  copiaSettimanaDalLunedi,
} from "@/lib/orari";

const SHORT: Record<string, string> = {
  lunedì: "Lun",
  martedì: "Mar",
  mercoledì: "Mer",
  giovedì: "Gio",
  venerdì: "Ven",
  sabato: "Sab",
  domenica: "Dom",
};

type Props = {
  orari: Orari;
  onChange: (orari: Orari) => void;
};

export default function OrariEditor({ orari, onChange }: Props) {
  const [tab, setTab] = useState<"tutti" | "oggi">("tutti");

  function updateDay(day: string, patch: Partial<DaySchedule>) {
    const current = orari[day] ? { ...orari[day] } : { ...EMPTY_DAY };
    onChange({ ...orari, [day]: { ...current, ...patch } });
  }

  function toggleChiuso(day: string, aperto: boolean) {
    onChange({
      ...orari,
      [day]: aperto ? { ...EMPTY_DAY } : { ...CLOSED_DAY },
    });
  }

  function aggiungiSeconda(day: string) {
    const current = orari[day] ? { ...orari[day] } : { ...EMPTY_DAY };
    const s = normalizzaGiorno(current);
    onChange({ ...orari, [day]: { ...s, ...suggerisciSecondaFascia(s) } });
  }

  function rimuoviSeconda(day: string) {
    const current = orari[day] ?? { ...EMPTY_DAY };
    onChange({ ...orari, [day]: { ...current, apertura2: "", chiusura2: "" } });
  }

  const copiaDalLunedi = useCallback(() => {
    onChange(copiaSettimanaDalLunedi(orari));
  }, [orari, onChange]);

  function applyPreset(preset: keyof typeof ORARI_PRESETS) {
    onChange(ORARI_PRESETS[preset]);
  }

  const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const visibleDays = tab === "tutti" ? DAYS : [DAYS[todayIndex]];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Imposta gli orari</p>
            <p className="text-xs text-slate-500">
              Scegli un modello oppure personalizza ogni giorno.
            </p>
          </div>
          <button
            type="button"
            onClick={copiaDalLunedi}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-blue-300 hover:text-blue-700"
          >
            <Copy className="h-3.5 w-3.5" />
            Copia dal lunedì
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {ORARI_PRESET_LABELS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:scale-[0.98]"
            >
              {preset.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {([
            ["tutti", "Tutti i giorni"],
            ["oggi", "Solo oggi"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === value
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="hidden items-center gap-1.5 text-[11px] text-slate-400 sm:flex">
          <Clock3 className="h-3.5 w-3.5" />
          Formato 24 ore
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {visibleDays.map((day) => {
          const s = orari[day] ?? EMPTY_DAY;
          const hasSecond = !!(s.apertura2 && s.chiusura2);
          const overlap = giornoHaSovrapposizioni(s);

          return (
            <section
              key={day}
              className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
                s.chiuso ? "border-slate-200" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className={`flex items-center justify-between border-b px-4 py-3 ${
                s.chiuso ? "bg-slate-50" : "bg-white"
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold ${
                    s.chiuso
                      ? "bg-slate-200 text-slate-500"
                      : "bg-blue-50 text-blue-700"
                  }`}>
                    {SHORT[day]}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold capitalize ${
                      s.chiuso ? "text-slate-500" : "text-slate-800"
                    }`}>
                      {day}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {s.chiuso ? "Giornata chiusa" : "Giornata aperta"}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={!s.chiuso}
                  aria-label={`${s.chiuso ? "Apri" : "Chiudi"} ${day}`}
                  onClick={() => toggleChiuso(day, s.chiuso)}
                  className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    s.chiuso
                      ? "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                      : "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300"
                  }`}
                >
                  <span className={`relative h-4 w-7 rounded-full transition ${
                    s.chiuso ? "bg-slate-300" : "bg-blue-600"
                  }`}>
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition ${
                      s.chiuso ? "left-0.5" : "left-3.5"
                    }`} />
                  </span>
                  {s.chiuso ? "Chiuso" : "Aperto"}
                </button>
              </div>

              {s.chiuso ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs font-medium text-slate-400">
                    Questo giorno non sarà disponibile.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 p-4">
                  <TimeRange
                    label="Prima fascia"
                    start={s.apertura1}
                    end={s.chiusura1}
                    onStart={(value) => updateDay(day, { apertura1: value })}
                    onEnd={(value) => updateDay(day, { chiusura1: value })}
                  />

                  {hasSecond ? (
                    <TimeRange
                      label="Seconda fascia"
                      start={s.apertura2}
                      end={s.chiusura2}
                      onStart={(value) => updateDay(day, { apertura2: value })}
                      onEnd={(value) => updateDay(day, { chiusura2: value })}
                      removable
                      onRemove={() => rimuoviSeconda(day)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => aggiungiSeconda(day)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-3 py-2.5 text-xs font-semibold text-slate-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Aggiungi seconda fascia
                    </button>
                  )}

                  {overlap && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium leading-4 text-amber-700">
                      Le fasce si sovrappongono. Verranno unificate automaticamente al salvataggio.
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TimeRange({
  label,
  start,
  end,
  onStart,
  onEnd,
  removable = false,
  onRemove,
}: {
  label: string;
  start: string;
  end: string;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  removable?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {label}
        </span>
        {removable && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Rimuovi seconda fascia"
            className="rounded-lg p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
            <Check className="h-3 w-3" />
            Orario
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TimeInput value={start} onChange={onStart} label="Apertura" />
        <span className="pt-5 text-sm font-medium text-slate-300">—</span>
        <TimeInput value={end} onChange={onEnd} label="Chiusura" />
      </div>
    </div>
  );
}

function TimeInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium text-slate-400">{label}</span>
      <div className="relative">
        <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="h-11 w-full min-w-0 appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-2 text-base font-semibold tracking-tight text-slate-800 outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 [color-scheme:light]"
        />
      </div>
    </label>
  );
}
