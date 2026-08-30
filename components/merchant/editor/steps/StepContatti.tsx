"use client";

import { useEffect, useState } from "react";
import { MapPin, Phone, Share2, Clock } from "lucide-react";
import { Field, SaveBar } from "@/components/merchant/modules/ModuleFields";
import type { Orari } from "@/types/negozio";
import { orariIniziali, normalizzaOrari } from "@/lib/orari";
import type { StepProps } from "../editor-steps";
import OrariEditor from "@/components/merchant/orari/OrariEditor";

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
    normalizzaOrari(orariIniziali(store?.orari, null, profiloId))
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
    const o = normalizzaOrari(orariIniziali(s?.orari, null, sProfiloId));
    setForm(vals);
    setOrari(o);
    setOriginal(JSON.stringify({ ...vals, orari: o }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const dirty = JSON.stringify({ ...form, orari }) !== original;

  function set<K extends keyof ContattiForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Normalizza SEMPRE prima dell'invio (stessa logica del backend):
      // niente fasce sovrapposte nei dati persistiti.
      const orariNormalizzati = normalizzaOrari(orari);
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, orari: orariNormalizzati }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? "Salvataggio non riuscito.");
        return;
      }
      const normalizzato = JSON.stringify({ ...form, orari: orariNormalizzati });
      setOriginal(normalizzato);
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

      {/* Orari — componente universale condiviso (idem per QUALSIASI attività) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
          <Clock className="h-4 w-4 text-blue-500" /> Orari di apertura
        </h3>
        <OrariEditor orari={orari} onChange={setOrari} />
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