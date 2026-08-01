"use client";

import { useState, useEffect } from "react";
import { MapPin, Globe } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { Field, SaveBar } from "./ModuleFields";

type Props = { storeId: string };

export default function PosizioneModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ indirizzo: "", citta: "", cap: "", provincia: "", coordinate: "" });
  const [original, setOriginal] = useState({ ...form });

  useEffect(() => {
    fetch(`/api/merchant/stores/${storeId}/settings`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const s = json.data.settings;
          const vals = {
            indirizzo: s.indirizzo ?? "",
            citta: s.citta ?? "",
            cap: s.cap ?? "",
            provincia: s.provincia ?? "",
            coordinate: s.coordinate ?? "",
          };
          setForm(vals);
          setOriginal({ ...vals });
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
    setOriginal({ ...form });
    setSaving(false);
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(original);

  if (loading) {
    return (
      <ModuleShell icon={<MapPin className="h-4 w-4" />} title="Posizione" subtitle="Caricamento..." id="posizione">
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell icon={<MapPin className="h-4 w-4" />} title="Posizione" subtitle="Indirizzo, città, mappa e coordinate" id="posizione">
      <div className="space-y-4">
        <Field label="Indirizzo" value={form.indirizzo} onChange={(v) => setForm((f) => ({ ...f, indirizzo: v }))} placeholder="Via/Corso/Piazza, numero civico" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Città" value={form.citta} onChange={(v) => setForm((f) => ({ ...f, citta: v }))} />
          <Field label="CAP" value={form.cap} onChange={(v) => setForm((f) => ({ ...f, cap: v }))} maxLength={5} />
          <Field label="Provincia" value={form.provincia} onChange={(v) => setForm((f) => ({ ...f, provincia: v }))} maxLength={2} placeholder="MI" />
        </div>
        <Field label="Coordinate mappa (facoltative)" value={form.coordinate} onChange={(v) => setForm((f) => ({ ...f, coordinate: v }))} placeholder="45.4642, 9.1900" />
        <SaveBar saving={saving} onSave={handleSave} dirty={dirty} />
      </div>
    </ModuleShell>
  );
}
