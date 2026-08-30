"use client";

import { useState, useCallback } from "react";
import { Copy } from "lucide-react";
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

/**
 * ORARI EDITOR — UNICA UI universale per la gestione della settimana.
 *
 * Componente CONTROLLATO e condiviso da tutti i punti di ingresso della
 * gestione orari (modulo Orari del pannello merchant, step Contatti del
 * wizard/editor, ecc.). La logica della griglia, dei preset, di
 * "Copia dal lunedì" e della seconda fascia vive QUI una sola volta:
 * non esistono più due implementazioni duplicate da sincronizzare.
 *
 * La normalizzazione delle fasce (niente sovrapposizioni) avviene:
 *  - in UI: il pulsante "+ seconda fascia" propone una fascia che parte
 *    esattamente alla chiusura della prima (mai sovrapposta, requisito
 *    livello A), e un avviso segnala i giorni con fasce sovrapposte;
 *  - al salvataggio (nei parent) e nel backend (route settings) via
 *    `normalizzaOrari`.
 * Sia questo componente sia i preset usano la stessa fonte: lib/orari.ts.
 */

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
    // normalizza prima così `suggerisciSecondaFascia` legge una chiusura pulita
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
      {/* Preset rapidi (stessa fonte per tutte le attività) */}
      <div className="mb-2 flex flex-wrap gap-2">
        {ORARI_PRESET_LABELS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => applyPreset(preset.id)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600"
          >
            {preset.nome}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setTab("tutti")}
            className={`rounded-full px-3 py-1 text-[10px] font-semibold transition ${
              tab === "tutti"
                ? "bg-blue-100 text-blue-700"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            Tutti i giorni
          </button>
          <button
            type="button"
            onClick={() => setTab("oggi")}
            className={`rounded-full px-3 py-1 text-[10px] font-semibold transition ${
              tab === "oggi"
                ? "bg-blue-100 text-blue-700"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            Oggi
          </button>
        </div>
        <button
          type="button"
          onClick={copiaDalLunedi}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500 transition hover:border-blue-300 hover:text-blue-600"
        >
          <Copy className="h-3 w-3" /> Copia dal lunedì
        </button>
      </div>

      <div className="space-y-1">
        {visibleDays.map((day) => {
          const s = orari[day] ?? EMPTY_DAY;
          const hasSecond = !!(s.apertura2 && s.chiusura2);
          const overlap = giornoHaSovrapposizioni(s);
          return (
            <div
              key={day}
              className={`rounded-lg px-3 py-1.5 transition ${
                s.chiuso ? "bg-slate-50/70" : "bg-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <label className="flex w-14 shrink-0 items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={!s.chiuso}
                    onChange={(e) => toggleChiuso(day, e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
                  />
                  <span
                    className={`text-[11px] font-semibold ${
                      s.chiuso ? "text-slate-400" : "text-slate-600"
                    }`}
                  >
                    {SHORT[day]}
                  </span>
                </label>

                {s.chiuso ? (
                  <span className="text-[10px] italic text-slate-400">Chiuso</span>
                ) : (
                  <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-12 shrink-0 text-[9px] font-medium uppercase tracking-wider text-slate-400">
                        Mattina
                      </span>
                      <input
                        type="time"
                        value={s.apertura1}
                        onChange={(e) => updateDay(day, { apertura1: e.target.value })}
                        className="h-6 min-w-0 flex-1 rounded border border-slate-100 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300"
                      />
                      <span className="text-[10px] text-slate-300">&ndash;</span>
                      <input
                        type="time"
                        value={s.chiusura1}
                        onChange={(e) => updateDay(day, { chiusura1: e.target.value })}
                        className="h-6 min-w-0 flex-1 rounded border border-slate-100 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-12 shrink-0 text-[9px] font-medium uppercase tracking-wider text-slate-400">
                        Pomeriggio
                      </span>
                      {hasSecond ? (
                        <>
                          <input
                            type="time"
                            value={s.apertura2}
                            onChange={(e) => updateDay(day, { apertura2: e.target.value })}
                            className="h-6 min-w-0 flex-1 rounded border border-slate-100 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300"
                          />
                          <span className="text-[10px] text-slate-300">&ndash;</span>
                          <input
                            type="time"
                            value={s.chiusura2}
                            onChange={(e) => updateDay(day, { chiusura2: e.target.value })}
                            className="h-6 min-w-0 flex-1 rounded border border-slate-100 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300"
                          />
                          <button
                            type="button"
                            onClick={() => rimuoviSeconda(day)}
                            title="Rimuovi seconda fascia"
                            className="shrink-0 rounded px-1 text-[11px] text-slate-300 transition hover:text-red-500"
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => aggiungiSeconda(day)}
                          className="rounded border border-dashed border-slate-200 px-2 py-0.5 text-[10px] text-slate-400 transition hover:border-blue-300 hover:text-blue-500"
                        >
                          + seconda fascia
                        </button>
                      )}
                    </div>

                    {overlap && (
                      <p className="text-[9px] font-semibold text-amber-600">
                        Fasce sovrapposte: verranno unificate automaticamente al salvataggio.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}