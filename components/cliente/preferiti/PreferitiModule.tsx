"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Heart, Search } from "lucide-react";
import ClienteEmptyState from "@/components/cliente/ClienteEmptyState";
import PreferitoCard from "./PreferitoCard";
import type { ClientePreferito, TipoPreferito } from "@/lib/cliente/types";

const LIMITE_PAGINA = 12;

type FiltroTipo = TipoPreferito | "tutti";

/**
 * Modulo Preferiti dell'Area Clienti — FASE 3.
 *
 * Elenco reale dei preferiti con:
 *   - filtro per tipologia (Tutti / Negozi / Prodotti);
 *   - ricerca testuale sul nome;
 *   - ordinamento (più recenti / nome A-Z);
 *   - paginazione progressiva (limite + offset, "Carica altri").
 *
 * Predisposto per le evoluzioni future: notifiche e offerte personalizzate
 * potranno essere aggiunte come sezioni dedicate senza toccare la struttura.
 */
export default function PreferitiModule() {
  const [preferiti, setPreferiti] = useState<ClientePreferito[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("tutti");
  const [ricerca, setRicerca] = useState("");
  const [testoRicerca, setTestoRicerca] = useState("");
  const [ordine, setOrdine] = useState<"recenti" | "nome">("recenti");
  const [loading, setLoading] = useState(true);
  const [caricamentoAltri, setCaricamentoAltri] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [haAltri, setHaAltri] = useState(false);
  const [rimozioneId, setRimozioneId] = useState<string | null>(null);

  const offsetRef = useRef(0);
  const primaRiga = useRef(true);

  /**
   * Carica i preferiti. Filtri e ordinamento vengono passati come parametri
   * espliciti (mai letti da un closure stantio): ogni cambio tab/ordinamento
   * invoca subito il fetch con i nuovi valori senza attendere il re-render.
   */
  const carica = useCallback(
    async (
      reset: boolean,
      term: string,
      tipo: FiltroTipo,
      valoreOrdine: "recenti" | "nome"
    ) => {
      if (reset) {
        offsetRef.current = 0;
        setLoading(true);
      } else {
        setCaricamentoAltri(true);
      }
      setErrore(null);

      try {
        const params = new URLSearchParams();
        if (tipo !== "tutti") params.set("tipo", tipo);
        if (term.trim()) params.set("q", term.trim());
        if (valoreOrdine === "nome") params.set("ordine", "nome");
        params.set("limite", String(LIMITE_PAGINA));
        params.set("offset", String(offsetRef.current));

        const response = await fetch(`/api/cliente/preferiti?${params.toString()}`);
        if (!response.ok) {
          throw new Error("Impossibile caricare i preferiti.");
        }

        const json = (await response.json()) as {
          data?: { preferiti?: ClientePreferito[] };
        };
        const nuovi = json.data?.preferiti ?? [];

        setPreferiti((attuali) =>
          reset ? nuovi : [...attuali, ...nuovi]
        );
        setHaAltri(nuovi.length === LIMITE_PAGINA);
      } catch (error) {
        setErrore(
          error instanceof Error
            ? error.message
            : "Impossibile caricare i preferiti."
        );
      } finally {
        setLoading(false);
        setCaricamentoAltri(false);
      }
    },
    []
  );

  // Prima riga: caricamento iniziale (un solo fetch al mount).
  useEffect(() => {
    if (primaRiga.current) {
      primaRiga.current = false;
      carica(true, testoRicerca, "tutti", "recenti");
    }
  }, [carica, testoRicerca]);

  // Submit della ricerca (senza debounce per semplicità e determinismo).
  function applicaRicerca(event: React.FormEvent) {
    event.preventDefault();
    setTestoRicerca(ricerca);
    carica(true, ricerca, filtroTipo, ordine);
  }

  function cambiaFiltro(tipo: FiltroTipo) {
    setFiltroTipo(tipo);
    carica(true, testoRicerca, tipo, ordine);
  }

  function cambiaOrdine(value: "recenti" | "nome") {
    setOrdine(value);
    carica(true, testoRicerca, filtroTipo, value);
  }

  function caricaAltri() {
    offsetRef.current += LIMITE_PAGINA;
    carica(false, testoRicerca, filtroTipo, ordine);
  }

  async function rimuovi(id: string) {
    setRimozioneId(id);
    try {
      const response = await fetch("/api/cliente/preferiti", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        throw new Error("Impossibile rimuovere il preferito.");
      }
      setPreferiti((attuali) => attuali.filter((item) => item.id !== id));
    } catch {
      setErrore("Impossibile rimuovere il preferito. Riprova.");
    } finally {
      setRimozioneId(null);
    }
  }

  const etichette: Record<FiltroTipo, string> = {
    tutti: "Tutti",
    negozio: "Negozi",
    prodotto: "Prodotti",
  };

  return (
    <div className="space-y-5">
      {/* ── Intestazione ───────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-sm">
        <div className="h-1.5 bg-linear-to-r from-rose-300 via-pink-400 to-rose-500" />
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
              <Heart className="h-7 w-7" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">
                I tuoi preferiti
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Negozi e prodotti salvati per non perderli di vista.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Barra filtri ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/70 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between">
        {/* Tabs tipologia */}
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtra per tipologia">
          {(Object.keys(etichette) as FiltroTipo[]).map((tipo) => (
            <button
              key={tipo}
              type="button"
              role="tab"
              aria-selected={filtroTipo === tipo}
              onClick={() => cambiaFiltro(tipo)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                filtroTipo === tipo
                  ? "bg-rose-500 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {etichette[tipo]}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Ricerca */}
          <form onSubmit={applicaRicerca} className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              value={ricerca}
              onChange={(event) => setRicerca(event.target.value)}
              placeholder="Cerca tra i preferiti..."
              aria-label="Cerca tra i preferiti"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-rose-300 focus:bg-white focus:outline-none sm:w-56"
            />
          </form>

          {/* Ordinamento */}
          <select
            value={ordine}
            onChange={(event) =>
              cambiaOrdine(event.target.value as "recenti" | "nome")
            }
            aria-label="Ordina preferiti"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 focus:border-rose-300 focus:bg-white focus:outline-none"
          >
            <option value="recenti">Più recenti</option>
            <option value="nome">Nome A-Z</option>
          </select>
        </div>
      </div>

      {/* ── Errore ─────────────────────────────────────────────────────────── */}
      {errore && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {errore}
        </div>
      )}

      {/* ── Skeleton ───────────────────────────────────────────────────────── */}
      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="animate-pulse overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm"
            >
              <div className="aspect-[16/10] bg-slate-100" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-2/3 rounded bg-slate-100" />
                <div className="h-2.5 w-1/3 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Griglia preferiti ──────────────────────────────────────────────── */}
      {!loading && !errore && preferiti.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {preferiti.map((preferito) => (
            <PreferitoCard
              key={preferito.id}
              preferito={preferito}
              onRimuovi={rimuovi}
              rimuovendo={rimozioneId === preferito.id}
            />
          ))}
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {!loading && !errore && preferiti.length === 0 && (
        <ClienteEmptyState
          icon={Heart}
          title={
            filtroTipo === "tutti" && !testoRicerca
              ? "Nessun preferito salvato"
              : "Nessun risultato"
          }
          description={
            filtroTipo === "tutti" && !testoRicerca
              ? "Salva negozi e prodotti con il cuore per ritrovarli qui, sempre a portata di mano."
              : "Nessun preferito corrisponde ai filtri selezionati. Prova a modificarli."
          }
          action={
            <Link
              href="/negozi"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              Esplora i negozi
            </Link>
          }
        />
      )}

      {/* ── Paginazione ────────────────────────────────────────────────────── */}
      {!loading && !errore && haAltri && (
        <div className="text-center">
          <button
            type="button"
            onClick={caricaAltri}
            disabled={caricamentoAltri}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-rose-200 hover:text-rose-600 disabled:opacity-60"
          >
            {caricamentoAltri ? "Caricamento..." : "Carica altri preferiti"}
          </button>
        </div>
      )}
    </div>
  );
}
