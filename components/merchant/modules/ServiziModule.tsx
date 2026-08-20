"use client";

import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { TagsInput, SaveBar, type StatoSalvataggio } from "./ModuleFields";

type Props = { storeId: string };

export default function ServiziModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [servizi, setServizi] = useState<string[]>([]);
  const [original, setOriginal] = useState<string[]>([]);
  const [messaggio, setMessaggio] = useState<StatoSalvataggio>(null);

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
    setMessaggio(null);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servizi }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setMessaggio({
          tipo: "errore",
          testo: json?.error?.message ?? "Salvataggio non riuscito. Riprova.",
        });
        return;
      }
      setOriginal([...servizi]);
      setMessaggio({ tipo: "ok", testo: "Modifiche salvate." });
    } catch {
      setMessaggio({ tipo: "errore", testo: "Errore di rete. Riprova." });
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify(servizi) !== JSON.stringify(original);

  // Quando l'utente riprende a modificare, nasconde l'esito precedente.
  useEffect(() => {
    if (dirty) setMessaggio(null);
  }, [dirty]);

  if (loading) {
    return (
      <ModuleShell icon={<Sparkles className="h-4 w-4" />} title="Servizi" subtitle="Caricamento..." id="servizi">
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell icon={<Sparkles className="h-4 w-4" />} title="Servizi" subtitle="Servizi offerti dal negozio (es. Consegna a domicilio, Parcheggio, Wi-Fi)" id="servizi">
      <TagsInput value={servizi} onChange={setServizi} placeholder="Digita un servizio e premi Invio..." />
      <SaveBar saving={saving} onSave={handleSave} dirty={dirty} messaggio={messaggio} />
    </ModuleShell>
  );
}
