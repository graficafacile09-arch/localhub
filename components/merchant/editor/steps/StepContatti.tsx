"use client";

import { useEffect, useState } from "react";
import { MapPin, Phone, Share2, Clock, Copy } from "lucide-react";
import { Field, SaveBar } from "@/components/merchant/modules/ModuleFields";
import {
  DAYS,
  EMPTY_DAY,
  CLOSED_DAY,
  type DaySchedule,
  type Orari,
} from "@/types/negozio";
import { orariIniziali, ORARI_PRESET_LABELS, ORARI_PRESETS } from "@/lib/orari";
import type { StepProps } from "../editor-steps";

const SHORT: Record<string, string> = {
  lunedì: "Lun",
  martedì: "Mar",
  mercoledì: "Mer",
  giovedì: "Gio",
  venerdì: "Ven",
  sabato: "Sab",
  domenica: "Dom",
};

type ContattiForm = {
  indirizzo: string;
  cap: string;
  citta: string;
  provincia: string;
  coordinate: string;
  telefono: string;
  whatsapp: string;
  email_negozio: string;
  sito_web: string;
  facebook: string;
  instagram: string;
  tiktok: string;
  youtube: string;
};

export default function StepContatti({ storeId, store, onDataChanged }: StepProps) {
  const [form, setForm] = useState<ContattiForm>(() => ({
    indirizzo: store?.indirizzo ?? "",
    cap: store?.cap ?? "",
    citta: store?.citta ?? "",
    provincia: store?.provincia ?? "",
    coordinate: store?.coordinate ?? "",
    telefono: store?.telefono ?? "",
    whatsapp: store?.whatsapp ?? "",
    email_negozio: store?.email_negozio ?? "",
    sito_web: store?.sito_web ?? "",
    facebook: store?.facebook ?? "",
    instagram: store?.instagram ?? "",
    tiktok: store?.tiktok ?? "",
    youtube: store?.youtube ?? "",
  }));
  /** Id profilo attività (da data.tipo_attivita), per il preset orari automatico. */
  const profiloId =
    typeof store?.data?.tipo_attivita === "string" ? (store.data.tipo_attivita as string) : null;

  const [orari, setOrari] = useState<Orari>(() =>
    orariIniziali(store?.orari, null, profiloId)
  );
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = store;
    const vals: ContattiForm = {
      indirizzo: s?.indirizzo ?? "",
      cap: s?.cap ?? "",
      citta: s?.citta ?? "",
      provincia: s?.provincia ?? "",
      coordinate: s?.coordinate ?? "",
      telefono: s?.telefono ?? "",
      whatsapp: s?.whatsapp ?? "",
      email_negozio: s?.email_negozio ?? "",
      sito_web: s?.sito_web ?? "",
      facebook: s?.facebook ?? "",
      instagram: s?.instagram ?? "",
      tiktok: s?.tiktok ?? "",
      youtube: s?.youtube ?? "",
    };
    const sProfiloId =
      typeof s?.data?.tipo_attivita === "string" ? (s.data.tipo_attivita as string) : null;
    const o = orariIniziali(s?.orari, null, sProfiloId);
    setForm(vals);
    setOrari(o);
    setOriginal(JSON.stringify({ ...vals, orari: o }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const dirty = JSON.stringify({ ...form, orari }) !== original;

  function set<K extends keyof ContattiForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateDay(day: string, patch: Partial<DaySchedule>) {
    setOrari((prev) => {
      const current = prev[day] ? { ...prev[day] } : { ...EMPTY_DAY };
      return { ...prev, [day]: { ...current, ...patch } };
    });
  }

  function toggleChiuso(day: string, aperto: boolean) {
    setOrari((prev) => ({
      ...prev,
      [day]: aperto ? { ...EMPTY_DAY } : { ...CLOSED_DAY },
    }));
  }

  function copiaDalLunedi() {
    const lunedi = orari["lunedì"] ?? { ...EMPTY_DAY };
    const nuovi: Orari = {};
    for (const d of DAYS) nuovi[d] = { ...lunedi };
    setOrari(nuovi);
  }

  function applyPreset(preset: keyof typeof ORARI_PRESETS) {
    setOrari(ORARI_PRESETS[preset]);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, orari }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Salvataggio non riuscito.");
        return;
      }
      setOriginal(JSON.stringify({ ...form, orari }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onDataChanged();
    } catch {
      setError("Errore di connessione durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Posizione */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
          <MapPin className="h-4 w-4 text-blue-500" /> Dove ti troviamo
        </h3>
        <div className="space-y-4">
          <Field
            label="Indirizzo"
            value={form.indirizzo}
            onChange={(v) => set("indirizzo", v)}
            placeholder="Via/Corso/Piazza, numero civico"
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Comune" value={form.citta} onChange={(v) => set("citta", v)} />
            <Field label="CAP" value={form.cap} onChange={(v) => set("cap", v)} maxLength={5} />
            <Field label="Provincia" value={form.provincia} onChange={(v) => set("provincia", v)} maxLength={2} placeholder="CS" />
          </div>
        </div>
      </section>

      {/* Contatti */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
          <Phone className="h-4 w-4 text-blue-500" /> Contatti
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telefono" value={form.telefono} onChange={(v) => set("telefono", v)} type="tel" />
          <Field label="WhatsApp" value={form.whatsapp} onChange={(v) => set("whatsapp", v)} type="tel" placeholder="+39 333 1234567" />
          <Field label="Email" value={form.email_negozio} onChange={(v) => set("email_negozio", v)} type="email" />
          <Field label="Sito web" value={form.sito_web} onChange={(v) => set("sito_web", v)} type="url" placeholder="https://..." />
        </div>
      </section>

      {/* Social */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
          <Share2 className="h-4 w-4 text-blue-500" /> Social
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Facebook" value={form.facebook} onChange={(v) => set("facebook", v)} placeholder="nome.negozio" />
          <Field label="Instagram" value={form.instagram} onChange={(v) => set("instagram", v)} placeholder="nome.negozio" />
          <Field label="TikTok" value={form.tiktok} onChange={(v) => set("tiktok", v)} placeholder="nome.negozio" />
          <Field label="YouTube" value={form.youtube} onChange={(v) => set("youtube", v)} placeholder="nome.negozio" />
        </div>
      </section>

      {/* Orari */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Clock className="h-4 w-4 text-blue-500" /> Orari di apertura
          </h3>
          <button
            type="button"
            onClick={copiaDalLunedi}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500 transition hover:border-blue-300 hover:text-blue-600"
          >
            <Copy className="h-3 w-3" /> Copia dal lunedì
          </button>
        </div>

        {/* Preset di orari per tipo di attività (un click) */}
        <div className="mb-3 flex flex-wrap gap-2">
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
        <div className="space-y-1">
          {DAYS.map((day) => {
            const scheda = orari[day] ?? EMPTY_DAY;
            return (
              <div key={day} className={`rounded-lg px-3 py-1.5 ${scheda.chiuso ? "bg-slate-50" : "bg-white"}`}>
                <div className="flex items-center gap-3">
                  <label className="flex w-14 shrink-0 items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={!scheda.chiuso}
                      onChange={(e) => toggleChiuso(day, e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
                    />
                    <span className={`text-[11px] font-semibold ${scheda.chiuso ? "text-slate-400" : "text-slate-700"}`}>
                      {SHORT[day]}
                    </span>
                  </label>
                  {scheda.chiuso ? (
                    <span className="text-[10px] italic text-slate-400">Chiuso</span>
                  ) : (
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <input
                        type="time"
                        value={scheda.apertura1}
                        onChange={(e) => updateDay(day, { apertura1: e.target.value })}
                        className="h-7 rounded border border-slate-100 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300"
                      />
                      <span className="text-[10px] text-slate-300">–</span>
                      <input
                        type="time"
                        value={scheda.chiusura1}
                        onChange={(e) => updateDay(day, { chiusura1: e.target.value })}
                        className="h-7 rounded border border-slate-100 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300"
                      />
                      {(scheda.apertura2 || scheda.chiusura2) ? (
                        <>
                          <span className="text-[10px] text-slate-300">&amp;</span>
                          <input
                            type="time"
                            value={scheda.apertura2}
                            onChange={(e) => updateDay(day, { apertura2: e.target.value })}
                            className="h-7 rounded border border-slate-100 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300"
                          />
                          <span className="text-[10px] text-slate-300">–</span>
                          <input
                            type="time"
                            value={scheda.chiusura2}
                            onChange={(e) => updateDay(day, { chiusura2: e.target.value })}
                            className="h-7 rounded border border-slate-100 bg-slate-50 px-1.5 text-[11px] text-slate-700 outline-none focus:border-blue-300"
                          />
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => updateDay(day, { apertura2: "15:00", chiusura2: "19:00" })}
                          className="text-[10px] font-medium text-slate-400 transition hover:text-blue-500"
                        >
                          + seconda fascia
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">
          Contatti e orari salvati.
        </p>
      )}

      <SaveBar saving={saving} onSave={handleSave} dirty={dirty} />
    </div>
  );
}
