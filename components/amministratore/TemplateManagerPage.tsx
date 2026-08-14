"use client";

import { useState, useEffect, useCallback } from "react";
import { LayoutGrid, Search, Loader2, Trash2, Pencil, X, Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import TemplateCard from "./TemplateCard";
import type { TemplateItem } from "./TemplateCard";
import CreaTemplateWizard from "./CreaTemplateWizard";

/**
 * Template di PIATTAFORMA — pannello Amministratore.
 * Creazione, modifica ed eliminazione sono riservate all'amministratore;
 * i commercianti possono solo scegliere un template in fase di creazione.
 */
export default function TemplateManagerPage() {
  const router = useRouter();
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("");
  const [showCrea, setShowCrea] = useState(false);

  const [editing, setEditing] = useState<TemplateItem | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCat, setEditCat] = useState("");

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/amministratore/templates");
      const json = await res.json();
      if (json.success) {
        setItems(json.data?.templates ?? []);
      } else {
        setError(json.error?.message ?? "Errore nel caricamento.");
      }
    } catch {
      setError("Errore di rete.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Caricamento iniziale intenzionale (data-fetching standard).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTemplates();
  }, [loadTemplates]);

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminare definitivamente questo template di piattaforma?")) return;
    try {
      const res = await fetch(`/api/amministratore/templates/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    } catch {}
  };

  const handleEdit = (item: TemplateItem) => {
    setEditing(item);
    setEditNome(item.nome);
    setEditDesc(item.descrizione);
    setEditCat(item.categoria ?? "");
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    try {
      const res = await fetch(`/api/amministratore/templates/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: editNome.trim(),
          descrizione: editDesc.trim(),
          categoria: editCat.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === editing.id
              ? { ...i, nome: editNome.trim(), descrizione: editDesc.trim(), categoria: editCat.trim() || null }
              : i
          )
        );
        setEditing(null);
      }
    } catch {}
  };

  const allCategories = Array.from(new Set(items.map((i) => i.categoria).filter(Boolean))) as string[];

  const filtered = items.filter((item) => {
    if (search) {
      const q = search.toLowerCase();
      if (!item.nome.toLowerCase().includes(q) && !item.descrizione.toLowerCase().includes(q)) return false;
    }
    if (filterCategoria && item.categoria !== filterCategoria) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl">
      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-800">Modifica template</h3>
            <div className="mt-4 space-y-3">
              <input type="text" value={editNome} onChange={(e) => setEditNome(e.target.value)} placeholder="Nome" className="h-10 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Descrizione" rows={2} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              <input type="text" value={editCat} onChange={(e) => setEditCat(e.target.value)} placeholder="Categoria" className="h-10 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Annulla</button>
              <button type="button" onClick={handleSaveEdit} className="inline-flex items-center gap-1.5 rounded-xl bg-yellow-400 px-4 py-2 text-xs font-bold text-blue-800 hover:bg-yellow-300">
                <Check className="h-3.5 w-3.5" /> Salva
              </button>
            </div>
          </div>
        </div>
      )}

      {showCrea && (
        <CreaTemplateWizard
          onClose={() => setShowCrea(false)}
          onCreated={() => loadTemplates()}
        />
      )}

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-xl bg-blue-50 p-2.5">
          <LayoutGrid className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800">Template di piattaforma</h1>
          <p className="text-xs text-slate-400">Gestione riservata all&apos;amministratore: i commercianti possono solo sceglierli</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCrea(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-yellow-400 px-4 py-2.5 text-xs font-bold text-blue-800 transition hover:bg-yellow-300"
        >
          <Plus className="h-4 w-4" />
          Nuovo template
        </button>
      </div>

      {/* Search & filter */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca template..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        {allCategories.length > 0 && (
          <select
            value={filterCategoria}
            onChange={(e) => setFilterCategoria(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-blue-500"
          >
            <option value="">Tutte le categorie</option>
            {allCategories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-600">
          {error}
          <button type="button" onClick={loadTemplates} className="ml-2 underline hover:text-blue-800">Riprova</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <LayoutGrid className="mb-3 h-12 w-12" />
          <p className="text-sm font-medium">{search || filterCategoria ? "Nessun template trovato" : "Nessun template di piattaforma"}</p>
          <p className="text-xs">Crea un template da un negozio sorgente per farlo scegliere ai commercianti</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <TemplateCard
              key={item.id}
              item={item}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onUse={(id) => router.push(`/merchant/nuovo?template=${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
