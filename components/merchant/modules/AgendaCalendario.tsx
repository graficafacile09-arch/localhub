"use client";

/**
 * AGENDA ANNUALE — calendario a 12 mesi con eccezioni per singola data.
 *
 * Vista interna al modulo Agenda (PrenotazioniModule): navigazione tra i mesi,
 * giorni evidenziati secondo la risoluzione settimana + eccezione
 * (`risolviGiorno`), conteggio appuntamenti confermati per giorno, e editor
 * per una singola data: chiusura, orari speciali, motivo opzionale,
 * modifica/rimozione. Il salvataggio persiste in `negozi.data.agenda_eccezioni`
 * tramite PUT /settings (replace semantics + normalizzazione server-side).
 *
 * Niente secondi motori: gli slot continuano a nascere da
 * `generaSlotDisponibili` sul DaySchedule risolto da `risolviGiorno`.
 */
import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { AgendaEccezioni, Orari } from "@/types/negozio";
import {
  dataCivileOggi,
  giorniDelMese,
  giorniNelMese,
  normalizzaEccezione,
  risolviGiorno,
  spostaMese,
} from "@/lib/agenda";

const MESI_NOMI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const GIORNI_SETTIMANA = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

type Bozza = {
  chiuso: boolean;
  apertura1: string;
  chiusura1: string;
  apertura2: string;
  chiusura2: string;
  motivo: string;
};

type Props = {
  storeId: string;
  orari: Orari | null;
  eccezioni: AgendaEccezioni;
  onSalva: (eccezioni: AgendaEccezioni) => Promise<void>;
};

