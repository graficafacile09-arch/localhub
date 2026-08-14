"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Eliminazione DIRETTA di un negozio dall'Area Amministratore.
 * - Chiede sempre CONFERMA esplicita;
 * - sposta il negozio nel Cestino (soft delete, /api/amministratore/negozi/[id]/cestina);
 * - NON elimina definitivamente: il ripristino resta disponibile dal Cestino.
 */
export default function EliminaNegozioButton({
  storeId,
  storeName,
}: {
  storeId: string;
  storeName: string;
}) {
  const [open, setOpen] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const handleElimina = useCallback(async () => {
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
      // Aggiorna la lista (la card del negozio sparisce).
      router.refresh();
    } catch (caught) {
      setErrore(
        caught instanceof Error ? caught.message : "Errore sconosciuto."
      );
    } finally {
      setEliminando(false);
    }
  }, [storeId, router]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Elimina ${storeName}`}
        title="Sposta nel Cestino"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-white text-blue-600 transition hover:border-blue-300 hover:bg-blue-50"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-xl">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <div>
              <p className="text-sm font-bold text-blue-800">
                Spostare &ldquo;{storeName}&rdquo; nel Cestino?
              </p>
              <p className="mt-1 text-xs leading-5 text-blue-600">
                Il negozio verrà rimosso dalla lista ma potrai ripristinarlo
                dalla pagina Cestino. Non viene eliminato definitivamente.
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
                  {eliminando ? "Eliminazione..." : "Conferma"}
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
