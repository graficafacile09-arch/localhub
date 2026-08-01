"use client";

import { useState, useEffect } from "react";
import { Tag, Plus, X } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { Field, TextArea, SaveBar } from "./ModuleFields";

type Props = { storeId: string };

type Offerta = {
  id: string;
  titolo: string;
  descrizione: string;
  prezzo_originale: string;
  prezzo_offerta: string;
  valido_dal: string;
  valido_al: string;
};

function nuovaOfferta(): Offerta {
  return { id: crypto.randomUUID(), titolo: "", descrizione: "", prezzo_originale: "", prezzo_offerta: "", valido_dal: "", valido_al: "" };
}

export default function OfferteModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [offerte, setOfferte] = useState<Offerta[]>([]);

  useEffect(() => {
    fetch(`/api/merchant/stores/${storeId}/settings`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const raw = (json.data.settings.data as Record<string, unknown>)?.offerte as Offerta[] ?? [];
          setOfferte(raw.length > 0 ? raw : [nuovaOfferta()]);
        }
        setLoading(false);
      });
  }, [storeId]);

  function updateOfferta(id: string, patch: Partial<Offerta>) {
    setOfferte((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function removeOfferta(id: string) {
    setOfferte((prev) => prev.filter((o) => o.id !== id));
  }

  function addOfferta() {
    setOfferte((prev) => [...prev, nuovaOfferta()]);
  }

  async function handleSave() {
    setSaving(true);
    const attive = offerte.filter((o) => o.titolo.trim());
    await fetch(`/api/merchant/stores/${storeId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { offerte: attive } }),
    });
    setSaving(false);
  }

  if (loading) {
    return (
      <ModuleShell icon={<Tag className="h-4 w-4" />} title="Offerte" subtitle="Caricamento..." id="offerte">
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell icon={<Tag className="h-4 w-4" />} title="Offerte" subtitle="Offerte e promozioni attive" id="offerte">
      <div className="space-y-4">
        {offerte.map((offerta) => (
          <div key={offerta.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Offerta</span>
              <button type="button" onClick={() => removeOfferta(offerta.id)} className="text-red-400 hover:text-red-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="Titolo" value={offerta.titolo} onChange={(v) => updateOfferta(offerta.id, { titolo: v })} placeholder="es. Sconto 20% su tutto" />
              <TextArea label="Descrizione" value={offerta.descrizione} onChange={(v) => updateOfferta(offerta.id, { descrizione: v })} rows={2} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Prezzo originale" value={offerta.prezzo_originale} onChange={(v) => updateOfferta(offerta.id, { prezzo_originale: v })} placeholder="€ 50.00" />
                <Field label="Prezzo offerta" value={offerta.prezzo_offerta} onChange={(v) => updateOfferta(offerta.id, { prezzo_offerta: v })} placeholder="€ 35.00" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Valido dal" value={offerta.valido_dal} onChange={(v) => updateOfferta(offerta.id, { valido_dal: v })} type="date" />
                <Field label="Valido al" value={offerta.valido_al} onChange={(v) => updateOfferta(offerta.id, { valido_al: v })} type="date" />
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={addOfferta} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-500 transition hover:border-blue-300 hover:text-blue-600">
          <Plus className="h-4 w-4" /> Aggiungi offerta
        </button>
        <SaveBar saving={saving} onSave={handleSave} dirty />
      </div>
    </ModuleShell>
  );
}
