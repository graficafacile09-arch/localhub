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
  "lunedì": "Lun",
  "martedì": "Mar",
  "mercoledì": "Mer",
  "giovedì": "Gio",
  "venerdì": "Ven",
  "sabato": "Sab",
  "domenica": "Dom",
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

  function toggleChiuso(day: string) {
    const current = orari[day] ?? EMPTY_DAY;
    onChange({
      ...orari,
      [day]: current.chiuso ? { ...EMPTY_DAY } : { ...CLOSED_DAY },
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
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Orari di apertura</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Parti da un modello oppure imposta liberamente mattina e pomeriggio/sera.
            </p>
          </div>
          <button
            type="button"
            onClick={copiaDalLunedi}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
          >
            <Copy className="h-3.5 w-3.5" />
            Copia lunedì su tutta la settimana
          </button>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Modelli rapidi
          </p>
          <div className="flex flex-wrap gap-2">
            {ORARI_PRESET_LABELS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:scale-[0.98]"
              >
                {preset.nome}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            I modelli compilano automaticamente l'intera settimana. Puoi poi modificare ogni singolo giorno.
          </p>
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-xl bg-slate-100 p-1">
          {([
            ["tutti", "Tutta la settimana"],
            ["oggi", "Solo oggi"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
          <Clock3 className="h-3.5 w-3.5" />
          Orari in formato 24 ore
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden border-b border-slate-200 bg-slate-50 px-4 py-2.5 lg:grid lg:grid-cols-[190px_1fr_1fr] lg:gap-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Giorno</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Mattina</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Pomeriggio / sera</div>
        </div>

        <div className="divide-y divide-slate-200">
          {visibleDays.map((day) => {
            const s = orari[day] ?? EMPTY_DAY;
            const hasSecond = !!(s.apertura2 && s.chiusura2);
            const overlap = giornoHaSovrapposizioni(s);

            return (
              <section key={day} className={s.chiuso ? "bg-slate-50/70" : "bg-white"}>
                <div className="p-3 sm:p-4 lg:grid lg:grid-cols-[190px_1fr_1fr] lg:items-center lg:gap-4">
                  <div className="mb-3 flex items-center justify-between gap-3 lg:mb-0">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                        s.chiuso ? "bg-slate-200 text-slate-500" : "bg-blue-50 text-blue-700"
                      }`}>
                        {SHORT[day]}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold capitalize ${
                          s.chiuso ? "text-slate-500" : "text-slate-900"
                        }`}>{day}</p>
                        <p className="text-[11px] text-slate-400">
                          {s.chiuso ? "Chiuso" : "Aperto"}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={!s.chiuso}
                      aria-label={`${s.chiuso ? "Apri" : "Chiudi"} ${day}`}
                      onClick={() => toggleChiuso(day)}
                      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                        s.chiuso
                          ? "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                          : "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300"
                      }`}
                    >
                      <span className={`relative h-4 w-7 rounded-full ${
                        s.chiuso ? "bg-slate-300" : "bg-blue-600"
                      }`}>
                        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm ${
                          s.chiuso ? "left-0.5" : "left-3.5"
                        }`} />
                      </span>
                      {s.chiuso ? "Chiuso" : "Aperto"}
                    </button>
                  </div>

                  {s.chiuso ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-xs text-slate-400 lg:col-span-2">
                      Nessun orario inserito. Attiva la giornata per impostare le fasce.
                    </div>
                  ) : (
                    <>
                      <TimeRange
                        label="Mattina"
                        start={s.apertura1}
                        end={s.chiusura1}
                        onStart={(value) => updateDay(day, { apertura1: value })}
                        onEnd={(value) => updateDay(day, { chiusura1: value })}
                      />

                      <div className="mt-3 lg:mt-0">
                        {hasSecond ? (
                          <TimeRange
                            label="Pomeriggio / sera"
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
                            className="flex min-h-[76px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                          >
                            <Plus className="h-4 w-4" />
                            Aggiungi fascia pomeridiana / serale
                          </button>
                        )}
                        {overlap && (
                          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700">
                            Le fasce si sovrappongono: verranno unificate al salvataggio.
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-4 text-slate-500">
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span><strong className="text-slate-700">Impostazione libera:</strong> puoi cambiare qualsiasi fascia senza essere vincolato ai modelli.</span>
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
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-600">{label}</span>
        {removable && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Rimuovi fascia pomeridiana"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="text-[10px] font-medium text-slate-400">Dalle — alle</span>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <TimeInput value={start} onChange={onStart} label="Apertura" />
        <span className="pb-2 text-sm font-medium text-slate-300">—</span>
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
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-medium text-slate-400">{label}</span>
      <div className="relative">
        <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="h-11 w-full min-w-0 appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-2 text-base font-semibold text-slate-800 outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 [color-scheme:light]"
        />
      </div>
    </label>
  );
}
