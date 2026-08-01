"use client";

import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { TagsInput, SaveBar } from "./ModuleFields";

type Props = { storeId: string };

export default function ServiziModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [servizi, setServizi] = useState<string[]>([]);
  const [original, setOriginal] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/merchant/stores/${storeId}/settings`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const s = json.data.settings.servizi ?? [];
          setServizi(s);
          setOriginal([...s]);
        }
        setLoading(false);
      });
  }, [storeId]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/merchant/stores/${storeId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servizi }),
    });
    setOriginal([...servizi]);
    setSaving(false);
  }

  if (loading) {
    return (
      <ModuleShell icon={<Sparkles className="h-4 w-4" />} title="Servizi" subtitle="Caricamento..." id="servizi">
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  const dirty = JSON.stringify(servizi) !== JSON.stringify(original);

  return (
    <ModuleShell icon={<Sparkles className="h-4 w-4" />} title="Servizi" subtitle="Servizi offerti dal negozio (es. Consegna a domicilio, Parcheggio, Wi-Fi)" id="servizi">
      <TagsInput value={servizi} onChange={setServizi} placeholder="Digita un servizio e premi Invio..." />
      <SaveBar saving={saving} onSave={handleSave} dirty={dirty} />
    </ModuleShell>
  );
}