function settimanaGiorno(data: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${data}T00:00:00Z`));
}

function dateInput(data: string, orari: Orari | null): Bozza {
  const scheda = risolviGiorno(orari, null, data);
  return {
    chiuso: scheda.chiuso === true,
    apertura1: scheda.apertura1 ?? "",
    chiusura1: scheda.chiusura1 ?? "",
    apertura2: scheda.apertura2 ?? "",
    chiusura2: scheda.chiusura2 ?? "",
    motivo: "",
  };
}

function bozzaDaEccezione(eccezione: AgendaEccezioni[string], orari: Orari | null, data: string): Bozza {
  const base = dateInput(data, orari);
  return {
    chiuso: eccezione.chiuso === true,
    apertura1: eccezione.apertura1 ?? base.apertura1,
    chiusura1: eccezione.chiusura1 ?? base.chiusura1,
    apertura2: eccezione.apertura2 ?? base.apertura2,
    chiusura2: eccezione.chiusura2 ?? base.chiusura2,
    motivo: typeof eccezione.motivo === "string" ? eccezione.motivo : "",
  };
}

export default function AgendaCalendario({ storeId, orari, eccezioni, onSalva }: Props) {
  const oggi = dataCivileOggi();
  const [anno, setAnno] = useState(() => Number(oggi.slice(0, 4)));
  const [mese, setMese] = useState(() => Number(oggi.slice(5, 7)) - 1);
  const [selezionata, setSelezionata] = useState<string | null>(null);
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [conteggi, setConteggi] = useState<Record<string, number>>({});
  const [caricamentoConteggi, setCaricamentoConteggi] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);
  const [messaggio, setMessaggio] = useState<{ tipo: "ok" | "errore"; testo: string } | null>(null);

  // Conteggio appuntamenti confermati del mese visibile (per i badge).
  useEffect(() => {
    let attivo = true;
    setCaricamentoConteggi(true);
    const mesePiu1 = String(mese + 1).padStart(2, "0");
    const da = `${anno}-${mesePiu1}-01`;
    const a = `${anno}-${mesePiu1}-${String(giorniNelMese(anno, mese)).padStart(2, "0")}`;
    fetch(
      `/api/merchant/stores/${storeId}/prenotazioni?da=${da}&a=${a}&perPagina=366`
    )
      .then((r) => r.json())
      .then((json) => {
        if (!attivo) return;
        const conteggio: Record<string, number> = {};
        const righe = (json?.data?.prenotazioni ?? []) as Array<{
          giorno: string;
          stato: string;
        }>;
        for (const r of righe) {
          if (r.stato === "confermata" && typeof r.giorno === "string") {
            const d = String(r.giorno).slice(0, 10);
            conteggio[d] = (conteggio[d] ?? 0) + 1;
          }
        }
        setConteggi(conteggio);
      })
      .catch(() => {
        if (attivo) setConteggi({});
      })
      .finally(() => {
        if (attivo) setCaricamentoConteggi(false);
      });
    return () => {
      attivo = false;
    };
  }, [anno, mese, storeId]);

  function seleziona(data: string) {
    const eccezione = eccezioni[data];
    setSelezionata(data);
    setBozza(eccezione ? bozzaDaEccezione(eccezione, orari, data) : dateInput(data, orari));
    setMessaggio(null);
  }

  async function salva() {
    if (!selezionata || !bozza) return;
    setSalvataggio(true);
    setMessaggio(null);
    try {
      const normalizzata = normalizzaEccezione({
        chiuso: bozza.chiuso,
        apertura1: bozza.apertura1,
        chiusura1: bozza.chiusura1,
        apertura2: bozza.apertura2,
        chiusura2: bozza.chiusura2,
        motivo: bozza.motivo,
      });

      // Se la bozza coincide con il calendario settimanale (e non c'è motivo),
      // l'eccezione viene RIMOSSA: la data torna automaticamente alla
      // settimana (comportamento "rimozione eccezione → calendario settimanale").
      const settimanale = risolviGiorno(orari, null, selezionata);
      const ugualeAllaSettimana =
        normalizzata &&
        normalizzata.chiuso === settimanale.chiuso &&
        (normalizzata.apertura1 ?? "") === (settimanale.apertura1 ?? "") &&
        (normalizzata.chiusura1 ?? "") === (settimanale.chiusura1 ?? "") &&
        (normalizzata.apertura2 ?? "") === (settimanale.apertura2 ?? "") &&
        (normalizzata.chiusura2 ?? "") === (settimanale.chiusura2 ?? "") &&
        !(bozza.motivo.trim());

      const aggiornate: AgendaEccezioni = { ...eccezioni };
      if (ugualeAllaSettimana) {
        delete aggiornate[selezionata];
      } else if (normalizzata) {
        aggiornate[selezionata] = normalizzata;
      } else {
        delete aggiornate[selezionata];
      }

      await onSalva(aggiornate);
      setMessaggio({ tipo: "ok", testo: "Eccezione salvata." });
    } catch {
      setMessaggio({ tipo: "errore", testo: "Salvataggio non riuscito. Riprova." });
    } finally {
      setSalvataggio(false);
    }
  }

  async function rimuovi() {
    if (!selezionata) return;
    setSalvataggio(true);
    setMessaggio(null);
    try {
      const aggiornate: AgendaEccezioni = { ...eccezioni };
      delete aggiornate[selezionata];
      await onSalva(aggiornate);
      setMessaggio({ tipo: "ok", testo: "Eccezione rimossa. La data torna agli orari settimanali." });
    } catch {
      setMessaggio({ tipo: "errore", testo: "Operazione non riuscita. Riprova." });
    } finally {
      setSalvataggio(false);
    }
  }

  const celle = giorniDelMese(anno, mese);
  const mesePrec = spostaMese(anno, mese, -1);
  const meseSucc = spostaMese(anno, mese, 1);

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-blue-600" />
        <p className="text-sm font-bold tracking-tight text-slate-900">
          Calendario annuale
        </p>
        <p className="hidden text-[10px] text-slate-400 sm:block">
          ferie, festività e orari speciali per singola data
        </p>
      </div>

      {/* Navigazione mesi */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setAnno(mesePrec.anno);
            setMese(mesePrec.mese);
          }}
          aria-label="Mese precedente"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-black uppercase tracking-[0.14em] text-slate-700">
          {MESI_NOMI[mese]} {anno}
        </p>
        <button
          type="button"
          onClick={() => {
            setAnno(meseSucc.anno);
            setMese(meseSucc.mese);
          }}
          aria-label="Mese successivo"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Griglia */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {GIORNI_SETTIMANA.map((g) => (
          <p
            key={g}
            className="text-center text-[10px] font-black uppercase tracking-wide text-slate-400"
          >
            {g}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celle.map((c) => {
          const scheda = risolviGiorno(orari, eccezioni, c.data);
          const eccezione = eccezioni[c.data];
          const chiuso = scheda.chiuso === true;
          const conteggio = conteggi[c.data] ?? 0;
          const eOggi = c.data === oggi;
          const selezionataCell = c.data === selezionata;

          let sfondo = "bg-white text-slate-900";
          if (c.fuoriMese) sfondo = "bg-slate-50 text-slate-300";
          else if (chiuso) sfondo = "bg-slate-100 text-slate-400";
          if (eccezione && !c.fuoriMese) {
            sfondo = eccezione.chiuso === true
              ? "bg-red-50 text-red-700"
              : "bg-blue-50 text-blue-700";
          }
          if (selezionataCell) sfondo += " ring-2 ring-blue-500";

          return (
            <button
              key={c.data}
              type="button"
              onClick={() => seleziona(c.data)}
              aria-label={`Seleziona ${c.data}`}
              className={`relative flex h-10 flex-col items-center justify-center rounded-xl text-xs font-bold transition hover:bg-blue-100 ${sfondo}`}
            >
              {eOggi && (
                <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
              )}
              {c.giorno}
              {conteggio > 0 && !c.fuoriMese && (
                <span className="absolute bottom-1 rounded-full bg-slate-900 px-1 text-[9px] font-black leading-3 text-white">
                  {conteggio}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> chiuso (eccezione)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-400" /> orario speciale
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> chiuso (settimanale)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-900" /> n. appuntamenti
        </span>
      </div>

      {/* Editor data selezionata */}
      {selezionata && bozza && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-bold capitalize text-slate-900">
              {settimanaGiorno(selezionata)} · {selezionata}
            </p>
            <button
              type="button"
              onClick={() => setSelezionata(null)}
              aria-label="Chiudi editor data"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={bozza.chiuso}
              onChange={(e) => setBozza({ ...bozza, chiuso: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 accent-red-600"
            />
            Chiuso (giorno non prenotabile)
          </label>

          {!bozza.chiuso && (
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold text-slate-500">Apertura mattina</span>
                <input
                  type="time"
                  value={bozza.apertura1}
                  onChange={(e) => setBozza({ ...bozza, apertura1: e.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-none focus:border-blue-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold text-slate-500">Chiusura mattina</span>
                <input
                  type="time"
                  value={bozza.chiusura1}
                  onChange={(e) => setBozza({ ...bozza, chiusura1: e.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-none focus:border-blue-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold text-slate-500">Apertura pomeriggio</span>
                <input
                  type="time"
                  value={bozza.apertura2}
                  onChange={(e) => setBozza({ ...bozza, apertura2: e.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-none focus:border-blue-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold text-slate-500">Chiusura pomeriggio</span>
                <input
                  type="time"
                  value={bozza.chiusura2}
                  onChange={(e) => setBozza({ ...bozza, chiusura2: e.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-none focus:border-blue-500"
                />
              </label>
            </div>
          )}

          <label className="mb-3 block">
            <span className="mb-1 block text-[10px] font-semibold text-slate-500">
              Motivo (opzionale)
            </span>
            <input
              type="text"
              value={bozza.motivo}
              onChange={(e) => setBozza({ ...bozza, motivo: e.target.value })}
              placeholder="es. Ferie estive, festività, chiusura straordinaria"
              maxLength={300}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-blue-500"
            />
          </label>

          {messaggio && (
            <p
              className={`mb-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                messaggio.tipo === "ok"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {messaggio.testo}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void salva()}
              disabled={salvataggio}
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {salvataggio ? "Salvataggio..." : "Salva eccezione"}
            </button>
            {eccezioni[selezionata] && (
              <button
                type="button"
                onClick={() => void rimuovi()}
                disabled={salvataggio}
                className="rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
              >
                Rimuovi eccezione
              </button>
            )}
            <p className="text-[10px] text-slate-400">
              {caricamentoConteggi ? "Aggiorno appuntamenti..." : ""}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
