"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Loader2, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { OrdineCestino } from "@/lib/amministratore/ordini";
import { ETICHETTE_STATO } from "@/lib/merchant/ordini-stati";

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

function formattaEuro(v: number): string {
  return `€${(v || 0).toFixed(2).replace(".", ",")}`;
}

/**
 * Sezione "Ordini nel Cestino" — Area Amministratore.
 * Elenca gli ordini cestinati (soft delete) e permette il RISTABILIMENTO
 * (solo admin). È il complemento della gestione ordini:
 * "Elimina ordine" sposta qui l'ordine, che resta recuperabile.
 */
export default function OrdiniCestinoSection() {
  const [ordini, setOrdini] = useState<OrdineCestino[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const fetchCestino = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/amministratore/ordini/cestino");
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Errore nel caricamento del cestino ordini.");
      }
      const json = await res.json();
      setOrdini(json.data?.ordini ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore sconosciuto");
      setOrdini([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCestino();
  }, [fetchCestino]);

  async function handleRestore(ordineId: string) {
    if (restoringId) return;
    setRestoringId(ordineId);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch(`/api/amministratore/ordini/${ordineId}/ripristina`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Impossibile ripristinare l'ordine.");
      }
      setOrdini((prev) => (prev ?? []).filter((o) => o.id !== ordineId));
      setFeedback("Ordine ripristinato nell'elenco ordini.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore durante il ripristino.");
    } finally {
      setRestoringId(null);
    }
  }

  /** Eliminazione DEFINITIVA di un singolo ordine (irreversibile). */
  async function handleDeleteForever(ordineId: string) {
    if (deletingId) return;
    setDeletingId(ordineId);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch(`/api/amministratore/ordini/${ordineId}/definitivo`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Impossibile eliminare definitivamente l'ordine.");
      }
      setConfirmDeleteId(null);
      setOrdini((prev) => (prev ?? []).filter((o) => o.id !== ordineId));
      setFeedback("1 ordine eliminato definitivamente.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore durante l'eliminazione definitiva.");
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  }

  /** Eliminazione DEFINITIVA di TUTTI gli ordini del Cestino (irreversibile). */
  async function handleDeleteAll() {
    if (deletingAll) return;
    setDeletingAll(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/amministratore/ordini/cestino", { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Impossibile svuotare il cestino ordini.");
      }
      const json = await res.json();
      const eliminati = Number(json.data?.deleted ?? 0);
      setConfirmDeleteAll(false);
      setOrdini([]);
      setFeedback(
        eliminati === 0
          ? "Nessun ordine nel Cestino da eliminare."
          : `${eliminati} ${eliminati === 1 ? "ordine eliminato" : "ordini eliminati"} definitivamente.`
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore durante l'eliminazione definitiva.");
      setConfirmDeleteAll(false);
    } finally {
      setDeletingAll(false);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white p-5 shadow-sm">
        <div>
          <p className="flex items-center gap-2 text-base font-black tracking-tight text-slate-900">
            <Trash2 className="h-4 w-4 text-slate-500" />
            Ordini nel Cestino
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Gli ordini eliminati dall&apos;Area Amministratore finiscono qui e restano recuperabili.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Elimina tutto — visibile solo se il Cestino contiene ordini */}
          {ordini !== null && ordini.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setConfirmDeleteAll(true);
              }}
              disabled={deletingAll || deletingId !== null || restoringId !== null}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
              title="Elimina definitivamente tutti gli ordini dal database (irreversibile)"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Elimina tutto
            </button>
          )}
          <button
            type="button"
            onClick={fetchCestino}
            disabled={loading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:opacity-50"
            title="Aggiorna"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Feedback dopo un'operazione riuscita */}
      {feedback && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-center">
          <p className="text-sm font-semibold text-emerald-700">{feedback}</p>
        </div>
      )}

      {loading && ordini === null && (
        <div className="flex min-h-[140px] items-center justify-center rounded-2xl border border-white/70 bg-white shadow-sm">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
            Caricamento ordini nel cestino...
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
          <AlertTriangle className="mx-auto h-7 w-7 text-red-500" />
          <p className="mt-2 text-xs font-semibold text-red-700">{error}</p>
          <button
            type="button"
            onClick={fetchCestino}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Riprova
          </button>
        </div>
      )}

      {!loading && !error && ordini !== null && ordini.length === 0 && (
        <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-slate-400">
            Nessun ordine nel Cestino.
          </p>
        </div>
      )}

      {!loading && !error && ordini !== null && ordini.length > 0 && (
        <div className="space-y-3">
          {ordini.map((o) => (
            <div
              key={o.id}
              className="flex flex-col gap-4 rounded-2xl border border-white/70 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-base font-black tracking-tight text-slate-900">{o.numero}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span
                    className={`inline-flex rounded-lg px-2 py-0.5 font-semibold ${
                      o.stato === "cancellato"
                        ? "bg-slate-100 text-slate-600"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {ETICHETTE_STATO[o.stato] ?? o.stato}
                  </span>
                  <span>{formattaEuro(o.totale)}</span>
                  <span>
                    {o.clienteNome} {o.clienteCognome} · {o.negozioNome}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                    Eliminato il {formatDeletedAt(o.deletedAt)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row">
                <Link
                  href={`/amministratore/ordini/${o.id}`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                >
                  Dettaglio
                </Link>
                <button
                  type="button"
                  onClick={() => handleRestore(o.id)}
                  disabled={restoringId === o.id || deletingId === o.id || deletingAll}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-xs font-bold text-blue-800 transition hover:bg-yellow-300 disabled:opacity-60"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {restoringId === o.id ? "Ripristino..." : "Ripristina"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setFeedback(null);
                    setConfirmDeleteId(o.id);
                  }}
                  disabled={deletingId === o.id || restoringId === o.id || deletingAll}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                  title="Elimina definitivamente dal database (irreversibile)"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deletingId === o.id ? "Eliminazione..." : "Elimina definitivamente"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Conferma eliminazione DEFINITIVA singola (irreversibile) */}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Eliminare definitivamente questo ordine?"
        message="L'ordine verrà eliminato definitivamente dal database insieme a righe, eventi, reclami e pagamenti collegati. Questa operazione è IRREVERSIBILE e l'ordine non potrà più essere ripristinato."
        confirmLabel="Elimina definitivamente"
        destructive
        loading={deletingId !== null}
        onConfirm={() => confirmDeleteId && handleDeleteForever(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {/* Conferma svuotamento DEFINITIVO dell'intero Cestino (irreversibile) */}
      <ConfirmDialog
        open={confirmDeleteAll}
        title="Svuotare il Cestino ordini?"
        message={
          ordini && ordini.length > 0
            ? `${ordini.length} ${ordini.length === 1 ? "ordine verrà" : "ordini verranno"} eliminato${ordini.length === 1 ? "" : "i"} definitivamente dal database. Questa operazione è DEFINITIVA e NON REVERSIBILE: gli ordini non potranno più essere ripristinati.`
            : "Nessun ordine nel Cestino."
        }
        confirmLabel="Elimina tutto"
        destructive
        loading={deletingAll}
        onConfirm={handleDeleteAll}
        onCancel={() => setConfirmDeleteAll(false)}
      />
    </div>
  );
}