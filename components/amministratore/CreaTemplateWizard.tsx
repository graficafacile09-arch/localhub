"use client";

import { useEffect, useState } from "react";
import { Save, X } from "lucide-react";

type Props = {
  onClose: () => void;
  onCreated?: () => void;
};

type NegozioSintesi = { id: string; nome: string; categoria: string | null };

const DEFAULT_OPTIONS = {
  informazioni: true,
  logo: true,
  copertina: true,
  galleria: true,
  prodotti: true,
  servizi: true,
  offerte: true,
  eventi: true,
  orari: true,
  contatti: true,
  social: true,
  seo: true,
  ai: true,
};

const OPTION_LABELS: Record<keyof typeof DEFAULT_OPTIONS, string> = {
  informazioni: "Informazioni",
  logo: "Logo",
  copertina: "Copertina",
  galleria: "Galleria immagini",
  prodotti: "Prodotti",
  servizi: "Servizi",
  offerte: "Offerte",
  eventi: "Eventi",
  orari: "Orari",
  contatti: "Contatti",
  social: "Social",
  seo: "SEO",
  ai: "Dati AI",
};

/**
 * Creazione template di PIATTAFORMA (solo amministratore).
 * L'admin sceglie il negozio sorgente da cui estrarre i dati del template.
 */
export default function CreaTemplateWizard({ onClose, onCreated }: Props) {
  const [stores, setStores] = useState<NegozioSintesi[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [sourceStoreId, setSourceStoreId] = useState("");
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [categoria, setCategoria] = useState("");
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStores() {
      try {
        const res = await fetch("/api/amministratore/negozi");
        const json = await res.json();
        if (json.success) setStores(json.data?.stores ?? []);
      } catch {
        // In caso di errore lascia l'elenco vuoto.
      } finally {
        setLoadingStores(false);
      }
    }
    loadStores();
  }, []);

  function toggleOption(key: keyof typeof DEFAULT_OPTIONS) {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    const hasAtLeastOne = Object.values(options).some(Boolean);
    if (!hasAtLeastOne) {
      setError("Seleziona almeno un elemento da includere.");
      return;
    }
    if (!nome.trim()) {
      setError("Il nome del template è obbligatorio.");
      return;
    }
    if (!sourceStoreId) {
      setError("Seleziona il negozio sorgente.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/amministratore/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceStoreId,
          nome: nome.trim(),
          descrizione: descrizione.trim(),
          categoria: categoria.trim() || null,
          options,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? "Errore durante la creazione del template.");
      } else {
        onCreated?.();
        onClose();
      }
    } catch {
      setError("Errore di rete.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Nuovo Template di piattaforma</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600">Negozio sorgente</label>
            <select
              value={sourceStoreId}
              onChange={(e) => setSourceStoreId(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleziona un negozio...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}{s.categoria ? ` (${s.categoria})` : ""}
                </option>
              ))}
            </select>
            {loadingStores && <p className="mt-1 text-[11px] text-slate-400">Caricamento negozi...</p>}
            {!loadingStores && stores.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-600">Nessun negozio attivo disponibile.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600">Nome template</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nome template"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600">Descrizione (opzionale)</label>
            <textarea
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Breve descrizione..."
              rows={2}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600">Categoria (opzionale)</label>
            <input
              type="text"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="es. Ristorazione"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-600">Cosa includere</label>
            <div className="space-y-1.5">
              {(Object.keys(options) as Array<keyof typeof DEFAULT_OPTIONS>).map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={options[key]}
                    onChange={() => toggleOption(key)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-slate-700">{OPTION_LABELS[key]}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Crea Template
          </button>
        </div>
      </div>
    </div>
  );
}
