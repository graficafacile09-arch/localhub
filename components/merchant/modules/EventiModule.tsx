"use client";

import { useState, useEffect } from "react";
import { Calendar, Plus, X } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { Field, TextArea, SaveBar } from "./ModuleFields";

type Props = { storeId: string };

type Evento = {
  id: string;
  titolo: string;
  descrizione: string;
  data: string;
  ora: string;
  luogo: string;
};

function nuovoEvento(): Evento {
  return { id: crypto.randomUUID(), titolo: "", descrizione: "", data: "", ora: "", luogo: "" };
}

export default function EventiModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventi, setEventi] = useState<Evento[]>([]);

  useEffect(() => {
    fetch(`/api/merchant/stores/${storeId}/settings`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const raw = (json.data.settings.data as Record<string, unknown>)?.eventi as Evento[] ?? [];
          setEventi(raw.length > 0 ? raw : [nuovoEvento()]);
        }
        setLoading(false);
      });
  }, [storeId]);

  function updateEvento(id: string, patch: Partial<Evento>) {
    setEventi((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeEvento(id: string) {
    setEventi((prev) => prev.filter((e) => e.id !== id));
  }

  function addEvento() {
    setEventi((prev) => [...prev, nuovoEvento()]);
  }

  async function handleSave() {
    setSaving(true);
    const attivi = eventi.filter((e) => e.titolo.trim());
    await fetch(`/api/merchant/stores/${storeId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { eventi: attivi } }),
    });
    setSaving(false);
  }

  if (loading) {
    return (
      <ModuleShell icon={<Calendar className="h-4 w-4" />} title="Eventi" subtitle="Caricamento..." id="eventi">
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell icon={<Calendar className="h-4 w-4" />} title="Eventi" subtitle="Eventi in programma" id="eventi">
      <div className="space-y-4">
        {eventi.map((evento) => (
          <div key={evento.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Evento</span>
              <button type="button" onClick={() => removeEvento(evento.id)} className="text-red-400 hover:text-red-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="Titolo" value={evento.titolo} onChange={(v) => updateEvento(evento.id, { titolo: v })} placeholder="es. Degustazione vini" />
              <TextArea label="Descrizione" value={evento.descrizione} onChange={(v) => updateEvento(evento.id, { descrizione: v })} rows={2} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Data" value={evento.data} onChange={(v) => updateEvento(evento.id, { data: v })} type="date" />
                <Field label="Ora" value={evento.ora} onChange={(v) => updateEvento(evento.id, { ora: v })} type="time" />
                <Field label="Luogo" value={evento.luogo} onChange={(v) => updateEvento(evento.id, { luogo: v })} placeholder="es. Presso il negozio" />
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={addEvento} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-500 transition hover:border-blue-300 hover:text-blue-600">
          <Plus className="h-4 w-4" /> Aggiungi evento
        </button>
        <SaveBar saving={saving} onSave={handleSave} dirty />
      </div>
    </ModuleShell>
  );
}
