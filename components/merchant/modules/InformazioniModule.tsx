"use client";

import { useState, useEffect } from "react";
import { Building2, FileText, Tag } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { Field, SelectField, TextArea } from "./ModuleFields";
import type { Categoria } from "@/types/negozio";

type Props = { storeId: string };

export default function InformazioniModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categorie, setCategorie] = useState<Categoria[]>([]);
  const [form, setForm] = useState({
    nome: "",
    slug: "",
    categoria: "",
    sottocategoria: "",
    descrizione: "",
    descrizione_completa: "",
  });

  useEffect(() => {
    async function load() {
      const [storeRes, catRes] = await Promise.all([
        fetch(`/api/merchant/stores/${storeId}/settings`),
        fetch("/api/categories"),
      ]);
      const storeJson = await storeRes.json();
      const catJson = await catRes.json();
      if (storeJson.success) {
        const s = storeJson.data.settings;
        setForm({
          nome: s.nome ?? "",
          slug: s.slug ?? "",
          categoria: s.categoria ?? "",
          sottocategoria: s.sottocategoria ?? "",
          descrizione: s.descrizione ?? "",
          descrizione_completa: s.descrizione_completa ?? "",
        });
      }
      if (catJson.success) {
        setCategorie(catJson.data);
      }
      setLoading(false);
    }
    load();
  }, [storeId]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/merchant/stores/${storeId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: form.nome,
        slug: form.slug,
        categoria: form.categoria,
        sottocategoria: form.sottocategoria,
        descrizione: form.descrizione,
        descrizione_completa: form.descrizione_completa,
      }),
    });
    setSaving(false);
  }

  if (loading) {
    return (
      <ModuleShell icon={<Building2 className="h-4 w-4" />} title="Informazioni" subtitle="Caricamento..." id="informazioni">
        <p className="text-sm text-slate-400">Caricamento dati in corso...</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell icon={<Building2 className="h-4 w-4" />} title="Informazioni" subtitle="Nome, categoria e descrizione del negozio" id="informazioni">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome negozio" value={form.nome} onChange={(v) => setForm((f) => ({ ...f, nome: v }))} required />
          <SelectField label="Categoria" value={form.categoria} onChange={(v) => setForm((f) => ({ ...f, categoria: v }))} options={categorie.map((c) => c.nome)} required />
        </div>
        <Field label="Slug (URL univoco)" value={form.slug} onChange={(v) => setForm((f) => ({ ...f, slug: v }))} placeholder="nome-del-negozio" />
        <Field label="Sottocategoria" value={form.sottocategoria} onChange={(v) => setForm((f) => ({ ...f, sottocategoria: v }))} placeholder="es. Pasticceria, Skincare, Abbigliamento sportivo" />
        <TextArea label="Descrizione breve" value={form.descrizione} onChange={(v) => setForm((f) => ({ ...f, descrizione: v }))} rows={3} />
        <TextArea label="Descrizione completa" value={form.descrizione_completa} onChange={(v) => setForm((f) => ({ ...f, descrizione_completa: v }))} rows={5} />
        <SaveButton saving={saving} onSave={handleSave} />
      </div>
    </ModuleShell>
  );
}

function SaveButton({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={saving}
      className="btn-cta h-10 gap-2 px-5 text-sm disabled:opacity-50"
    >
      {saving ? "Salvataggio..." : "Salva modifiche"}
    </button>
  );
}
