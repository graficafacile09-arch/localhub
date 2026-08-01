"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { Field, TextArea, TagsInput, SaveBar } from "./ModuleFields";

type Props = { storeId: string };

export default function SeoModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ seo_title: "", seo_description: "", seo_keywords: [] as string[] });
  const [original, setOriginal] = useState("");

  useEffect(() => {
    fetch(`/api/merchant/stores/${storeId}/settings`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const s = json.data.settings;
          const vals = { seo_title: s.seo_title ?? "", seo_description: s.seo_description ?? "", seo_keywords: s.seo_keywords ?? [] };
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
      <ModuleShell icon={<Search className="h-4 w-4" />} title="SEO" subtitle="Caricamento..." id="seo">
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell icon={<Search className="h-4 w-4" />} title="SEO" subtitle="Meta tag e keywords per motori di ricerca" id="seo">
      <div className="space-y-4">
        <Field label="SEO Title" value={form.seo_title} onChange={(v) => setForm((f) => ({ ...f, seo_title: v }))} placeholder="Titolo per i motori di ricerca" />
        <TextArea label="SEO Description" value={form.seo_description} onChange={(v) => setForm((f) => ({ ...f, seo_description: v }))} rows={2} />
        <TagsInput value={form.seo_keywords} onChange={(v) => setForm((f) => ({ ...f, seo_keywords: v }))} placeholder="Digita una keyword SEO e premi Invio..." />
        <SaveBar saving={saving} onSave={handleSave} dirty={dirty} />
      </div>
    </ModuleShell>
  );
}
