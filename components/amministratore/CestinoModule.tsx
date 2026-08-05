"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";

type TrashStore = {
  id: string;
  nome: string;
  categoria: string | null;
  descrizione: string | null;
  attivo: boolean | null;
  logo_url: string | null;
  deleted_at: string | null;
};

function formatDeletedAt(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/**
 * Cestino GLOBALE della piattaforma — solo amministratori.
 * Elenca i negozi eliminati da qualunque proprietario: il ripristino è
 * ESCLUSIVAMENTE amministratore (il commerciante può eliminare il proprio
 * negozio ma non ripristinarlo).
 */
export default function CestinoModule() {
  const [stores, setStores] = useState<TrashStore[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchTrash = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/amministratore/cestino");
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Errore nel caricamento del cestino.");
      }
      const json = await res.json();
      setStores(json.data?.stores ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Caricamento iniziale intenzionale: fetchTrash aggiorna lo stato dopo
    // l'await della risposta (pattern di data-fetching standard).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTrash();
  }, [fetchTrash]);

  async function handleRestore(storeId: string) {
    if (restoringId) return;
    setRestoringId(storeId);
    try {
      const res = await fetch(`/api/amministratore/negozi/${storeId}/ripristina`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Impossibile ripristinare il negozio.");
      }
      // Il negozio ripristinato sparisce dal cestino
      setStores((prev) => (prev ?? []).filter((s) => s.id !== storeId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore durante il ripristino.");
    } finally {
      setRestoringId(null);
    }
  }

  /** Eliminazione DEFINITIVA (irreversibile): solo dal Cestino, con conferma. */
  async function handleDeleteForever(storeId: string) {
    if (deletingId) return;
    setDeletingId(storeId);
    setError(null);
    try {
      const res = await fetch(`/api/amministratore/negozi/${storeId}/definitivo`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Impossibile eliminare definitivamente il negozio.");
      }
      setConfirmDeleteId(null);
      // Il negozio sparisce dal cestino (eliminato dal database).
      setStores((prev) => (prev ?? []).filter((s) => s.id !== storeId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore durante l'eliminazione definitiva.");
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-white/70 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Pannello Amministratore
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight text-slate-900">
              <Trash2 className="h-5 w-5 text-slate-500" />
              Cestino
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              I negozi eliminati dalla piattaforma finiscono qui. Il ripristino è riservato
              all&apos;amministratore; l&apos;eliminazione definitiva è irreversibile.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchTrash}
            disabled={loading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:opacity-50"
            title="Aggiorna"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Stato di caricamento */}
      {loading && stores === null && (
        <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-white/70 bg-white shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
            <p className="text-sm text-slate-500">Caricamento cestino...</p>
          </div>
        </div>
      )}

      {/* Errore */}
      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-500" />
          <p className="mt-2 text-sm font-semibold text-red-700">Errore</p>
          <p className="mt-1 text-xs text-red-600">{error}</p>
          <button
            type="button"
            onClick={fetchTrash}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Riprova
          </button>
        </div>
      )}

      {/* Cestino vuoto */}
      {!loading && !error && stores !== null && stores.length === 0 && (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-white/70 bg-white p-8 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Trash2 className="h-7 w-7 text-slate-400" />
          </div>
          <p className="mt-4 text-base font-bold text-slate-900">Il cestino è vuoto</p>
          <p className="mt-1 text-sm text-slate-500">
            Quando un negozio viene eliminato dalla piattaforma, lo troverai qui e potrai ripristinarlo.
          </p>
        </div>
      )}

      {/* Lista negozi nel cestino */}
      {!loading && !error && stores !== null && stores.length > 0 && (
        <div className="space-y-3">
          {stores.map((store) => (
            <div
              key={store.id}
              className="flex flex-col gap-4 rounded-2xl border border-white/70 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-base font-black tracking-tight text-slate-900">{store.nome}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  {store.categoria && (
                    <span className="inline-flex rounded-lg bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
                      {store.categoria}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                    Eliminato il {formatDeletedAt(store.deleted_at)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => handleRestore(store.id)}
                  disabled={restoringId === store.id || deletingId === store.id}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {restoringId === store.id ? "Ripristino..." : "Ripristina"}
                </button>

                {confirmDeleteId === store.id ? (
                  <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2">
                    <p className="text-[11px] font-semibold text-red-700">Irreversibile?</p>
                    <button
                      type="button"
                      onClick={() => handleDeleteForever(store.id)}
                      disabled={deletingId === store.id}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                    >
                      {deletingId === store.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      Elimina
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deletingId === store.id}
                      className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-red-100 disabled:opacity-60"
                    >
                      Annulla
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setConfirmDeleteId(store.id);
                    }}
                    disabled={restoringId === store.id || deletingId === store.id}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                    title="Elimina definitivamente dal database (irreversibile)"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Elimina definitivamente
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
