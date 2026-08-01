"use client";

import { useState, useEffect } from "react";
import { Phone, Mail, Globe, MessageCircle } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { Field, SaveBar } from "./ModuleFields";

type Props = { storeId: string };

export default function ContattiModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ telefono: "", email_negozio: "", whatsapp: "", sito_web: "" });
  const [original, setOriginal] = useState({ ...form });

  useEffect(() => {
    fetch(`/api/merchant/stores/${storeId}/settings`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const s = json.data.settings;
          const vals = {
            telefono: s.telefono ?? "",
            email_negozio: s.email_negozio ?? "",
            whatsapp: s.whatsapp ?? "",
            sito_web: s.sito_web ?? "",
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
      <ModuleShell icon={<Phone className="h-4 w-4" />} title="Contatti" subtitle="Caricamento..." id="contatti">
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell icon={<Phone className="h-4 w-4" />} title="Contatti" subtitle="Telefono, email, sito web e WhatsApp" id="contatti">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telefono" value={form.telefono} onChange={(v) => setForm((f) => ({ ...f, telefono: v }))} type="tel" />
          <Field label="WhatsApp" value={form.whatsapp} onChange={(v) => setForm((f) => ({ ...f, whatsapp: v }))} type="tel" placeholder="+39 333 1234567" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" value={form.email_negozio} onChange={(v) => setForm((f) => ({ ...f, email_negozio: v }))} type="email" />
          <Field label="Sito web" value={form.sito_web} onChange={(v) => setForm((f) => ({ ...f, sito_web: v }))} type="url" placeholder="https://..." />
        </div>
        <SaveBar saving={saving} onSave={handleSave} dirty={dirty} />
      </div>
    </ModuleShell>
  );
}
