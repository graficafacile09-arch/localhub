"use client";

import { useState, useEffect } from "react";
import { Bot } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { TextArea, TagsInput, SaveBar, type StatoSalvataggio } from "./ModuleFields";

type Props = { storeId: string };

export default function AiModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ istruzioni: "", domande_frequenti: [] as string[], tono: "" });
  const [original, setOriginal] = useState("");
  const [messaggio, setMessaggio] = useState<StatoSalvataggio>(null);

  useEffect(() => {
    fetch(`/api/merchant/stores/${storeId}/settings`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const aiData = (json.data.settings.data as Record<string, unknown>)?.ai_data as Record<string, unknown> ?? {};
          const vals = {
            istruzioni: (aiData.istruzioni as string) ?? "",
            domande_frequenti: (Array.isArray(aiData.domande_frequenti) ? aiData.domande_frequenti as string[] : []),
            tono: (aiData.tono as string) ?? "",
          };
          setForm(vals);
          setOriginal(JSON.stringify(vals));
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
        body: JSON.stringify({ data: { ai_data: form } }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setMessaggio({
          tipo: "errore",
          testo: json?.error?.message ?? "Salvataggio non riuscito. Riprova.",
        });
        return;
      }
      setOriginal(JSON.stringify(form));
      setMessaggio({ tipo: "ok", testo: "Modifiche salvate." });
    } catch {
      setMessaggio({ tipo: "errore", testo: "Errore di rete. Riprova." });
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify(form) !== original;

  // Quando l'utente riprende a modificare, nasconde l'esito precedente.
  useEffect(() => {
    if (dirty) setMessaggio(null);
  }, [dirty]);

  if (loading) {
    return (
      <ModuleShell icon={<Bot className="h-4 w-4" />} title="AI" subtitle="Caricamento..." id="ai">
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell icon={<Bot className="h-4 w-4" />} title="Assistente AI" subtitle="Dati per l'assistente AI del negozio" id="ai">
      <div className="space-y-4">
        <TextArea label="Istruzioni personalizzate" value={form.istruzioni}
          onChange={(v) => setForm((f) => ({ ...f, istruzioni: v }))} rows={4}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">Tono di voce</label>
            <select value={form.tono} onChange={(e) => setForm((f) => ({ ...f, tono: e.target.value }))}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Default</option>
              <option value="professionale">Professionale</option>
              <option value="amichevole">Amichevole</option>
              <option value="informale">Informale</option>
              <option value="entusiasta">Entusiasta</option>
            </select>
          </div>
        </div>
        <TagsInput value={form.domande_frequenti}
          onChange={(v) => setForm((f) => ({ ...f, domande_frequenti: v }))}
          placeholder="Domanda frequente (es. Fate consegne a domicilio?)"
        />
        <SaveBar saving={saving} onSave={handleSave} dirty={dirty} messaggio={messaggio} />
      </div>
    </ModuleShell>
  );
}
