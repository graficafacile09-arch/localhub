"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Inbox,
  Loader2,
  Power,
  Search,
  ShieldBan,
  X,
} from "lucide-react";
import type {
  SegnalazioneAdmin,
  SegnalazioneFiltri,
  SegnalazionePriorita,
  SegnalazioneStato,
  SegnalazioneStats,
  SegnalazioneTipo,
} from "@/lib/segnalazioni/types";
import {
  PRIORITA_LABELS,
  STATO_LABELS,
  TIPO_LABELS,
} from "@/lib/segnalazioni/types";

function formattaData(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BadgeStato({ stato }: { stato: SegnalazioneStato }) {
  switch (stato) {
    case "nuova":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden />
          Nuova
        </span>
      );
    case "presa_in_carico":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 px-2.5 py-1 text-[11px] font-bold text-yellow-700 ring-1 ring-yellow-200">
          <Clock className="h-3 w-3 text-yellow-600" aria-hidden />
          In carico
        </span>
      );
    case "risolta":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
          <CheckCircle2 className="h-3 w-3 text-blue-600" aria-hidden />
          Risolta
        </span>
      );
    case "archiviata":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
          Archiviata
        </span>
      );
  }
}

function BadgePriorita({ priorita }: { priorita: SegnalazionePriorita }) {
  switch (priorita) {
    case "urgente":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-black text-blue-800 ring-1 ring-blue-300">
          <AlertTriangle className="h-3 w-3 text-blue-600" aria-hidden />
          Urgente
        </span>
      );
    case "alta":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2.5 py-1 text-[11px] font-bold text-yellow-700 ring-1 ring-yellow-200">
          Alta
        </span>
      );
    case "normale":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
          Normale
        </span>
      );
    case "bassa":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
          Bassa
        </span>
      );
  }
}

type AzioneModerazione = {
  valore: "disattiva_negozio" | "disattiva_prodotto" | "sospendi_utente" | "banna_utente";
  etichetta: string;
  dettaglio: string;
};

function linkOggetto(segnalazione: SegnalazioneAdmin): { href: string; label: string } | null {
  if (segnalazione.negozio_id) {
    return {
      href: `/amministratore/negozi/${segnalazione.negozio_id}`,
      label: "Apri il negozio nel back office",
    };
  }
  if (segnalazione.target_type === "prodotto" && segnalazione.target_id) {
    return {
      href: `/amministratore/prodotti/${segnalazione.target_id}`,
      label: "Apri il prodotto nel back office",
    };
  }
  if (segnalazione.target_type === "utente" && segnalazione.target_id) {
    return { href: "/amministratore/utenti", label: "Gestione utenti (elenco)" };
  }
  return null;
}

function azioniModerazione(segnalazione: SegnalazioneAdmin): AzioneModerazione[] {
  const azioni: AzioneModerazione[] = [];
  const negozioId =
    segnalazione.negozio_id ??
    (segnalazione.target_type === "negozio" ? segnalazione.target_id : null);
  if (negozioId) {
    azioni.push({
      valore: "disattiva_negozio",
      etichetta: "Disattiva il negozio",
      dettaglio: "Nasconde il negozio e i suoi contenuti dalle pagine pubbliche.",
    });
  }
  if (segnalazione.target_type === "prodotto" && segnalazione.target_id) {
    azioni.push({
      valore: "disattiva_prodotto",
      etichetta: "Disattiva il prodotto",
      dettaglio: "Rende il prodotto non più visibile pubblicamente.",
    });
  }
  if (segnalazione.target_type === "utente" && segnalazione.target_id) {
    azioni.push({
      valore: "sospendi_utente",
      etichetta: "Sospendi l'utente (7 giorni)",
      dettaglio: "Blocco temporaneo dell'account segnalato.",
    });
    azioni.push({
      valore: "banna_utente",
      etichetta: "Banna l'utente",
      dettaglio: "Blocco permanente dell'account segnalato.",
    });
  }
  return azioni;
}

const AZIONE_LABELS: Record<string, string> = {
  disattiva_negozio: "negozio disattivato",
  disattiva_prodotto: "prodotto disattivato",
  sospendi_utente: "utente sospeso",
  banna_utente: "utente bannato",
};

