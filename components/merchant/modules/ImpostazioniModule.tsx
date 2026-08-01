"use client";

import { useState, useEffect } from "react";
import { Settings, Eye, Smartphone, MapPin, Clock, MessageCircle, Star, Palette, Tag } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { Toggle, TagsInput, SaveBar } from "./ModuleFields";

type Props = { storeId: string };

export default function ImpostazioniModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    attivo: true,
    mostra_telefono: true,
    mostra_indirizzo: true,
    mostra_orari: true,
    accetta_whatsapp: true,
    in_evidenza: false,
    colori: { primary: "#2563eb", secondary: "#f8fafc", accent: "#f59e0b" },
    parole_chiave: [] as string[],
  });
  const [original, setOriginal] = useState("");

  useEffect(() => {
    fetch(`/api/merchant/stores/${storeId}/settings`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const s = json.data.settings;
          const vals = {
            attivo: s.attivo ?? true,
            mostra_telefono: s.mostra_telefono ?? true,
            mostra_indirizzo: s.mostra_indirizzo ?? true,
            mostra_orari: s.mostra_orari ?? true,
            accetta_whatsapp: s.accetta_whatsapp ?? true,
            in_evidenza: s.in_evidenza ?? false,
            colori: s.colori ?? { primary: "#2563eb", secondary: "#f8fafc", accent: "#f59e0b" },
            parole_chiave: s.parole_chiave ?? [],
          };
          setForm(vals);
          setOriginal(JSON.stringify(vals));
        }
        setLoading(false);
      });
  }, [storeId]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/merchant/stores/${storeId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setOriginal(JSON.stringify(form));
    setSaving(false);
  }

  const dirty = JSON.stringify(form) !== original;

  if (loading) {
    return (
      <ModuleShell icon={<Settings className="h-4 w-4" />} title="Impostazioni" subtitle="Caricamento..." id="impostazioni">
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell icon={<Settings className="h-4 w-4" />} title="Impostazioni" subtitle="Visibilità, preferenze e colori brand" id="impostazioni">
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Visibilità</p>
          <Toggle icon={<Eye className="h-4 w-4 text-slate-500" />} label="Negozio attivo" description="Il negozio è visibile nelle ricerche pubbliche" checked={form.attivo} onChange={(v) => setForm((f) => ({ ...f, attivo: v }))} />
          <Toggle icon={<Smartphone className="h-4 w-4 text-slate-500" />} label="Mostra numero telefono" description="Mostra il telefono nella pagina pubblica" checked={form.mostra_telefono} onChange={(v) => setForm((f) => ({ ...f, mostra_telefono: v }))} />
          <Toggle icon={<MapPin className="h-4 w-4 text-slate-500" />} label="Mostra indirizzo" description="Mostra l'indirizzo nella pagina pubblica" checked={form.mostra_indirizzo} onChange={(v) => setForm((f) => ({ ...f, mostra_indirizzo: v }))} />
          <Toggle icon={<Clock className="h-4 w-4 text-slate-500" />} label="Mostra orari" description="Mostra la sezione orari nella pagina pubblica" checked={form.mostra_orari} onChange={(v) => setForm((f) => ({ ...f, mostra_orari: v }))} />
          <Toggle icon={<MessageCircle className="h-4 w-4 text-slate-500" />} label="Accetta WhatsApp" description="Permetti ai clienti di contattarti via WhatsApp" checked={form.accetta_whatsapp} onChange={(v) => setForm((f) => ({ ...f, accetta_whatsapp: v }))} />
          <Toggle icon={<Star className="h-4 w-4 text-slate-500" />} label="In evidenza" description="Il negozio appare nella sezione In Evidenza in homepage" checked={form.in_evidenza} onChange={(v) => setForm((f) => ({ ...f, in_evidenza: v }))} />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Colori del brand</p>
          <div className="flex flex-wrap gap-4">
            <ColorPicker label="Primario" value={form.colori.primary} onChange={(v) => setForm((f) => ({ ...f, colori: { ...f.colori, primary: v } }))} />
            <ColorPicker label="Secondario" value={form.colori.secondary} onChange={(v) => setForm((f) => ({ ...f, colori: { ...f.colori, secondary: v } }))} />
            <ColorPicker label="Accento" value={form.colori.accent} onChange={(v) => setForm((f) => ({ ...f, colori: { ...f.colori, accent: v } }))} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Parole chiave</p>
          <TagsInput value={form.parole_chiave} onChange={(v) => setForm((f) => ({ ...f, parole_chiave: v }))} placeholder="Digita una parola chiave e premi Invio..." />
        </div>

        <SaveBar saving={saving} onSave={handleSave} dirty={dirty} />
      </div>
    </ModuleShell>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="relative h-10 w-10 overflow-hidden rounded-xl border-2 border-slate-200">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute -left-1 -top-1 h-12 w-12 cursor-pointer border-none" />
      </div>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-[10px] text-slate-600 outline-none focus:border-blue-500" />
    </label>
  );
}
