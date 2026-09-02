"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CalendarDays,
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
import type { EventoAdmin } from "@/lib/eventi";

const normalizza = (testo: string) => testo.trim().toLowerCase();

const OPZIONI_STATO = [
  { valore: "tutti", etichetta: "Tutti" },
  { valore: "attivi", etichetta: "Attivi" },
  { valore: "disattivati", etichetta: "Disattivati" },
] as const;

type FiltroStato = "tutti" | "attivi" | "disattivati";
type Ordinamento = "data" | "titolo" | "recenti";

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

type FormEvento = {
  id: string | null;
  negozio_id: string;
  titolo: string;
  descrizione: string;
  luogo: string;
  immagine_url: string;
  data_inizio: string;
  data_fine: string;
  attivo: boolean;
};

function formVuota(): FormEvento {
  return {
    id: null,
    negozio_id: "",
    titolo: "",
    descrizione: "",
    luogo: "",
    immagine_url: "",
    data_inizio: "",
    data_fine: "",
    attivo: true,
  };
}

function formDaEvento(evento: EventoAdmin): FormEvento {
  return {
    id: evento.id,
    negozio_id: evento.negozio_id,
    titolo: evento.titolo,
    descrizione: evento.descrizione ?? "",
    luogo: evento.luogo ?? "",
    immagine_url: evento.immagine_url ?? "",
    data_inizio: (evento.data_inizio ?? "").slice(0, 10),
    data_fine: (evento.data_fine ?? "").slice(0, 10),
    attivo: evento.attivo,
  };
}

const classeInput =
  "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-yellow-400 focus:bg-white focus:ring-2 focus:ring-yellow-100";

const classeSelettore =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100";