export default function SegnalazioniModule() {
  const [segnalazioni, setSegnalazioni] = useState<SegnalazioneAdmin[]>([]);
  const [stats, setStats] = useState<SegnalazioneStats | null>(null);
  const [totale, setTotale] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selezionata, setSelezionata] = useState<SegnalazioneAdmin | null>(null);

  // Form stato modal
  const [modificaStato, setModificaStato] = useState<SegnalazioneStato>("nuova");
  const [modificaPriorita, setModificaPriorita] = useState<SegnalazionePriorita>("normale");
  const [modificaNote, setModificaNote] = useState("");
  const [salvandoDettaglio, setSalvandoDettaglio] = useState(false);
  const [azioneInCorso, setAzioneInCorso] = useState<string | null>(null);

  const [filtri, setFiltri] = useState<SegnalazioneFiltri>({
    limit: 50,
    offset: 0,
    orderBy: "created_at",
    orderDirection: "desc",
  });
  const [pagina, setPagina] = useState(0);

  const [ricerca, setRicerca] = useState("");
  const [stato, setStato] = useState("");
  const [priorita, setPriorita] = useState("");
  const [tipo, setTipo] = useState("");

  const numeroPagine = Math.max(1, Math.ceil(totale / (filtri.limit ?? 50)));
  const paginaEffettiva = Math.min(pagina, numeroPagine - 1);

  const caricaDati = useCallback(async () => {
    setIsLoading(true);
    setErrore(null);
    const params = new URLSearchParams();
    if (filtri.ricerca) params.set("q", filtri.ricerca);
    if (filtri.stato) params.set("stato", filtri.stato);
    if (filtri.priorita) params.set("priorita", filtri.priorita);
    if (filtri.tipo) params.set("tipo", filtri.tipo);
    if (filtri.orderBy) params.set("orderBy", filtri.orderBy);
    if (filtri.orderDirection) params.set("orderDirection", filtri.orderDirection);
    params.set("limit", String(filtri.limit ?? 50));
    params.set("offset", String(filtri.offset ?? 0));

    try {
      const res = await fetch(`/api/amministratore/segnalazioni?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        segnalazioni?: SegnalazioneAdmin[];
        totale?: number;
        hasMore?: boolean;
        stats?: SegnalazioneStats | null;
        data?: {
          segnalazioni?: SegnalazioneAdmin[];
          totale?: number;
          hasMore?: boolean;
          stats?: SegnalazioneStats | null;
        };
      };
      const payload = json?.data ?? json;
      setSegnalazioni(payload.segnalazioni ?? []);
      setTotale(payload.totale ?? 0);
      setHasMore(Boolean(payload.hasMore));
      setStats(payload.stats ?? null);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore caricamento segnalazioni");
    } finally {
      setIsLoading(false);
    }
  }, [filtri]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    caricaDati();
  }, [caricaDati]);

  const applicaFiltri = useCallback(() => {
    setPagina(0);
    setFiltri((prev) => ({
      ...prev,
      ricerca: ricerca || undefined,
      stato: (stato as SegnalazioneStato) || undefined,
      priorita: (priorita as SegnalazionePriorita) || undefined,
      tipo: (tipo as SegnalazioneTipo) || undefined,
      offset: 0,
    }));
  }, [ricerca, stato, priorita, tipo]);

  const azzeraFiltri = useCallback(() => {
    setRicerca("");
    setStato("");
    setPriorita("");
    setTipo("");
    setPagina(0);
    setFiltri((prev) => ({
      ...prev,
      ricerca: undefined,
      stato: undefined,
      priorita: undefined,
      tipo: undefined,
      offset: 0,
    }));
  }, []);

  const vaiAPagina = useCallback(
    (prossima: number) => {
      const limite = filtri.limit ?? 50;
      const nuova = Math.max(0, Math.min(prossima, Math.max(0, numeroPagine - 1)));
      if (nuova === paginaEffettiva && nuova === pagina) return;
      setPagina(nuova);
      setFiltri((prev) => ({ ...prev, offset: nuova * limite }));
    },
    [filtri.limit, numeroPagine, pagina, paginaEffettiva]
  );

  const cambiaPerPagina = useCallback((valore: number) => {
    setPagina(0);
    setFiltri((prev) => ({ ...prev, limit: valore, offset: 0 }));
  }, []);

  const apriDettaglio = (item: SegnalazioneAdmin) => {
    setErrore(null);
    setFeedback(null);
    setSelezionata(item);
    setModificaStato(item.stato);
    setModificaPriorita(item.priorita);
    setModificaNote(item.note_admin ?? "");
  };

  const salvaDettaglio = async () => {
    if (!selezionata) return;
    setSalvandoDettaglio(true);
    setErrore(null);
    setFeedback(null);

    const patch: Record<string, unknown> = {};
    if (modificaStato !== selezionata.stato) patch.stato = modificaStato;
    if (modificaPriorita !== selezionata.priorita) patch.priorita = modificaPriorita;
    if (modificaNote !== (selezionata.note_admin ?? "")) patch.note_admin = modificaNote;

    if (Object.keys(patch).length === 0) {
      setSalvandoDettaglio(false);
      setSelezionata(null);
      return;
    }

    try {
      const res = await fetch(`/api/amministratore/segnalazioni/${selezionata.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message ?? `Errore HTTP ${res.status}`);
      }

      const json = (await res.json()) as {
        segnalazione?: SegnalazioneAdmin;
        data?: { segnalazione?: SegnalazioneAdmin };
      };
      const aggiornata = json?.data?.segnalazione ?? json?.segnalazione;
      if (!aggiornata) {
        throw new Error("Risposta senza segnalazione aggiornata.");
      }

      setSegnalazioni((prev) => prev.map((s) => (s.id === aggiornata.id ? aggiornata : s)));
      setSelezionata(null);
      setFeedback("Segnalazione aggiornata.");
      caricaDati();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore aggiornamento segnalazione");
    } finally {
      setSalvandoDettaglio(false);
    }
  };

  const eseguiModerazione = async (azione: AzioneModerazione) => {
    if (!selezionata) return;
    if (!window.confirm(`Eseguire l'azione "${azione.etichetta}" sull'oggetto della segnalazione?`)) {
      return;
    }
    setAzioneInCorso(azione.valore);
    setErrore(null);
    setFeedback(null);
    try {
      const res = await fetch(`/api/amministratore/segnalazioni/${selezionata.id}/azione`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione: azione.valore }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Impossibile eseguire l'azione.");
      }
      setFeedback(
        `Azione eseguita: ${AZIONE_LABELS[azione.valore]}. Aggiorna lo stato della segnalazione quando la moderazione è conclusa.`
      );
      caricaDati();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore sconosciuto.");
    } finally {
      setAzioneInCorso(null);
    }
  };

  const haFiltriAttivi = ricerca || stato || priorita || tipo;

  const ordinaPer = (campo: "created_at" | "priorita") => {
    setPagina(0);
    setFiltri((prev) => ({
      ...prev,
      orderBy: campo,
      orderDirection:
        prev.orderBy === campo && prev.orderDirection === "desc" ? "asc" : "desc",
      offset: 0,
    }));
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="card p-6 md:p-8">
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

        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-yellow-50 text-yellow-600 ring-1 ring-yellow-100">
            <Inbox className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-yellow-700">
              Moderazione e supporto
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Segnalazioni utenti
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Gestisci i problemi, i contenuti inopportuni e i ticket inviati dagli
              utenti: cambia stato, assegna priorità, aggiungi note e applica le
              azioni di moderazione disponibili sull&apos;oggetto segnalato.
            </p>
          </div>
        </div>

        {/* Stats rapide */}
        {stats && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 pt-5 border-t border-slate-100">
            <div className="rounded-2xl bg-slate-50 p-3.5">
              <p className="text-xs font-semibold text-slate-500">Totali</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{stats.totale}</p>
            </div>
            <div className="rounded-2xl bg-blue-50/70 p-3.5">
              <p className="text-xs font-semibold text-blue-700">Nuove</p>
              <p className="mt-1 text-2xl font-black text-blue-900">
                {stats.perStato.find((s) => s.stato === "nuova")?.count ?? 0}
              </p>
            </div>
            <div className="rounded-2xl bg-yellow-50/70 p-3.5">
              <p className="text-xs font-semibold text-yellow-700">In carico</p>
              <p className="mt-1 text-2xl font-black text-yellow-900">
                {stats.perStato.find((s) => s.stato === "presa_in_carico")?.count ?? 0}
              </p>
            </div>
            <div className="rounded-2xl bg-blue-50/70 p-3.5">
              <p className="text-xs font-semibold text-blue-700">Urgenti / Alte</p>
              <p className="mt-1 text-2xl font-black text-blue-900">
                {(stats.perPriorita.find((p) => p.priorita === "urgente")?.count ?? 0) +
                  (stats.perPriorita.find((p) => p.priorita === "alta")?.count ?? 0)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Toolbar filtri */}
      <div className="card p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applicaFiltri()}
              placeholder="Cerca per titolo, descrizione, email, oggetto..."
              aria-label="Cerca segnalazioni"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-700 placeholder:text-slate-400 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={stato}
              onChange={(e) => setStato(e.target.value)}
              onBlur={applicaFiltri}
              aria-label="Filtra per stato"
              className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-700 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Tutti gli stati</option>
              {Object.entries(STATO_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={priorita}
              onChange={(e) => setPriorita(e.target.value)}
              onBlur={applicaFiltri}
              aria-label="Filtra per priorità"
              className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-700 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Tutte le priorità</option>
              {Object.entries(PRIORITA_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              onBlur={applicaFiltri}
              aria-label="Filtra per tipo"
              className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-700 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Tutti i tipi</option>
              {Object.entries(TIPO_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => ordinaPer("priorita")}
              className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
                filtri.orderBy === "priorita"
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
              }`}
            >
              Ordina per priorità
            </button>

            <select
              value={String(filtri.limit ?? 50)}
              onChange={(e) => cambiaPerPagina(Number(e.target.value))}
              aria-label="Segnalazioni per pagina"
              className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-700 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="20">20 per pagina</option>
              <option value="50">50 per pagina</option>
              <option value="100">100 per pagina</option>
            </select>
          </div>
        </div>

        {haFiltriAttivi && (
          <button
            type="button"
            onClick={azzeraFiltri}
            className="mt-2 text-xs font-semibold text-blue-600 underline-offset-2 transition hover:underline"
          >
            Azzera filtri
          </button>
        )}
      </div>

      {errore && (
        <div className="flex items-start gap-3 rounded-3xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
          <p className="leading-6">{errore}</p>
          <button
            type="button"
            onClick={() => setErrore(null)}
            className="ml-auto rounded p-0.5 hover:bg-blue-100"
            aria-label="Chiudi messaggio"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {feedback && (
        <div className="flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="leading-6">{feedback}</p>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="ml-auto rounded p-0.5 hover:bg-emerald-100"
            aria-label="Chiudi messaggio"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="rounded-[2rem] border border-white/70 bg-white p-12 shadow-sm flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
        </div>
      ) : segnalazioni.length === 0 ? (
        <div className="rounded-[2rem] border border-slate-100 bg-white px-6 py-16 text-center shadow-sm">
          <Inbox className="h-10 w-10 mx-auto text-slate-200" aria-hidden />
          <p className="mt-4 text-lg font-bold text-slate-600">Nessuna segnalazione trovata</p>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            {haFiltriAttivi
              ? "Prova a modificare i filtri selezionati."
              : "Non sono presenti segnalazioni nel sistema."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-black text-slate-700">
              {totale} {totale === 1 ? "segnalazione" : "segnalazioni"}
            </p>
          </div>

          <div className="grid gap-3">
            {segnalazioni.map((s) => (
              <article
                key={s.id}
                onClick={() => apriDettaglio(s)}
                className="group cursor-pointer card p-5 transition hover:border-yellow-300 hover:shadow-md"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <BadgeStato stato={s.stato} />
                      <BadgePriorita priorita={s.priorita} />
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                        {TIPO_LABELS[s.tipo] ?? s.tipo}
                      </span>
                    </div>

                    <h2 className="text-base font-black tracking-tight text-slate-900 group-hover:text-blue-700 transition">
                      {s.titolo}
                    </h2>

                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {s.descrizione}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400">
                      <span>Inviata da: <strong className="text-slate-700">{s.user_email ?? "Anonimo"}</strong></span>
                      <span>·</span>
                      <span>{formattaData(s.created_at)}</span>
                      {s.target_name && (
                        <>
                          <span>·</span>
                          <span className="truncate max-w-[200px]">
                            Oggetto: <strong className="text-slate-700">{s.target_name}</strong>
                          </span>
                        </>
                      )}
                      {s.negozio_nome && (
                        <>
                          <span>·</span>
                          <span>Negozio: <strong className="text-slate-700">{s.negozio_nome}</strong></span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 self-end md:self-center">
                    <span className="inline-flex items-center gap-1 rounded-xl bg-yellow-100 px-3 py-2 text-xs font-bold text-yellow-800 transition group-hover:bg-yellow-300 group-hover:text-blue-900">
                      Gestisci
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Paginazione */}
          {numeroPagine > 1 && (
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p>
                {segnalazioni.length === 0
                  ? "Nessun risultato"
                  : `Pagina ${paginaEffettiva + 1} di ${numeroPagine}`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => vaiAPagina(paginaEffettiva - 1)}
                  disabled={paginaEffettiva <= 0 || isLoading}
                  aria-label="Pagina precedente"
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  Precedente
                </button>
                <button
                  type="button"
                  onClick={() => vaiAPagina(paginaEffettiva + 1)}
                  disabled={paginaEffettiva >= numeroPagine - 1 || !hasMore || isLoading}
                  aria-label="Pagina successiva"
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Successiva
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal dettaglio */}
      {selezionata && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem] border border-white/70 bg-white p-6 shadow-2xl md:p-8">
            <button
              type="button"
              onClick={() => setSelezionata(null)}
              className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <BadgeStato stato={selezionata.stato} />
              <BadgePriorita priorita={selezionata.priorita} />
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                {TIPO_LABELS[selezionata.tipo] ?? selezionata.tipo}
              </span>
            </div>

            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              {selezionata.titolo}
            </h2>

            <div className="mt-2 text-xs text-slate-500 space-y-1">
              <p>Inviata da: <strong className="text-slate-800">{selezionata.user_email ?? "Anonimo"}</strong> ({formattaData(selezionata.created_at)})</p>
              {selezionata.target_name && (
                <p>Oggetto segnalato: <strong className="text-slate-800">{selezionata.target_name}</strong> ({selezionata.target_type ?? "generico"})</p>
              )}
              {selezionata.negozio_nome && (
                <p>Negozio correlato: <strong className="text-slate-800">{selezionata.negozio_nome}</strong></p>
              )}
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-4 border border-slate-100">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Descrizione utente
              </p>
              <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                {selezionata.descrizione}
              </p>
            </div>

            {/* Oggetto segnalato: link utilizzabile al back office */}
            {linkOggetto(selezionata) && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50/50 px-4 py-3">
                <Link
                  href={linkOggetto(selezionata)!.href}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700 transition hover:text-blue-900"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  {linkOggetto(selezionata)!.label}
                </Link>
              </div>
            )}

            {/* Azioni di moderazione sull'oggetto segnalato */}
            {azioniModerazione(selezionata).length > 0 && (
              <div className="mt-4 rounded-2xl border border-yellow-200 bg-yellow-50/60 p-4">
                <h3 className="text-sm font-black text-yellow-900 uppercase tracking-wider">
                  Azioni di moderazione
                </h3>
                <p className="mt-1 text-xs leading-5 text-yellow-800">
                  Le azioni agiscono sull&apos;oggetto segnalato (verificato lato
                  server) e vengono registrate nel registro attività. Dopo
                  l&apos;esecuzione aggiorna lo stato della segnalazione.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {azioniModerazione(selezionata).map((azione) => (
                    <button
                      key={azione.valore}
                      type="button"
                      disabled={azioneInCorso !== null || salvandoDettaglio}
                      onClick={() => void eseguiModerazione(azione)}
                      title={azione.dettaglio}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-yellow-300 bg-white px-3 py-2 text-xs font-bold text-yellow-800 transition hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {azione.valore === "banna_utente" ? (
                        <ShieldBan className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Power className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {azioneInCorso === azione.valore ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : null}
                      {azione.etichetta}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Form gestione admin */}
            <div className="mt-6 pt-5 border-t border-slate-100 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Gestione Amministrativa
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Stato
                  </label>
                  <select
                    value={modificaStato}
                    onChange={(e) => setModificaStato(e.target.value as SegnalazioneStato)}
                    className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    {Object.entries(STATO_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Priorità
                  </label>
                  <select
                    value={modificaPriorita}
                    onChange={(e) => setModificaPriorita(e.target.value as SegnalazionePriorita)}
                    className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    {Object.entries(PRIORITA_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Note interne admin
                </label>
                <textarea
                  rows={3}
                  value={modificaNote}
                  onChange={(e) => setModificaNote(e.target.value)}
                  placeholder="Aggiungi note ad uso interno degli amministratori..."
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {selezionata.resolved_at && (
                <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
                  Risolta il {formattaData(selezionata.resolved_at)}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelezionata(null)}
                  className="h-11 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={salvaDettaglio}
                  disabled={salvandoDettaglio}
                  className="btn-cta h-11 px-5 text-sm disabled:opacity-50"
                >
                  {salvandoDettaglio && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salva modifiche
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
