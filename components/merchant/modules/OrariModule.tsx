"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Copy } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { SaveBar, type StatoSalvataggio } from "./ModuleFields";
import { DAYS, EMPTY_DAY, CLOSED_DAY } from "@/types/negozio";
import type { DaySchedule, Orari } from "@/types/negozio";
import { orariIniziali, ORARI_PRESET_LABELS, ORARI_PRESETS } from "@/lib/orari";

type Props = { storeId: string };

const SHORT: Record<string, string> = {
  lunedì: "Lun", martedì: "Mar", mercoledì: "Mer",
  giovedì: "Gio", venerdì: "Ven", sabato: "Sab", domenica: "Dom",
};

function cloneDay(d: DaySchedule): DaySchedule {
  return { ...d };
}

export default function OrariModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orari, setOrari] = useState<Orari>(() => orariIniziali(null));
  const [original, setOriginal] = useState<string>("");
  const [orariTab, setOrariTab] = useState<"tutti" | "oggi">("tutti");
  const [messaggio, setMessaggio] = useState<StatoSalvataggio>(null);

  useEffect(() => {
    fetch(`/api/merchant/stores/${storeId}/settings`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const s = json.data.settings.orari;
          if (s && typeof s === "object") {
            setOrari(s);
            setOriginal(JSON.stringify(s));
          }
        }
        setLoading(false);
      });
  }, [storeId]);

  function updateDay(day: string, patch: Partial<DaySchedule>) {
    const current = orari[day] ? cloneDay(orari[day]) : { ...EMPTY_DAY };
    setOrari((prev) => ({ ...prev, [day]: { ...current, ...patch } }));
  }

  function toggleChiuso(day: string, aperto: boolean) {
    setOrari((prev) => ({
      ...prev,
      [day]: aperto ? { ...EMPTY_DAY } : { ...CLOSED_DAY },
    }));
  }

  const copiaOrariLunedi = useCallback(() => {
    const lunedi = orari["lunedì"] ?? { ...EMPTY_DAY };
    const nuovi: Orari = {};
    for (const d of DAYS) {
      nuovi[d] = d === "lunedì" ? { ...lunedi } : { ...lunedi };
    }
    setOrari(nuovi);
  }, [orari]);

  function applyPreset(preset: keyof typeof ORARI_PRESETS) {
    setOrari(ORARI_PRESETS[preset]);
  }

  async function handleSave() {
    setSaving(true);
    setMessaggio(null);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orari }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setMessaggio({
          tipo: "errore",
          testo: json?.error?.message ?? "Salvataggio non riuscito. Riprova.",
        });
        return;
      }
      setOriginal(JSON.stringify(orari));
      setMessaggio({ tipo: "ok", testo: "Orari salvati." });
    } catch {
      setMessaggio({ tipo: "errore", testo: "Errore di rete. Riprova." });
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify(orari) !== original;

  // Quando l'utente riprende a modificare, nasconde l'esito precedente.
  useEffect(() => {
    if (dirty) setMessaggio(null);
  }, [dirty]);

  if (loading) {
    return (
      <ModuleShell icon={<Clock className="h-4 w-4" />} title="Orari" subtitle="Caricamento..." id="orari">
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const visibleDays = orariTab === "tutti" ? DAYS : [DAYS[todayIndex]];

  return (
    <ModuleShell icon={<Clock className="h-4 w-4" />} title="Orari" subtitle="Orari di apertura del negozio" id="orari">
      <div className="space-y-4">
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
            <button type="button" onClick={() => setOrariTab("tutti")}
              className={`rounded-full px-3 py-1 text-[10px] font-semibold transition ${orariTab === "tutti" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              Tutti i giorni
            </button>
            <button type="button" onClick={() => setOrariTab("oggi")}
              className={`rounded-full px-3 py-1 text-[10px] font-semibold transition ${orariTab === "oggi" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              Oggi
            </button>
          </div>
          <button type="button" onClick={copiaOrariLunedi}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500 transition hover:border-blue-300 hover:text-blue-600">
            <Copy className="h-3 w-3" /> Copia dal lunedì
          </button>
        </div>

        <div className="space-y-1">
          {visibleDays.map((day) => {
            const s = orari[day] ?? EMPTY_DAY;
            const hasSecond = !!(s.apertura2 && s.chiusura2);
            return (
              <div key={day} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 transition ${s.chiuso ? "bg-slate-50/70" : "bg-white"}`}>
                <label className="flex w-14 shrink-0 items-center gap-1.5">
                  <input type="checkbox" checked={!s.chiuso} onChange={(e) => toggleChiuso(day, e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400" />
                  <span className={`text-[11px] font-semibold ${s.chiuso ? "text-slate-400" : "text-slate-600"}`}>{SHORT[day]}</span>
                </label>
                {s.chiuso ? (
                  <span className="text-[10px] text-slate-400 italic">Chiuso</span>
                ) : (
                  <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-12 shrink-0 text-[9px] font-medium uppercase tracking-wider text-slate-400">Mattina</span>
                      <input type="time" value={s.apertura1} onChange={(e) => updateDay(day, { apertura1: e.target.value })}
                        className="h-6 min-w-0 flex-1 rounded border border-slate-100 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300" />
                      <span className="text-[10px] text-slate-300">&ndash;</span>
                      <input type="time" value={s.chiusura1} onChange={(e) => updateDay(day, { chiusura1: e.target.value })}
                        className="h-6 min-w-0 flex-1 rounded border border-slate-100 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300" />
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-12 shrink-0 text-[9px] font-medium uppercase tracking-wider text-slate-400">Pomeriggio</span>
                      {hasSecond ? (
                        <>
                          <input type="time" value={s.apertura2} onChange={(e) => updateDay(day, { apertura2: e.target.value })}
                            className="h-6 min-w-0 flex-1 rounded border border-slate-100 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300" />
                          <span className="text-[10px] text-slate-300">&ndash;</span>
                          <input type="time" value={s.chiusura2} onChange={(e) => updateDay(day, { chiusura2: e.target.value })}
                            className="h-6 min-w-0 flex-1 rounded border border-slate-100 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300" />
                        </>
                      ) : (
                        <button type="button" onClick={() => updateDay(day, { apertura2: "15:00", chiusura2: "19:00" })}
                          className="rounded border border-dashed border-slate-200 px-2 py-0.5 text-[10px] text-slate-400 transition hover:border-blue-300 hover:text-blue-500">
                          + Aggiungi pomeriggio
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <SaveBar saving={saving} onSave={handleSave} dirty={dirty} messaggio={messaggio} />
      </div>
    </ModuleShell>
  );
}
