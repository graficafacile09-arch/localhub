"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

/**
 * Pulsante Elimina ben visibile per ogni riga della tabella Attività.
 * Sposta il negozio nel Cestino (soft delete) via
 * /api/amministratore/negozi/[id]/cestina, con conferma esplicita.
 * Dopo l'eliminazione la riga sparisce localmente tramite onElimina.
 */
export default function AttivitaEliminaButton({
  storeId,
  storeName,
  onElimina,
  expand = false,
}: {
  storeId: string;
  storeName: string;
  onElimina: (id: string) => void;
  /** Variante grande a tutta larghezza (card "Gestione Negozi"). */
  expand?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  async function handleElimina() {
    setEliminando(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/amministratore/negozi/${storeId}/cestina`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Errore durante l'eliminazione.");
      }
      setOpen(false);
      onElimina(storeId);
    } catch (caught) {
      setErrore(
        caught instanceof Error ? caught.message : "Errore sconosciuto."
      );
    } finally {
      setEliminando(false);
    }
  }

  return (
    <div
      className={expand ? "relative" : "relative inline-block"}
      ref={containerRef}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Elimina ${storeName}`}
        title="Elimina (sposta nel Cestino)"
        className={
          expand
            ? "inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-black text-blue-600 transition hover:border-blue-300 hover:bg-blue-50"
            : "flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-white text-blue-600 transition hover:border-blue-300 hover:bg-blue-50"
        }
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {expand ? "Elimina" : null}
      </button>

      {open && (
        <div
          className={
            expand
              ? "absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left shadow-xl"
              : "absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left shadow-xl"
          }
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <div>
              <p className="text-sm font-bold text-blue-800">
                Vuoi spostare questo negozio nel Cestino?
              </p>
              <p className="mt-1 text-xs leading-5 text-blue-600">
                &ldquo;{storeName}&rdquo; verrà spostato nel Cestino. Potrai
                ripristinarlo dalla pagina Cestino oppure eliminarlo
                definitivamente.
              </p>
              {errore && (
                <p className="mt-2 rounded-lg bg-blue-100 px-2.5 py-1.5 text-xs font-semibold text-blue-800">
                  {errore}
                </p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleElimina}
                  disabled={eliminando}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {eliminando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  {eliminando ? "Eliminazione..." : "Sposta nel Cestino"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setErrore(null);
                  }}
                  disabled={eliminando}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-blue-100 disabled:opacity-60"
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}