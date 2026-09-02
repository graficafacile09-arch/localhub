"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { StatoOrdine } from "@/lib/cliente/types";
import { ETICHETTE_STATO } from "@/lib/merchant/ordini-stati";
import FiltroDataRange from "@/components/ui/FiltroDataRange";
import { ETICHETTE_STATO_SPEDIZIONE } from "@/lib/merchant/ordini-spedizioni";
import type { OrdineAdminLista, RisultatoOrdiniAdmin } from "@/lib/amministratore/ordini";

/** Etichette leggibili degli stati di pagamento (payment_status). */
const ETICHETTE_PAGAMENTO: Record<string, string> = {
  pending: "In attesa",
  authorized: "Autorizzato",
  paid: "Pagato",
  failed: "Fallito",
  expired: "Scaduto",
  canceled: "Annullato",
  refunded: "Rimborsato",
  partially_refunded: "Parz. rimborsato",
};

function formattaEuro(v: number): string {
  return `€${(v || 0).toFixed(2).replace(".", ",")}`;
}

function formattaData(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

type FiltriLocal = {
  q: string;
  stato: string;
  pagamento: string;
  statoSpedizione: string;
  negozioId: string;
  modalita: string;
  dataDa: string;
  dataA: string;
};

const FILTRI_VUOTI: FiltriLocal = {
  q: "",
  stato: "",
  pagamento: "",
  statoSpedizione: "",
  negozioId: "",
  modalita: "",
  dataDa: "",
  dataA: "",
};

const STORICO_STATI: StatoOrdine[] = [
  "in_preparazione",
  "confermato",
  "in_lavorazione",
  "pronto",
  "in_consegna",
  "consegnato",
  "cancellato",
];

const STATI_SPEDIZIONE = [
  "non_affidata",
  "affidata",
  "in_transito",
  "consegnata",
  "problema",
];

const STATI_PAGAMENTO = [
  "pending",
  "authorized",
  "paid",
  "failed",
  "expired",
  "canceled",
  "refunded",
  "partially_refunded",
];

/**
 * Console ORDINI dell'Area Amministratore: elenco GLOBALE con ricerca, filtri
 * e paginazione SERVER-SIDE (via /api/amministratore/ordini). Nessun filtro
 * client-side sull'intero dataset: ogni variazione ricarica la pagina dal server.
 */
export default function OrdiniAdminClient() {
  const [filtri, setFiltri] = useState<FiltriLocal>(FILTRI_VUOTI);
  const [pagina, setPagina] = useState(1);
  const [negozi, setNegozi] = useState<Array<{ id: string; nome: string }>>([]);

  const [risultato, setRisultato] = useState<RisultatoOrdiniAdmin | null>(null);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Selezione multipla (soft delete batch). Gli id restano in un Set: la
  // selezione sopravvive a ricerca/filtri/paginazione; "Seleziona tutti"
  // agisce sugli ordini della pagina corrente.
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [confermaAperta, setConfermaAperta] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const ordini = risultato?.ordini ?? [];

  // Negozi per il filtro a discesa (una sola volta).
  useEffect(() => {
    fetch("/api/amministratore/negozi")
      .then((r) => r.json())
      .then((d) => {
        const stores = (d?.data?.stores ?? []) as Array<{ id: string; nome: string }>;
        setNegozi(stores);
      })
      .catch(() => {});
  }, []);

  const carica = useCallback(async () => {
    setCaricando(true);
    setErrore(null);
    try {
      const params = new URLSearchParams();
      if (filtri.q) params.set("q", filtri.q);
      if (filtri.stato) params.set("stato", filtri.stato);
      if (filtri.pagamento) params.set("pagamento", filtri.pagamento);
      if (filtri.statoSpedizione) params.set("stato_spedizione", filtri.statoSpedizione);
      if (filtri.negozioId) params.set("negozio_id", filtri.negozioId);
      if (filtri.modalita) params.set("modalita", filtri.modalita);
      if (filtri.dataDa) params.set("data_da", filtri.dataDa);
      if (filtri.dataA) params.set("data_a", filtri.dataA);
      params.set("pagina", String(pagina));

      const res = await fetch(`/api/amministratore/ordini?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrore(data?.error?.message ?? "Impossibile caricare gli ordini.");
        setRisultato(null);
        return;
      }
      setRisultato(data?.data ?? null);
    } catch {
      setErrore("Errore di rete. Riprova.");
      setRisultato(null);
    } finally {
      setCaricando(false);
    }
  }, [filtri, pagina]);

  useEffect(() => {
    void carica();
  }, [carica]);

  // "Seleziona tutti": stato indeterminato quando solo parte degli ordini
  // della pagina corrente è selezionata.
  useEffect(() => {
    if (!selectAllRef.current) return;
    const idsPagina = ordini.map((o) => o.id);
    const nSel = idsPagina.filter((id) => selezionati.has(id)).length;
    selectAllRef.current.indeterminate = nSel > 0 && nSel < idsPagina.length;
  }, [ordini, selezionati]);

  function toggleSelezione(id: string, selezionato: boolean) {
    setSelezionati((prev) => {
      const next = new Set(prev);
      if (selezionato) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleTutti() {
    setSelezionati((prev) => {
      const idsPagina = ordini.map((o) => o.id);
      const tutti = idsPagina.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of idsPagina) {
        if (tutti) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function eseguiEliminazione() {
    if (selezionati.size === 0) return;
    setEliminando(true);
    try {
      const res = await fetch("/api/amministratore/ordini/cestina-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordineIds: Array.from(selezionati) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrore(data?.error?.message ?? "Impossibile eliminare gli ordini selezionati.");
        setConfermaAperta(false);
        return;
      }
      const esito = data?.data ?? {};
      const trashed = Number(esito.trashed ?? 0);
      const errori = Array.isArray(esito.errori) ? esito.errori.length : 0;
      setSelezionati(new Set());
      setConfermaAperta(false);
      await carica();
      setFeedback(
        errori > 0
          ? `${trashed} ${trashed === 1 ? "ordine spostato" : "ordini spostati"} nel Cestino; ${errori} ${errori === 1 ? "non eliminato" : "non eliminati"}.`
          : `${trashed} ${trashed === 1 ? "ordine spostato" : "ordini spostati"} nel Cestino.`
      );
    } catch {
      setErrore("Errore di rete. Riprova.");
      setConfermaAperta(false);
    } finally {
      setEliminando(false);
    }
  }

  function setFiltro(chiave: keyof FiltriLocal, valore: string) {
    setFiltri((prev) => ({ ...prev, [chiave]: valore }));
    setPagina(1);
  }

  function azzera() {
    setFiltri(FILTRI_VUOTI);
    setPagina(1);
  }

  const pagineTotali = risultato?.pagineTotali ?? 0;

  return (
    <div className="space-y-5">
      {/* Intestazione modulo */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Truck className="h-7 w-7" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Pannello Amministratore
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Ordini
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Supervisione centrale di tutti gli ordini di tutti i negozi della
              piattaforma.
            </p>
            {risultato && (
              <p className="mt-4 text-sm font-semibold text-slate-500">
                {risultato.totale} {risultato.totale === 1 ? "ordine" : "ordini"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Barra filtri */}
      <div className="rounded-[1.75rem] border border-white/70 bg-white p-4 shadow-sm md:p-5">
        <div className="grid gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(4,minmax(0,1fr))]">
          {/* Ricerca */}
          <div className="relative min-w-0 md:col-span-2 xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              value={filtri.q}
              onChange={(e) => setFiltro("q", e.target.value)}
              placeholder="Cerca numero, cliente o negozio…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100"
            />
          </div>

          <select
            value={filtri.stato}
            onChange={(e) => setFiltro("stato", e.target.value)}
            className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100"
          >
            <option value="">Stato ordine: tutti</option>
            {STORICO_STATI.map((s) => (
              <option key={s} value={s}>{ETICHETTE_STATO[s]}</option>
            ))}
          </select>

          <select
            value={filtri.pagamento}
            onChange={(e) => setFiltro("pagamento", e.target.value)}
            className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100"
          >
            <option value="">Pagamento: tutti</option>
            {STATI_PAGAMENTO.map((s) => (
              <option key={s} value={s}>{ETICHETTE_PAGAMENTO[s] ?? s}</option>
            ))}
          </select>

          <select
            value={filtri.statoSpedizione}
            onChange={(e) => setFiltro("statoSpedizione", e.target.value)}
            className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100"
          >
            <option value="">Spedizione: tutte</option>
            {STATI_SPEDIZIONE.map((s) => (
              <option key={s} value={s}>{ETICHETTE_STATO_SPEDIZIONE[s as keyof typeof ETICHETTE_STATO_SPEDIZIONE]}</option>
            ))}
          </select>

          <select
            value={filtri.modalita}
            onChange={(e) => setFiltro("modalita", e.target.value)}
            className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100"
          >
            <option value="">Modalità: tutte</option>
            <option value="ritiro">Ritiro</option>
            <option value="spedizione">Spedizione</option>
          </select>

          <select
            value={filtri.negozioId}
            onChange={(e) => setFiltro("negozioId", e.target.value)}
            className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100"
          >
            <option value="">Negozio: tutti</option>
            {negozi.map((n) => (
              <option key={n.id} value={n.id}>{n.nome}</option>
            ))}
          </select>

          <FiltroDataRange
            dataDa={filtri.dataDa}
            dataA={filtri.dataA}
            onDataDa={(v) => setFiltro("dataDa", v)}
            onDataA={(v) => setFiltro("dataA", v)}
          />

          <button
            type="button"
            onClick={azzera}
            className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800"
          >
            <X className="h-4 w-4" aria-hidden />
            Azzera filtri
          </button>
        </div>
      </div>

      {/* Stati */}
      {feedback && (
        <div className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50 p-6 text-center">
          <p className="text-sm font-semibold text-emerald-700">{feedback}</p>
        </div>
      )}
      {errore && (
        <div className="rounded-[1.75rem] border border-blue-100 bg-blue-50 p-6 text-center">
          <p className="text-sm font-semibold text-blue-700">{errore}</p>
        </div>
      )}

      {!errore && caricando && !risultato && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">Caricamento ordini…</p>
        </div>
      )}

      {!errore && !caricando && ordini.length === 0 && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-700">Nessun ordine trovato</p>
          <p className="mt-1 text-xs text-slate-500">
            Modifica i filtri oppure attendi nuovi ordini dai negozi.
          </p>
        </div>
      )}

      {ordini.length > 0 && (
        <div className="space-y-3">
          {/* Selezione multipla: "Seleziona tutti" + conteggio selezionati */}
          <div className="flex items-center justify-between rounded-[1.5rem] border border-white/70 bg-white px-4 py-3 shadow-sm">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={ordini.length > 0 && ordini.every((o) => selezionati.has(o.id))}
                onChange={toggleTutti}
                className="h-4 w-4 accent-blue-600"
              />
              Seleziona tutti
            </label>
            <span className="text-xs font-semibold text-slate-500">
              {selezionati.size} {selezionati.size === 1 ? "ordine selezionato" : "ordini selezionati"}
            </span>
          </div>

          {/* Barra azioni: visibile SOLO con almeno un ordine selezionato */}
          {selezionati.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-red-200 bg-red-50 p-4 shadow-sm">
              <p className="text-sm font-bold text-red-700">
                {selezionati.size} {selezionati.size === 1 ? "ordine selezionato" : "ordini selezionati"}
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

          {ordini.map((o: OrdineAdminLista) => (
            <div
              key={o.id}
              className="flex items-start gap-3 rounded-[1.5rem] border border-white/70 bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <input
                type="checkbox"
                aria-label={`Seleziona ${o.numero}`}
                checked={selezionati.has(o.id)}
                onChange={(e) => toggleSelezione(o.id, e.target.checked)}
                className="mt-1.5 h-4 w-4 shrink-0 accent-blue-600"
              />
              <Link
                href={`/amministratore/ordini/${o.id}`}
                className="block min-w-0 flex-1"
              >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-900">
                      {o.numero}
                    </span>
                    <BadgeStato stato={o.stato} />
                    {o.paymentStatus && (
                      <BadgePagamento stato={o.paymentStatus} />
                    )}
                    {o.statoSpedizione && (
                      <BadgeSpedizione stato={o.statoSpedizione} />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    <span className="font-semibold text-slate-800">
                      {o.clienteNome} {o.clienteCognome}
                    </span>
                    {" · "}
                    {o.negozioNome}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <div className="text-right">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Totale
                    </p>
                    <p className="text-lg font-black text-slate-900">
                      {formattaEuro(o.totale)}
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>{formattaData(o.createdAt)}</p>
                    <p>
                      {o.modalita === "spedizione" ? "Spedizione" : "Ritiro"} ·{" "}
                      {o.numeroRighe} {o.numeroRighe === 1 ? "riga" : "righe"}
                    </p>
                  </div>
                </div>
              </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Paginazione */}
      {pagineTotali > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina <= 1 || caricando}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800 disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Precedente
          </button>
          <span className="text-sm font-semibold text-slate-600">
            Pagina {pagina} di {pagineTotali}
          </span>
          <button
            type="button"
            onClick={() => setPagina((p) => Math.min(pagineTotali, p + 1))}
            disabled={pagina >= pagineTotali || caricando}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800 disabled:opacity-40"
          >
            Successiva <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* Conferma eliminazione multipla (soft delete nel Cestino) */}
      <ConfirmDialog
        open={confermaAperta}
        title="Eliminare gli ordini selezionati?"
        message={
          selezionati.size === 1
            ? "L'ordine selezionato verrà spostato nel Cestino e non sarà più visibile nell'elenco degli ordini."
            : `${selezionati.size} ordini verranno spostati nel Cestino e non saranno più visibili nell'elenco degli ordini.`
        }
        confirmLabel="Elimina selezionati"
        destructive
        loading={eliminando}
        onConfirm={eseguiEliminazione}
        onCancel={() => setConfermaAperta(false)}
      />
    </div>
  );
}

function BadgeStato({ stato }: { stato: StatoOrdine }) {
  const classe =
    stato === "cancellato"
      ? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
      : stato === "consegnato"
        ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
        : "bg-blue-50 text-blue-700 ring-1 ring-blue-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${classe}`}>
      {ETICHETTE_STATO[stato]}
    </span>
  );
}

function BadgePagamento({ stato }: { stato: string }) {
  const classe =
    stato === "paid"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      : stato === "refunded" || stato === "partially_refunded"
        ? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
        : stato === "failed" || stato === "expired"
          ? "bg-red-50 text-red-700 ring-1 ring-red-200"
          : "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${classe}`}>
      {ETICHETTE_PAGAMENTO[stato] ?? stato}
    </span>
  );
}

function BadgeSpedizione({ stato }: { stato: string }) {
  const classe =
    stato === "consegnata"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      : stato === "problema"
        ? "bg-red-50 text-red-700 ring-1 ring-red-200"
        : "bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${classe}`}>
      {ETICHETTE_STATO_SPEDIZIONE[stato as keyof typeof ETICHETTE_STATO_SPEDIZIONE] ?? stato}
    </span>
  );
}
