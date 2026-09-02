"use client";

import { useCallback, useMemo, useState } from "react";
import {
  BadgePercent,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
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
type Ordinamento = "recenti" | "titolo" | "scadenza";

type FormOfferta = {
  id: string | null;
  negozio_id: string;
  titolo: string;
  descrizione: string;
  prezzo_originale: string;
  prezzo_offerta: string;
  data_inizio: string;
  data_fine: string;
  attiva: boolean;
};

function formVuota(): FormOfferta {
  return {
    id: null,
    negozio_id: "",
    titolo: "",
    descrizione: "",
    prezzo_originale: "",
    prezzo_offerta: "",
    data_inizio: "",
    data_fine: "",
    attiva: true,
  };
}

function formDaOfferta(offerta: OffertaAdmin): FormOfferta {
  return {
    id: offerta.id,
    negozio_id: offerta.negozio_id,
    titolo: offerta.titolo,
    descrizione: offerta.descrizione ?? "",
    prezzo_originale: offerta.prezzo_originale !== null ? String(offerta.prezzo_originale) : "",
    prezzo_offerta: offerta.prezzo_offerta !== null ? String(offerta.prezzo_offerta) : "",
    data_inizio: (offerta.data_inizio ?? "").slice(0, 10),
    data_fine: (offerta.data_fine ?? "").slice(0, 10),
    attiva: offerta.attiva,
  };
}

const classeInput =
  "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-yellow-400 focus:bg-white focus:ring-2 focus:ring-yellow-100";

const classeSelettore =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100";

export default function OfferteModule({
  offerte,
  negozi,
}: {
  offerte: OffertaAdmin[];
  negozi: { id: string; nome: string }[];
}) {
  const [ricerca, setRicerca] = useState("");
  const [stato, setStato] = useState<FiltroStato>("tutte");
  const [negozioFiltro, setNegozioFiltro] = useState("tutti");
  const [ordinamento, setOrdinamento] = useState<Ordinamento>("recenti");
  const [pagina, setPagina] = useState(1);
  const [perPagina, setPerPagina] = useState(12);
  const [locali, setLocali] = useState<OffertaAdmin[]>(offerte);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<"crea" | "modifica" | null>(null);
  const [modifica, setModifica] = useState<OffertaAdmin | null>(null);
  const [form, setForm] = useState<FormOfferta>(formVuota);

  const filtriAttivi =
    ricerca.trim() !== "" || stato !== "tutte" || negozioFiltro !== "tutti";

  const filtrate = useMemo(() => {
    const termine = normalizza(ricerca);
    return locali
      .filter((o) => {
        if (stato === "attive" && !o.attiva) return false;
        if (stato === "disattivate" && o.attiva) return false;
        if (negozioFiltro !== "tutti" && o.negozio_id !== negozioFiltro) return false;
        if (!termine) return true;
        return [o.titolo, o.descrizione ?? "", o.negozio_nome ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(termine);
      })
      .sort((a, b) => {
        if (ordinamento === "titolo") {
          return a.titolo.localeCompare(b.titolo, "it", { sensitivity: "base" });
        }
        if (ordinamento === "scadenza") {
          if (!a.data_fine && !b.data_fine) return 0;
          if (!a.data_fine) return 1;
          if (!b.data_fine) return -1;
          return new Date(a.data_fine).getTime() - new Date(b.data_fine).getTime();
        }
        // "recenti": attive prima, poi per data di creazione (più recenti in testa).
        if (a.attiva !== b.attiva) return a.attiva ? -1 : 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [locali, negozioFiltro, ordinamento, ricerca, stato]);

  const numeroPagine = Math.max(1, Math.ceil(filtrate.length / perPagina));
  const paginaEffettiva = Math.min(pagina, numeroPagine);
  const paginaCorrente = filtrate.slice(
    (paginaEffettiva - 1) * perPagina,
    paginaEffettiva * perPagina
  );

  const attiveConteggio = locali.filter((o) => o.attiva).length;

  function apriCrea() {
    setForm(formVuota());
    setErrore(null);
    setAvviso(null);
    setDialogo("crea");
  }

  function apriModifica(offerta: OffertaAdmin) {
    setModifica(offerta);
    setForm(formDaOfferta(offerta));
    setErrore(null);
    setAvviso(null);
    setDialogo("modifica");
  }

  function chiudiDialogo() {
    setDialogo(null);
    setModifica(null);
    setErrore(null);
  }

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

  const salvaOfferta = useCallback(async () => {
    setErrore(null);
    setAvviso(null);

    const inModifica = form.id !== null;
    const nomeNegozio = inModifica
      ? modifica?.negozio_nome ?? ""
      : negozi.find((n) => n.id === form.negozio_id)?.nome ?? "";
    if (!inModifica && !form.negozio_id) {
      setErrore("Seleziona il negozio dell'offerta.");
      return;
    }
    if (!form.titolo.trim()) {
      setErrore("Il titolo dell'offerta è obbligatorio.");
      return;
    }
    if (form.prezzo_originale && !/^\d+(\.\d+)?$/.test(form.prezzo_originale)) {
      setErrore("Il prezzo originale deve essere un numero valido.");
      return;
    }
    if (form.prezzo_offerta && !/^\d+(\.\d+)?$/.test(form.prezzo_offerta)) {
      setErrore("Il prezzo offerta deve essere un numero valido.");
      return;
    }

    setSalvando(true);
    try {
      const payload: Record<string, unknown> = {
        titolo: form.titolo.trim(),
        descrizione: form.descrizione.trim() || null,
        prezzo_originale: form.prezzo_originale ? Number(form.prezzo_originale) : null,
        prezzo_offerta: form.prezzo_offerta ? Number(form.prezzo_offerta) : null,
        data_inizio: form.data_inizio ? new Date(form.data_inizio).toISOString() : null,
        data_fine: form.data_fine ? new Date(form.data_fine).toISOString() : null,
        attiva: form.attiva,
      };
      if (!inModifica) payload.negozio_id = form.negozio_id;

      const res = await fetch(
        inModifica
          ? `/api/amministratore/offerte/${form.id}`
          : "/api/amministratore/offerte",
        {
          method: inModifica ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: { message?: string };
        data?: { offerta?: OffertaAdmin };
      } | null;
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Impossibile salvare l'offerta.");
      }
      const salvata = json?.data?.offerta;
      if (!salvata) throw new Error("Risposta non valida dal server.");

      setLocali((prev) => {
        const altre = prev.filter((o) => o.id !== salvata.id);
        return [salvata, ...altre];
      });
      setDialogo(null);
      setModifica(null);
      setAvviso(
        inModifica
          ? `Offerta aggiornata${nomeNegozio ? ` (${nomeNegozio})` : ""}.`
          : `Offerta creata per ${nomeNegozio}.`
      );
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
    } finally {
      setSalvando(false);
    }
  }, [form, modifica, negozi]);

  function azzeraFiltri() {
    setRicerca("");
    setStato("tutte");
    setNegozioFiltro("tutti");
    setPagina(1);
  }

  return (
    <div className="space-y-5">
      <div className="card p-6 md:p-8">
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

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
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
                Crea e supervisiona le offerte dei negozi: scegli il negozio,
                imposta titolo, prezzi e date, attiva o disattiva le promozioni.
                Le modifiche si riflettono subito sui negozi e sul pubblico.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={apriCrea}
            className="btn-cta inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Nuova offerta
          </button>
        </div>
      </div>

      <div className="card p-4 md:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              value={ricerca}
              onChange={(event) => {
                setRicerca(event.target.value);
                setPagina(1);
              }}
              placeholder="Cerca offerta per titolo, descrizione o negozio..."
              aria-label="Cerca offerta"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-700 placeholder:text-slate-400 transition focus:border-yellow-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-yellow-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {OPZIONI_STATO.map((opzione) => (
              <button
                key={opzione.valore}
                type="button"
                onClick={() => {
                  setStato(opzione.valore);
                  setPagina(1);
                }}
                className={`inline-flex h-10 items-center rounded-xl px-4 text-sm font-bold transition ${
                  stato === opzione.valore
                    ? "btn-cta h-10 px-4 text-sm font-bold"
                    : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                }`}
              >
                {opzione.etichetta}
              </button>
            ))}
            <select
              value={negozioFiltro}
              onChange={(event) => {
                setNegozioFiltro(event.target.value);
                setPagina(1);
              }}
              aria-label="Filtra per negozio"
              className={classeSelettore}
            >
              <option value="tutti">Tutti i negozi</option>
              {negozi.map((negozio) => (
                <option key={negozio.id} value={negozio.id}>
                  {negozio.nome}
                </option>
              ))}
            </select>
            <select
              value={ordinamento}
              onChange={(event) => {
                setOrdinamento(event.target.value as Ordinamento);
                setPagina(1);
              }}
              aria-label="Ordina offerte"
              className={classeSelettore}
            >
              <option value="recenti">Più recenti</option>
              <option value="titolo">Titolo</option>
              <option value="scadenza">Per scadenza</option>
            </select>
            <select
              value={perPagina}
              onChange={(event) => {
                setPerPagina(Number(event.target.value));
                setPagina(1);
              }}
              aria-label="Offerte per pagina"
              className={classeSelettore}
            >
              <option value={12}>12 righe</option>
              <option value={24}>24 righe</option>
              <option value={48}>48 righe</option>
            </select>
          </div>
        </div>
      </div>

      {(errore || avviso) && (
        <div className="flex items-start gap-3 rounded-3xl border border-yellow-300 bg-yellow-50 px-5 py-4 text-sm text-yellow-900">
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
          {filtrate.length} {filtrate.length === 1 ? "offerta" : "offerte"}
          {filtriAttivi && ` (su ${locali.length})`}
          <span className="ml-2 font-semibold text-blue-700">· {attiveConteggio} attive</span>
        </p>
        {filtriAttivi && (
          <button
            type="button"
            onClick={azzeraFiltri}
            className="text-xs font-semibold text-blue-600 underline-offset-2 transition hover:underline"
          >
            Azzera filtri
          </button>
        )}
      </div>

      {paginaCorrente.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-slate-100 bg-white px-6 py-16 text-center shadow-sm">
          <BadgePercent className="h-10 w-10 text-slate-200" aria-hidden />
          <p className="mt-4 text-lg font-bold text-slate-600">
            {locali.length === 0 ? "Nessuna offerta creata" : "Nessuna offerta trovata"}
          </p>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            {locali.length === 0
              ? "Crea la prima offerta scegliendo un negozio e definendo prezzi e periodo."
              : "Non ci sono offerte che corrispondono ai filtri selezionati."}
          </p>
          {locali.length === 0 ? (
            <button
              type="button"
              onClick={apriCrea}
              className="btn-cta mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Crea la prima offerta
            </button>
          ) : (
            <button
              type="button"
              onClick={azzeraFiltri}
              className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
            >
              Azzera i filtri
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {paginaCorrente.map((offerta) => (
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
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-yellow-100 px-4 text-sm font-bold text-yellow-800 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X className="h-4 w-4" aria-hidden />
                    Disattiva
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => cambiaStato(offerta, true)}
                    disabled={salvando}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-yellow-50 px-4 text-sm font-black text-yellow-800 ring-1 ring-yellow-200 transition hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Riattiva
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => apriModifica(offerta)}
                  disabled={salvando}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                  Modifica
                </button>
                {offerta.negozio_slug && (
                  <a
                    href={`/negozio/${offerta.negozio_slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800"
                  >
                    Negozi
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => elimina(offerta)}
                  disabled={salvando}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-50 px-2 text-yellow-700 ring-1 ring-yellow-200 transition hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Elimina offerta"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {numeroPagine > 1 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm text-slate-500">
            {filtrate.length === 0
              ? "Nessun risultato"
              : `Visualizzati ${(paginaEffettiva - 1) * perPagina + 1}–${Math.min(
                  paginaEffettiva * perPagina,
                  filtrate.length
                )} di ${filtrate.length}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPagina((precedente) => Math.max(1, precedente - 1))}
              disabled={paginaEffettiva <= 1}
              aria-label="Pagina precedente"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <span className="min-w-20 text-center text-xs font-bold text-slate-600">
              Pagina {paginaEffettiva} di {numeroPagine}
            </span>
            <button
              type="button"
              onClick={() => setPagina((precedente) => Math.min(numeroPagine, precedente + 1))}
              disabled={paginaEffettiva >= numeroPagine}
              aria-label="Pagina successiva"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-blue-100 bg-blue-50/60 px-5 py-4 text-sm text-blue-900">
        <p className="leading-6">
          <span className="font-bold">Nota:</span> questa sezione gestisce la
          tabella <code className="font-mono text-xs"> offerte </code>
          sincronizzata con i moduli dei commercianti. Il flag{" "}
          <em>&quot;attiva&quot;</em> controlla la visibilità sul pubblico. Le
          offerte sui <span className="font-bold">prodotti</span> (vetrina
          pubblica “Offerte”) si gestiscono invece da{" "}
          <em>Prodotti → interruttore “In offerta”</em>.
        </p>
      </div>

      {dialogo && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm sm:items-center"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="offerta-dialogo-titolo"
            className="my-4 w-full max-w-xl rounded-[2rem] border border-white/70 bg-white p-6 shadow-2xl md:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                  {dialogo === "crea" ? "Nuova promozione" : "Modifica offerta"}
                </p>
                <h2 id="offerta-dialogo-titolo" className="mt-1 text-xl font-black text-slate-900">
                  {dialogo === "crea" ? "Crea offerta" : form.titolo || "Offerta"}
                </h2>
              </div>
              <button
                type="button"
                onClick={chiudiDialogo}
                aria-label="Chiudi finestra"
                className="rounded-xl border border-blue-200 bg-blue-50 p-2 text-blue-600 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Negozio
                {dialogo === "crea" ? (
                  <select
                    value={form.negozio_id}
                    onChange={(e) => setForm((f) => ({ ...f, negozio_id: e.target.value }))}
                    className={`mt-1.5 ${classeSelettore} w-full`}
                  >
                    <option value="">Seleziona il negozio...</option>
                    {negozi.map((negozio) => (
                      <option key={negozio.id} value={negozio.id}>
                        {negozio.nome}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="mt-1.5 block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
                    {modifica?.negozio_nome ?? "Negozio sconosciuto"}
                  </span>
                )}
              </label>

              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Titolo *
                <input
                  value={form.titolo}
                  onChange={(e) => setForm((f) => ({ ...f, titolo: e.target.value }))}
                  maxLength={160}
                  placeholder="es. Sconto 20% su tutta la collezione"
                  className={`mt-1.5 ${classeInput}`}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Descrizione
                <textarea
                  value={form.descrizione}
                  onChange={(e) => setForm((f) => ({ ...f, descrizione: e.target.value }))}
                  rows={3}
                  placeholder="Dettagli della promozione (facoltativo)"
                  className={`mt-1.5 ${classeInput}`}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Prezzo originale (€)
                <input
                  value={form.prezzo_originale}
                  onChange={(e) => setForm((f) => ({ ...f, prezzo_originale: e.target.value }))}
                  inputMode="decimal"
                  placeholder="50.00"
                  className={`mt-1.5 ${classeInput}`}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Prezzo offerta (€)
                <input
                  value={form.prezzo_offerta}
                  onChange={(e) => setForm((f) => ({ ...f, prezzo_offerta: e.target.value }))}
                  inputMode="decimal"
                  placeholder="39.90"
                  className={`mt-1.5 ${classeInput}`}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Data inizio
                <input
                  type="date"
                  value={form.data_inizio}
                  onChange={(e) => setForm((f) => ({ ...f, data_inizio: e.target.value }))}
                  className={`mt-1.5 ${classeInput}`}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Data fine
                <input
                  type="date"
                  value={form.data_fine}
                  onChange={(e) => setForm((f) => ({ ...f, data_fine: e.target.value }))}
                  className={`mt-1.5 ${classeInput}`}
                />
              </label>

              <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.attiva}
                  onChange={(e) => setForm((f) => ({ ...f, attiva: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 accent-yellow-600"
                />
                Attiva subito (visibile al pubblico)
              </label>
            </div>

            {errore && (
              <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {errore}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={chiudiDialogo}
                disabled={salvando}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800 disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => void salvaOfferta()}
                disabled={salvando}
                className="btn-cta inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-60"
              >
                {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {dialogo === "crea" ? "Crea offerta" : "Salva modifiche"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
