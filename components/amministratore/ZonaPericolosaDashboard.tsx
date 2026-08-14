"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

type NegozioSintesi = {
  id: string;
  nome: string;
  categoria: string | null;
};

/**
 * Zona Pericolosa — Dashboard Amministratore.
 *
 * Blocco con sfondo rosso nella Panoramica admin: selettore del negozio da
 * eliminare e pulsante di conferma. Usa le API esistenti:
 * - GET  /api/amministratore/negozi          (elenco negozi attivi)
 * - POST /api/amministratore/negozi/[id]/cestina  (eliminazione)
 *
 * Le stesse operazioni restano disponibili anche dal menu Azioni (⋮)
 * della tabella Attività.
 */
export default function ZonaPericolosaDashboard() {
  const [negozi, setNegozi] = useState<NegozioSintesi[] | null>(null);
  const [loadingNegozi, setLoadingNegozi] = useState(true);
  const [selezionato, setSelezionato] = useState("");
  const [eliminando, setEliminando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [successo, setSuccesso] = useState<string | null>(null);

  // Carica i negozi attivi (esclusi quelli già nel Cestino).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/amministratore/negozi");
        if (!res.ok) throw new Error("Impossibile caricare i negozi.");
        const json = await res.json();
        if (!cancelled) {
          setNegozi(json.stores ?? []);
          setLoadingNegozi(false);
        }
      } catch (caught) {
        if (!cancelled) {
          setErrore(
            caught instanceof Error ? caught.message : "Errore sconosciuto."
          );
          setLoadingNegozi(false);
        }
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return () => { cancelled = true; };
  }, []);

  const handleElimina = useCallback(async () => {
    if (!selezionato) return;
    setEliminando(true);
    setErrore(null);
    setSuccesso(null);
    try {
      const res = await fetch(
        `/api/amministratore/negozi/${selezionato}/cestina`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Errore durante l'eliminazione.");
      }
      // Rimuovi il negozio dal selettore locale (non serve refresh pagina).
      const eliminato = negozi?.find((n) => n.id === selezionato);
      setNegozi((prev) => (prev ?? []).filter((n) => n.id !== selezionato));
      setSelezionato("");
      setSuccesso(
        `"${eliminato?.nome ?? selezionato}" spostato nel Cestino.`
      );
    } catch (caught) {
      setErrore(
        caught instanceof Error ? caught.message : "Errore sconosciuto."
      );
    } finally {
      setEliminando(false);
    }
  }, [selezionato, negozi]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section className="rounded-[2rem] border-2 border-blue-200 bg-blue-50/60 p-6 shadow-sm md:p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 ring-1 ring-blue-200">
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </div>
        <div>
          <h2 className="text-lg font-black tracking-tight text-blue-800">
            ZONA PERICOLOSA
          </h2>
          <p className="mt-1 text-xs leading-5 text-blue-600">
            L&apos;eliminazione sposta il negozio nel Cestino (soft delete). Puoi
            ripristinarlo dalla pagina Cestino. Operazione riservata
            all&apos;amministratore.
          </p>
        </div>
      </div>

      {/* Selettore + pulsante */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="zona-pericolosa-negozio"
            className="mb-1 block text-xs font-semibold text-blue-700"
          >
            Seleziona il negozio da eliminare
          </label>
          {loadingNegozi ? (
            <div className="flex h-11 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Caricamento negozi...
            </div>
          ) : (
            <select
              id="zona-pericolosa-negozio"
              value={selezionato}
              onChange={(e) => {
                setSelezionato(e.target.value);
                setErrore(null);
                setSuccesso(null);
              }}
              className="h-11 w-full rounded-xl border border-blue-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            >
              <option value="" disabled>
                {negozi && negozi.length === 0
                  ? "Nessun negozio disponibile"
                  : "Scegli un negozio..."}
              </option>
              {negozi?.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome}{n.categoria ? ` — ${n.categoria}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          type="button"
          onClick={handleElimina}
          disabled={!selezionato || eliminando}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {eliminando ? "Eliminazione..." : "Elimina negozio"}
        </button>
      </div>

      {/* Feedback */}
      {errore && (
        <p className="mt-3 rounded-xl bg-blue-100 px-4 py-2.5 text-xs font-semibold text-blue-800">
          {errore}
        </p>
      )}

      {successo && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-200 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-blue-800">{successo}</p>
          <Link
            href="/amministratore/cestino"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Apri Cestino
          </Link>
        </div>
      )}
    </section>
  );
}
