"use client";

import { useCallback, useMemo, useState } from "react";
import {
  BadgePercent,
  ChevronLeft,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { OffertaAdmin } from "@/lib/offerte";

const normalizza = (testo: string) => testo.trim().toLowerCase();

function formattaPrezzo(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formattaData(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const OPZIONI_STATO = [
  { valore: "tutte", etichetta: "Tutte" },
  { valore: "attive", etichetta: "Attive" },
  { valore: "disattivate", etichetta: "Disattivate" },
] as const;

type FiltroStato = "tutte" | "attive" | "disattivate";

export default function OfferteModule({ offerte }: { offerte: OffertaAdmin[] }) {
  const [ricerca, setRicerca] = useState("");
  const [stato, setStato] = useState<FiltroStato>("tutte");
  const [locali, setLocali] = useState<OffertaAdmin[]>(offerte);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  const visibili = useMemo(() => {
    const termine = normalizza(ricerca);
    return locali
      .filter((o) => {
        if (stato === "attive" && !o.attiva) return false;
        if (stato === "disattivate" && o.attiva) return false;
        if (!termine) return true;
        return [o.titolo, o.descrizione ?? "", o.negozio_nome ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(termine);
      })
      .sort((a, b) => {
        if (a.attiva !== b.attiva) return a.attiva ? -1 : 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [locali, ricerca, stato]);

  const attiveConteggio = locali.filter((o) => o.attiva).length;

  const cambiaStato = useCallback(async (offerta: OffertaAdmin, attiva: boolean) => {
    setErrore(null);
    setAvviso(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/amministratore/offerte/${offerta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attiva }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: { message?: string };
        data?: { offerta?: OffertaAdmin };
      } | null;
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Impossibile aggiornare l'offerta.");
      }
      const salvata = json?.data?.offerta;
      if (salvata) {
        setLocali((prev) => prev.map((x) => (x.id === salvata.id ? salvata : x)));
      }
      setAvviso(attiva ? "Offerta riattivata sul pubblico." : "Offerta disattivata.");
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
    } finally {
      setSalvando(false);
    }
  }, []);

  const elimina = useCallback(async (offerta: OffertaAdmin) => {
    if (!window.confirm(`Eliminare definitivamente l'offerta "${offerta.titolo}"?`)) return;
    setErrore(null);
    setAvviso(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/amministratore/offerte/${offerta.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Impossibile eliminare l'offerta.");
      }
      setLocali((prev) => prev.filter((x) => x.id !== offerta.id));
      setAvviso("Offerta eliminata.");
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
    } finally {
      setSalvando(false);
    }
  }, []);

  return (
    <div className="space-y-5">
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <nav aria-label="Percorso" className="mb-5">
          <button
            type="button"
            onClick={() => {
              window.location.href = "/amministratore";
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition hover:text-blue-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Torna al pannello
          </button>
        </nav>

        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <BadgePercent className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Promozioni e sconti
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Offerte
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Supervisiona le offerte pubblicate dai commercianti: cerca per
              titolo o negozio, filtra per stato e disattiva o elimina le
              promozioni non più idonee. Le modifiche si riflettono subito sui
              negozi e sulla home del pubblico.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/70 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              value={ricerca}
              onChange={(event) => setRicerca(event.target.value)}
              placeholder="Cerca offerta per titolo, descrizione o negozio..."
              aria-label="Cerca offerta"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm font-medium text-slate-700 placeholder:text-slate-400 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {OPZIONI_STATO.map((opzione) => (
              <button
                key={opzione.valore}
                type="button"
                onClick={() => setStato(opzione.valore)}
                className={`inline-flex h-10 items-center rounded-xl px-4 text-sm font-bold transition ${
                  stato === opzione.valore
                    ? "bg-yellow-400 text-blue-800 shadow-sm hover:bg-yellow-300"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {opzione.etichetta}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(errore || avviso) && (
        <div
          className={`flex items-start gap-3 rounded-3xl border px-5 py-4 text-sm ${
            errore
              ? "border-blue-200 bg-blue-50 text-blue-900"
              : "border-blue-200 bg-blue-50 text-blue-900"
          }`}
        >
          <span className="mt-0.5 block text-base font-black" aria-hidden>
            {errore ? "!" : "OK"}
          </span>
          <p className="leading-6">{errore ?? avviso}</p>
          <button
            type="button"
            onClick={() => (errore ? setErrore(null) : setAvviso(null))}
            className="ml-auto rounded p-0.5 hover:bg-black/5"
            aria-label="Chiudi avviso"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm font-black text-slate-700">
          {visibili.length} {visibili.length === 1 ? "offerta" : "offerte"}
          <span className="ml-2 font-semibold text-blue-700">· {attiveConteggio} attive</span>
        </p>
        {(ricerca || stato !== "tutte") && (
          <button
            type="button"
            onClick={() => {
              setRicerca("");
              setStato("tutte");
            }}
            className="text-xs font-semibold text-blue-600 underline-offset-2 transition hover:underline"
          >
            Azzera filtri
          </button>
        )}
      </div>

      {visibili.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-slate-100 bg-white px-6 py-16 text-center shadow-sm">
          <BadgePercent className="h-10 w-10 text-slate-200" aria-hidden />
          <p className="mt-4 text-lg font-bold text-slate-600">Nessuna offerta trovata</p>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            Non ci sono offerte che corrispondono ai filtri selezionati.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {visibili.map((offerta) => (
            <article
              key={offerta.id}
              className={`flex flex-col rounded-3xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
                offerta.attiva ? "border-white/70" : "border-slate-100 opacity-80"
              }`}
            >
              <div className="flex items-start gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                  <BadgePercent className="h-6 w-6" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black tracking-tight text-slate-900">
                      {offerta.titolo}
                    </h2>
                    {offerta.attiva ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden />
                        Attiva
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                        Disattivata
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    {offerta.negozio_nome ?? "Negozio sconosciuto"}
                  </p>

                  <div className="mt-2 flex items-center gap-3 text-sm">
                    {offerta.prezzo_originale !== null && (
                      <span className="text-slate-400 line-through">
                        {formattaPrezzo(offerta.prezzo_originale)}
                      </span>
                    )}
                    {offerta.prezzo_offerta !== null && (
                      <span className="font-black text-blue-700">
                        {formattaPrezzo(offerta.prezzo_offerta)}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    {formattaData(offerta.data_inizio)} → {formattaData(offerta.data_fine)}
                  </p>
                </div>
              </div>

              {offerta.descrizione && (
                <p className="mt-3 border-t border-slate-100 pt-3 text-sm leading-6 text-slate-600">
                  {offerta.descrizione}
                </p>
              )}

              <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                {offerta.attiva ? (
                  <button
                    type="button"
                    onClick={() => cambiaStato(offerta, false)}
                    disabled={salvando}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X className="h-4 w-4" aria-hidden />
                    Disattiva
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => cambiaStato(offerta, true)}
                    disabled={salvando}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-50 px-4 text-sm font-black text-blue-700 ring-1 ring-blue-200 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Riattiva
                  </button>
                )}
                {offerta.negozio_slug && (
                  <a
                    href={`/negozio/${offerta.negozio_slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                  >
                    Negozi
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => elimina(offerta)}
                  disabled={salvando}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 px-2 text-blue-600 ring-1 ring-blue-100 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Elimina offerta"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="rounded-3xl border border-blue-100 bg-blue-50/60 px-5 py-4 text-sm text-blue-900">
        <p className="leading-6">
          <span className="font-bold">Nota:</span> la lista riflette la tabella
          <code className="font-mono text-xs"> offerte </code>
          sincronizzata con i moduli dei commercianti. Il flag <em>&quot;attiva&quot;</em> controlla
          la visibilità sul pubblico e nel conteggio della dashboard.
        </p>
      </div>
    </div>
  );
}