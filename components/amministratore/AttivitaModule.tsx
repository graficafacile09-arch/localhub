"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Plus, ShieldCheck, Store, Trash2 } from "lucide-react";
import type { AttivitaRow } from "@/lib/amministratore/attivita-types";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import AttivitaCardGrid from "./AttivitaCardGrid";
import AttivitaToolbar from "./AttivitaToolbar";

const normalizza = (testo: string) => testo.trim().toLowerCase();

/** Modulo "Gestione Negozi": header, ricerca, filtro e griglia di card. */
export default function AttivitaModule({
  attivita,
  categorie,
  errorMessage = null,
}: {
  attivita: AttivitaRow[];
  categorie: string[];
  errorMessage?: string | null;
}) {
  const [ricerca, setRicerca] = useState("");
  const [categoria, setCategoria] = useState("tutte");
  const [eliminati, setEliminati] = useState<Set<string>>(new Set());
  const router = useRouter();

  // Selezione multipla (soft delete batch). Gli id restano in un Set: la
  // selezione sopravvive a ricerca/filtri; "Seleziona tutti" agisce sui
  // negozi VISIBILI (dopo ricerca/filtro categoria) della pagina corrente.
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [confermaAperta, setConfermaAperta] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const handleElimina = useCallback((id: string) => {
    setEliminati((prev) => new Set(prev).add(id));
  }, []);

  const visibili = useMemo(() => {
    const termine = normalizza(ricerca);
    return attivita.filter((riga) => {
      if (eliminati.has(riga.id)) return false;
      if (categoria !== "tutte" && riga.categoria !== categoria) return false;
      if (termine) {
        const nelTesto = [riga.nome, riga.categoria, riga.slug]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!nelTesto.includes(termine)) return false;
      }
      return true;
    }).sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [attivita, ricerca, categoria, eliminati]);

  const toggleSelezione = useCallback((id: string, selezionato: boolean) => {
    setSelezionati((prev) => {
      const next = new Set(prev);
      if (selezionato) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleTutti = useCallback(() => {
    setSelezionati((prev) => {
      const idsVisibili = visibili.map((n) => n.id);
      const tutti = idsVisibili.length > 0 && idsVisibili.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of idsVisibili) {
        if (tutti) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [visibili]);

  // "Seleziona tutti": stato indeterminato quando solo parte dei negozi
  // visibili è selezionata.
  useEffect(() => {
    if (!selectAllRef.current) return;
    const idsVisibili = visibili.map((n) => n.id);
    const nSel = idsVisibili.filter((id) => selezionati.has(id)).length;
    selectAllRef.current.indeterminate = nSel > 0 && nSel < idsVisibili.length;
  }, [visibili, selezionati]);

  async function eseguiEliminazione() {
    if (selezionati.size === 0) return;
    setEliminando(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/amministratore/negozi/cestina-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ negozioIds: Array.from(selezionati) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // Gli errori di API restano visibili nel riquadro "errorMessage"
        // locale: li mostriamo qui per non perdere il feedback.
        setFeedback(null);
        setConfermaAperta(false);
        throw new Error(data?.error?.message ?? "Impossibile eliminare i negozi selezionati.");
      }
      const esito = data?.data ?? {};
      const trashed = Number(esito.trashed ?? 0);
      const trashedIds: string[] = Array.isArray(esito.trashedIds) ? esito.trashedIds : [];
      const errori = Array.isArray(esito.errori) ? esito.errori.length : 0;

      setSelezionati(new Set());
      setConfermaAperta(false);
      // I negozi cestinati spariscono dalla lista (sia localmente che via
      // refresh server-side: getAttivitaAdmin esclude deleted_at non null).
      setEliminati((prev) => {
        const next = new Set(prev);
        for (const id of trashedIds) next.add(id);
        return next;
      });
      router.refresh();
      setFeedback(
        errori > 0
          ? `${trashed} ${trashed === 1 ? "negozio spostato" : "negozi spostati"} nel Cestino; ${errori} ${errori === 1 ? "non eliminato" : "non eliminati"}.`
          : `${trashed} ${trashed === 1 ? "negozio spostato" : "negozi spostati"} nel Cestino.`
      );
    } catch (caught) {
      setFeedback(null);
      setConfermaAperta(false);
      // L'errore resta visibile: lo mostriamo nel riquadro feedback in rosso.
      setFeedback(
        `Errore: ${caught instanceof Error ? caught.message : "errore sconosciuto."}`
      );
    } finally {
      setEliminando(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="card p-6 md:p-8">
        {/* Breadcrumb */}
        <nav aria-label="Percorso" className="mb-5">
          <button
            type="button"
            onClick={() => (window.location.href = "/amministratore")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition hover:text-blue-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Torna al pannello
          </button>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <Store className="h-7 w-7" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                Centro di controllo
              </p>
              <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
                Gestione Negozi
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Gestisci tutti i negozi presenti sulla piattaforma. Usa la ricerca
                o il filtro per categoria, apri un negozio per modificarlo oppure
                sposta nel Cestino una scheda non più attiva.
              </p>
            </div>
          </div>

          {/* CTA "Crea negozio": riusa lo STESSO wizard del venditore
              (/amministratore/negozi/nuovo → WizardShell area admin). */}
          <Link
            href="/amministratore/negozi/nuovo"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-yellow-400 px-4 py-2 text-xs font-bold text-blue-900 transition-colors hover:bg-yellow-300 active:scale-95"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Crea negozio
          </Link>
        </div>
      </div>

      <AttivitaToolbar
        ricerca={ricerca}
        onRicerca={setRicerca}
        categoria={categoria}
        categorie={categorie}
        onCategoria={setCategoria}
      />

      {/* Errori server (es. DB non raggiungibile) */}
      {errorMessage ? (
        <div className="flex items-start gap-3 rounded-3xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
          <p className="leading-6">{errorMessage}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm font-black text-slate-700">
          {visibili.length}{" "}
          {visibili.length === 1 ? "negozio" : "negozi"}
        </p>
        {(ricerca || categoria !== "tutte") && (
          <button
            type="button"
            onClick={() => {
              setRicerca("");
              setCategoria("tutte");
            }}
            className="text-xs font-semibold text-blue-600 underline-offset-2 transition hover:underline"
          >
            Azzera filtri
          </button>
        )}
      </div>

      {/* Feedback operazione batch (successo o errore) */}
      {feedback && (
        <div
          className={
            feedback.startsWith("Errore:")
              ? "rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"
              : "rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700"
          }
        >
          {feedback}
        </div>
      )}

      {/* Selezione multipla: "Seleziona tutti" + conteggio selezionati */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={visibili.length > 0 && visibili.every((n) => selezionati.has(n.id))}
            onChange={toggleTutti}
            className="h-4 w-4 accent-blue-600"
          />
          Seleziona tutti
        </label>
        <span className="text-xs font-semibold text-slate-500">
          {selezionati.size} {selezionati.size === 1 ? "negozio selezionato" : "negozi selezionati"}
        </span>
      </div>

      {/* Barra azioni: visibile SOLO con almeno un negozio selezionato */}
      {selezionati.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <p className="text-sm font-bold text-red-700">
            {selezionati.size} {selezionati.size === 1 ? "negozio selezionato" : "negozi selezionati"}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelezionati(new Set())}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-red-300 hover:text-red-600"
            >
              Deseleziona
            </button>
            <button
              type="button"
              onClick={() => setConfermaAperta(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Elimina selezionati ({selezionati.size})
            </button>
          </div>
        </div>
      )}

      <AttivitaCardGrid
        attivita={visibili}
        onElimina={handleElimina}
        selezionati={selezionati}
        onToggleSelezione={toggleSelezione}
      />

      {/* Conferma eliminazione multipla (soft delete nel Cestino) */}
      <ConfirmDialog
        open={confermaAperta}
        title="Eliminare i negozi selezionati?"
        message={
          selezionati.size === 1
            ? "Il negozio selezionato verrà spostato nel Cestino e non sarà più visibile nell'elenco dei negozi."
            : `${selezionati.size} negozi verranno spostati nel Cestino e non saranno più visibili nell'elenco dei negozi.`
        }
        confirmLabel="Elimina selezionati"
        destructive
        loading={eliminando}
        onConfirm={eseguiEliminazione}
        onCancel={() => setConfermaAperta(false)}
      />

      <div className="flex items-start gap-3 rounded-3xl border border-blue-100 bg-blue-50/60 px-5 py-4 text-sm text-blue-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
        <p className="leading-6">
          <span className="font-bold">Centro di controllo:</span> dati reali dal
          database. Elimina sposta la scheda nel Cestino, da cui puoi
          ripristinarla o eliminarla definitivamente.
        </p>
      </div>
    </div>
  );
}