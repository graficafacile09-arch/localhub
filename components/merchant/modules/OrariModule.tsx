"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { SaveBar, type StatoSalvataggio } from "./ModuleFields";
import type { Orari } from "@/types/negozio";
import { orariIniziali, normalizzaOrari } from "@/lib/orari";
import OrariEditor from "@/components/merchant/orari/OrariEditor";

type Props = { storeId: string };

export default function OrariModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orari, setOrari] = useState<Orari>(() => orariIniziali(null));
  const [original, setOriginal] = useState<string>("");
  const [messaggio, setMessaggio] = useState<StatoSalvataggio>(null);

  useEffect(() => {
    fetch(`/api/merchant/stores/${storeId}/settings`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const s = json.data.settings.orari;
          if (s && typeof s === "object") {
            const normalizzati = normalizzaOrari(s as Orari);
            setOrari(normalizzati);
            setOriginal(JSON.stringify(normalizzati));
          }
        }
        setLoading(false);
      });
  }, [storeId]);

  async function handleSave() {
    setSaving(true);
    setMessaggio(null);
    try {
      // Normalizza SEMPRE prima dell'invio (doppio livello di sicurezza con
      // la normalizzazione lato backend): niente sovrapposizioni in DB.
      const body = { orari: normalizzaOrari(orari) };
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setMessaggio({
          tipo: "errore",
          testo: json?.error?.message ?? "Salvataggio non riuscito. Riprova.",
        });
        return;
      }
      setOriginal(JSON.stringify(body.orari));
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

  return (
    <ModuleShell icon={<Clock className="h-4 w-4" />} title="Orari" subtitle="Orari di apertura del negozio" id="orari">
      <div className="space-y-4">
        <OrariEditor orari={orari} onChange={setOrari} />
        <SaveBar saving={saving} onSave={handleSave} dirty={dirty} messaggio={messaggio} />
      </div>
    </ModuleShell>
  );
}