export default function EventiModule({
  eventi,
  negozi,
}: {
  eventi: EventoAdmin[];
  negozi: { id: string; nome: string }[];
}) {
  const [ricerca, setRicerca] = useState("");
  const [stato, setStato] = useState<FiltroStato>("tutti");
  const [negozioFiltro, setNegozioFiltro] = useState("tutti");
  const [ordinamento, setOrdinamento] = useState<Ordinamento>("data");
  const [pagina, setPagina] = useState(1);
  const [perPagina, setPerPagina] = useState(12);
  const [locali, setLocali] = useState<EventoAdmin[]>(eventi);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<"crea" | "modifica" | null>(null);
  const [modifica, setModifica] = useState<EventoAdmin | null>(null);
  const [form, setForm] = useState<FormEvento>(formVuota);

  const filtriAttivi =
    ricerca.trim() !== "" || stato !== "tutti" || negozioFiltro !== "tutti";

  const visibili = useMemo(() => {
    const termine = normalizza(ricerca);
    return locali
      .filter((e) => {
        if (stato === "attivi" && !e.attivo) return false;
        if (stato === "disattivati" && e.attivo) return false;
        if (negozioFiltro !== "tutti" && e.negozio_id !== negozioFiltro) return false;
        if (!termine) return true;
        return [e.titolo, e.descrizione ?? "", e.luogo ?? "", e.negozio_nome ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(termine);
      })
      .sort((a, b) => {
        if (ordinamento === "titolo") {
          return a.titolo.localeCompare(b.titolo, "it", { sensitivity: "base" });
        }
        if (ordinamento === "recenti") {
          if (a.attivo !== b.attivo) return a.attivo ? -1 : 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        // "data": attivi prima, poi per data di inizio (più vicini in testa).
        if (a.attivo !== b.attivo) return a.attivo ? -1 : 1;
        const dataA = a.data_inizio ? Date.parse(a.data_inizio) : Number.MAX_SAFE_INTEGER;
        const dataB = b.data_inizio ? Date.parse(b.data_inizio) : Number.MAX_SAFE_INTEGER;
        return dataA - dataB;
      });
  }, [locali, negozioFiltro, ordinamento, ricerca, stato]);

  const numeroPagine = Math.max(1, Math.ceil(visibili.length / perPagina));
  const paginaEffettiva = Math.min(pagina, numeroPagine);
  const paginaCorrente = visibili.slice(
    (paginaEffettiva - 1) * perPagina,
    paginaEffettiva * perPagina
  );

  const attiviConteggio = locali.filter((e) => e.attivo).length;

  function apriCrea() {
    setForm(formVuota());
    setErrore(null);
    setAvviso(null);
    setDialogo("crea");
  }

  function apriModifica(evento: EventoAdmin) {
    setModifica(evento);
    setForm(formDaEvento(evento));
    setErrore(null);
    setAvviso(null);
    setDialogo("modifica");
  }

  function chiudiDialogo() {
    setDialogo(null);
    setModifica(null);
    setErrore(null);
  }

  const cambiaStato = useCallback(async (evento: EventoAdmin, attivo: boolean) => {
    setErrore(null);
    setAvviso(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/amministratore/eventi/${evento.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attivo }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: { message?: string };
        data?: { evento?: EventoAdmin };
      } | null;
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Impossibile aggiornare l'evento.");
      }
      const salvato = json?.data?.evento;
      if (salvato) {
        setLocali((prev) => prev.map((x) => (x.id === salvato.id ? salvato : x)));
      }
      setAvviso(attivo ? "Evento riattivato sul pubblico." : "Evento disattivato.");
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
    } finally {
      setSalvando(false);
    }
  }, []);

  const elimina = useCallback(async (evento: EventoAdmin) => {
    if (!window.confirm(`Eliminare definitivamente l'evento "${evento.titolo}"?`)) return;
    setErrore(null);
    setAvviso(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/amministratore/eventi/${evento.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Impossibile eliminare l'evento.");
      }
      setLocali((prev) => prev.filter((x) => x.id !== evento.id));
      setAvviso("Evento eliminato.");
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
    } finally {
      setSalvando(false);
    }
  }, []);

  const salvaEvento = useCallback(async () => {
    setErrore(null);
    setAvviso(null);

    const inModifica = form.id !== null;
    const nomeNegozio = inModifica
      ? modifica?.negozio_nome ?? ""
      : negozi.find((n) => n.id === form.negozio_id)?.nome ?? "";
    if (!inModifica && !form.negozio_id) {
      setErrore("Seleziona il negozio dell'evento.");
      return;
    }
    if (!form.titolo.trim()) {
      setErrore("Il titolo dell'evento è obbligatorio.");
      return;
    }
    if (form.data_inizio && form.data_fine && form.data_fine < form.data_inizio) {
      setErrore("La data di fine non può precedere la data di inizio.");
      return;
    }

    setSalvando(true);
    try {
      const payload: Record<string, unknown> = {
        titolo: form.titolo.trim(),
        descrizione: form.descrizione.trim() || null,
        luogo: form.luogo.trim() || null,
        immagine_url: form.immagine_url.trim() || null,
        data_inizio: form.data_inizio ? new Date(form.data_inizio).toISOString() : null,
        data_fine: form.data_fine ? new Date(form.data_fine).toISOString() : null,
        attivo: form.attivo,
      };
      if (!inModifica) payload.negozio_id = form.negozio_id;

      const res = await fetch(
        inModifica
          ? `/api/amministratore/eventi/${form.id}`
          : "/api/amministratore/eventi",
        {
          method: inModifica ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: { message?: string };
        data?: { evento?: EventoAdmin };
      } | null;
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Impossibile salvare l'evento.");
      }
      const salvato = json?.data?.evento;
      if (!salvato) throw new Error("Risposta non valida dal server.");

      setLocali((prev) => {
        const altri = prev.filter((e) => e.id !== salvato.id);
        return [salvato, ...altri];
      });
      setDialogo(null);
      setModifica(null);
      setAvviso(
        inModifica
          ? `Evento aggiornato${nomeNegozio ? ` (${nomeNegozio})` : ""}.`
          : `Evento creato per ${nomeNegozio}.`
      );
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
    } finally {
      setSalvando(false);
    }
  }, [form, modifica, negozi]);

  function azzeraFiltri() {
    setRicerca("");
    setStato("tutti");
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
              <CalendarDays className="h-7 w-7" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
                Appuntamenti della città
              </p>
              <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
                Eventi
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Crea e supervisiona gli eventi dei negozi: scegli il negozio,
                imposta titolo, luogo, date e immagine, attiva o disattiva gli
                appuntamenti. Le modifiche si riflettono subito sui negozi e
                sulle pagine pubbliche.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={apriCrea}
            className="btn-cta inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Nuovo evento
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
              placeholder="Cerca evento per titolo, luogo o negozio..."
              aria-label="Cerca evento"
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
              aria-label="Ordina eventi"
              className={classeSelettore}
            >
              <option value="data">Per data</option>
              <option value="titolo">Titolo</option>
              <option value="recenti">Più recenti</option>
            </select>
            <select
              value={perPagina}
              onChange={(event) => {
                setPerPagina(Number(event.target.value));
                setPagina(1);
              }}
              aria-label="Eventi per pagina"
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
          {visibili.length} {visibili.length === 1 ? "evento" : "eventi"}
          {filtriAttivi && ` (su ${locali.length})`}
          <span className="ml-2 font-semibold text-blue-700">
            · {attiviConteggio} attivi
          </span>
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
          <CalendarDays className="h-10 w-10 text-slate-200" aria-hidden />
          <p className="mt-4 text-lg font-bold text-slate-600">
            {locali.length === 0 ? "Nessun evento creato" : "Nessun evento trovato"}
          </p>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            {locali.length === 0
              ? "Crea il primo evento scegliendo un negozio e definendo luogo e date."
              : "Non ci sono eventi che corrispondono ai filtri selezionati."}
          </p>
          {locali.length === 0 ? (
            <button
              type="button"
              onClick={apriCrea}
              className="btn-cta mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Crea il primo evento
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
          {paginaCorrente.map((evento) => (
            <article
              key={evento.id}
              className={`flex flex-col rounded-3xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
                evento.attivo ? "border-white/70" : "border-slate-100 opacity-80"
              }`}
            >
              <div className="flex items-start gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                  <CalendarDays className="h-6 w-6" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black tracking-tight text-slate-900">
                      {evento.titolo}
                    </h2>
                    {evento.attivo ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden />
                        Attivo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                        Disattivato
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    {evento.negozio_nome ?? "Negozio sconosciuto"}
                  </p>

                  <p className="mt-2 text-xs text-slate-500">
                    {formattaData(evento.data_inizio)}
                    {evento.data_fine && evento.data_fine !== evento.data_inizio
                      ? ` → ${formattaData(evento.data_fine)}`
                      : ""}
                    {evento.luogo && <span className="text-slate-400"> · {evento.luogo}</span>}
                  </p>
                </div>
              </div>

              {evento.descrizione && (
                <p className="mt-3 border-t border-slate-100 pt-3 text-sm leading-6 text-slate-600">
                  {evento.descrizione}
                </p>
              )}

              <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                {evento.attivo ? (
                  <button
                    type="button"
                    onClick={() => cambiaStato(evento, false)}
                    disabled={salvando}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-yellow-100 px-4 text-sm font-bold text-yellow-800 transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X className="h-4 w-4" aria-hidden />
                    Disattiva
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => cambiaStato(evento, true)}
                    disabled={salvando}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-yellow-50 px-4 text-sm font-black text-yellow-800 ring-1 ring-yellow-200 transition hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Riattiva
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => apriModifica(evento)}
                  disabled={salvando}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                  Modifica
                </button>
                {evento.negozio_slug && (
                  <a
                    href={`/negozio/${evento.negozio_slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800"
                  >
                    Negozi
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => elimina(evento)}
                  disabled={salvando}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-50 px-2 text-yellow-700 ring-1 ring-yellow-200 transition hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Elimina evento"
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
            {visibili.length === 0
              ? "Nessun risultato"
              : `Visualizzati ${(paginaEffettiva - 1) * perPagina + 1}–${Math.min(
                  paginaEffettiva * perPagina,
                  visibili.length
                )} di ${visibili.length}`}
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
          <span className="font-bold">Nota:</span> la lista riflette la tabella
          <code className="font-mono text-xs"> eventi </code>
          sincronizzata con i moduli dei commercianti. Il flag{" "}
          <em>&quot;attivo&quot;</em> controlla la visibilità sul pubblico e nel
          conteggio della dashboard.
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
            aria-labelledby="evento-dialogo-titolo"
            className="my-4 w-full max-w-xl rounded-[2rem] border border-white/70 bg-white p-6 shadow-2xl md:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                  {dialogo === "crea" ? "Nuovo appuntamento" : "Modifica evento"}
                </p>
                <h2 id="evento-dialogo-titolo" className="mt-1 text-xl font-black text-slate-900">
                  {dialogo === "crea" ? "Crea evento" : form.titolo || "Evento"}
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
                Negozio / organizzatore
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
                  placeholder="es. Serata di musica dal vivo"
                  className={`mt-1.5 ${classeInput}`}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Luogo
                <input
                  value={form.luogo}
                  onChange={(e) => setForm((f) => ({ ...f, luogo: e.target.value }))}
                  maxLength={200}
                  placeholder="es. Piazza del Popolo, Castrovillari"
                  className={`mt-1.5 ${classeInput}`}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Descrizione
                <textarea
                  value={form.descrizione}
                  onChange={(e) => setForm((f) => ({ ...f, descrizione: e.target.value }))}
                  rows={3}
                  placeholder="Dettagli dell'evento (facoltativo)"
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

              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Immagine (URL, facoltativo)
                <input
                  value={form.immagine_url}
                  onChange={(e) => setForm((f) => ({ ...f, immagine_url: e.target.value }))}
                  placeholder="https://..."
                  className={`mt-1.5 ${classeInput}`}
                />
              </label>

              <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.attivo}
                  onChange={(e) => setForm((f) => ({ ...f, attivo: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 accent-yellow-600"
                />
                Attivo subito (visibile al pubblico)
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
                onClick={() => void salvaEvento()}
                disabled={salvando}
                className="btn-cta inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-60"
              >
                {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {dialogo === "crea" ? "Crea evento" : "Salva modifiche"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
