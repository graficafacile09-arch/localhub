"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Copy, Loader2 } from "lucide-react";

type Props = {
  storeId: string;
  storeName: string;
  onClose: () => void;
  /** Destinazione dopo la duplicazione. Default: editor venditore del nuovo negozio. */
  editHref?: string;
};

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export default function DuplicaNegozioWizard({ storeId, storeName, onClose, editHref }: Props) {
  const router = useRouter();
  const [nome, setNome] = useState(`${storeName} (copia)`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleDuplica() {
    if (!nome.trim()) {
      setError("Inserisci il nome del negozio.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      const slug = toSlug(nome) + "-copia";
      const allOptions = {
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

      const res = await fetch(`/api/merchant/stores/${storeId}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newStore: {
            nome: nome.trim(),
            slug,
          },
          options: allOptions,
        }),
      });

      const json = await res.json();
      if (json.success) {
        onClose();
        router.push(editHref ?? `/merchant/${json.data.storeId}/edit`);
      } else {
        setError(json.error?.message ?? "Errore durante la duplicazione.");
      }
    } catch {
      setError("Errore di connessione.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-blue-500" />
            <h3 className="text-sm font-bold text-slate-800">Duplica negozio</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          <p className="mb-4 text-xs text-slate-500">
            Verrà creato una copia completa di <strong>{storeName}</strong> con tutti i dati, prodotti, immagini e impostazioni.
          </p>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Nome negozio *</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {error && (
            <p className="mb-4 text-xs font-semibold text-blue-500">{error}</p>
          )}

          <button
            type="button"
            onClick={handleDuplica}
            disabled={saving}
            className="w-full rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Duplicazione...
              </div>
            ) : (
              "Duplica negozio"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
