"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  CalendarDays,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe,
  Loader2,
  Newspaper,
  PenLine,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { ContenutoAdmin, StatoContenuto } from "@/lib/amministratore/contenuti";
import { STATI_CONTENUTO } from "@/lib/amministratore/contenuti";

const ETICHETTE_STATO: Record<StatoContenuto, string> = {
  bozza: "Bozza",
  pubblicato: "Pubblicato",
  archiviato: "Archiviato",
};

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

function BadgeStato({ stato }: { stato: StatoContenuto }) {
  const classe =
    stato === "pubblicato"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      : stato === "archiviato"
        ? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
        : "bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${classe}`}>
      {ETICHETTE_STATO[stato]}
    </span>
  );
}

type StatoForm = {
  titolo: string;
  slug: string;
  riassunto: string;
  corpo: string;
  immagine_url: string;
  autore: string;
  stato: StatoContenuto;
};

const FORM_VUOTO: StatoForm = {
  titolo: "",
  slug: "",
  riassunto: "",
  corpo: "",
  immagine_url: "",
  autore: "",
  stato: "bozza",
};

export default function ContenutiModule() {
  const [contenuti, setContenuti] = useState<ContenutoAdmin[]>([]);
  const [totale, setTotale] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [ricerca, setRicerca] = useState("");
  const [stato, setStato] = useState("");

  // Dialog di creazione/modifica
  const [dialogAperto, setDialogAperto] = useState(false);
  const [inModifica, setInModifica] = useState<ContenutoAdmin | null>(null);
  const [form, setForm] = useState<StatoForm>(FORM_VUOTO);
  const [salvando, setSalvando] = useState(false);

  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  const caricaDati = useCallback(
    async (nuovaPagina: number, nuovaRicerca: string, nuovoStato: string) => {
      setIsLoading(true);
      setErrore(null);
      const params = new URLSearchParams();
      if (nuovaRicerca) params.set("q", nuovaRicerca);
      if (nuovoStato) params.set("stato", nuovoStato);
      params.set("page", String(nuovaPagina));
      params.set("pageSize", String(pageSize));

      try {
        const res = await fetch(`/api/amministratore/contenuti?${params.toString()}`);
        const json = (await res.json().catch(() => null)) as {
          data?: { contenuti?: ContenutoAdmin[]; totale?: number; hasMore?: boolean };
          error?: { message?: string };
        } | null;
        if (!res.ok) {
          setErrore(json?.error?.message ?? "Impossibile caricare i contenuti.");
          setContenuti([]);
          return;
        }
        const payload = json?.data ?? {};
        setContenuti(payload.contenuti ?? []);
        setTotale(payload.totale ?? 0);
        setHasMore(Boolean(payload.hasMore));
      } catch {
        setErrore("Errore di rete. Riprova.");
        setContenuti([]);
      } finally {
        setIsLoading(false);
      }
    },
    [pageSize]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void caricaDati(pagina, ricerca.trim(), stato);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, stato, pageSize]);

  const applicaRicerca = () => {
    setPagina(1);
    void caricaDati(1, ricerca.trim(), stato);
  };

  const numeroPagine = Math.max(1, Math.ceil(totale / pageSize));
  const paginaEffettiva = Math.min(pagina, numeroPagine);

  const vaiAPagina = (destinazione: number) => {
    const nuova = Math.max(1, Math.min(destinazione, numeroPagine));
    if (nuova === pagina) return;
    setPagina(nuova);
    void caricaDati(nuova, ricerca.trim(), stato);
  };

  function apriCrea() {
    setInModifica(null);
    setForm(FORM_VUOTO);
    setDialogAperto(true);
  }

  function apriModifica(c: ContenutoAdmin) {
    setInModifica(c);
    setForm({
      titolo: c.titolo,
      slug: c.slug,
      riassunto: c.riassunto ?? "",
      corpo: c.corpo,
      immagine_url: c.immagine_url ?? "",
      autore: c.autore ?? "",
      stato: c.stato,
    });
    setDialogAperto(true);
  }

  function campo(chiave: keyof StatoForm, valore: string | StatoContenuto) {
    setForm((prev) => ({ ...prev, [chiave]: valore }));
  }

  const salva = async () => {
    setSalvando(true);
    setErrore(null);
    setFeedback(null);
    try {
      const payload: Record<string, unknown> = {
        titolo: form.titolo.trim(),
        corpo: form.corpo.trim(),
        stato: form.stato,
      };
      if (form.slug.trim()) payload.slug = form.slug.trim();
      if (form.riassunto.trim()) payload.riassunto = form.riassunto.trim();
      if (form.immagine_url.trim()) payload.immagine_url = form.immagine_url.trim();
      if (form.autore.trim()) payload.autore = form.autore.trim();

      const url = inModifica
        ? `/api/amministratore/contenuti/${inModifica.id}`
        : "/api/amministratore/contenuti";
      const metodo = inModifica ? "PATCH" : "POST";

      const res = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Errore durante il salvataggio.");
      }
      setDialogAperto(false);
      setFeedback(inModifica ? "Contenuto aggiornato." : "Contenuto creato.");
      void caricaDati(pagina, ricerca.trim(), stato);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore sconosciuto.");
    } finally {
      setSalvando(false);
    }
  };

  const cambiaStato = async (c: ContenutoAdmin, nuovo: StatoContenuto) => {
    setErrore(null);
    setFeedback(null);
    try {
      const res = await fetch(`/api/amministratore/contenuti/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: nuovo }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!res.ok) throw new Error(json?.error?.message ?? "Errore durante l'aggiornamento.");
      setFeedback(
        nuovo === "pubblicato"
          ? `“${c.titolo}” pubblicato.`
          : nuovo === "archiviato"
            ? `“${c.titolo}” archiviato.`
            : `“${c.titolo}” riportato in bozza.`
      );
      void caricaDati(pagina, ricerca.trim(), stato);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore sconosciuto.");
    }
  };

  const elimina = async (c: ContenutoAdmin) => {
    if (!window.confirm(`Eliminare DEFINITIVAMENTE “${c.titolo}”? L'operazione non è reversibile.`)) {
      return;
    }
    setEliminandoId(c.id);
    setErrore(null);
    setFeedback(null);
    try {
      const res = await fetch(`/api/amministratore/contenuti/${c.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!res.ok) throw new Error(json?.error?.message ?? "Errore durante l'eliminazione.");
      setFeedback(`“${c.titolo}” eliminato.`);
      if (contenuti.length === 1 && pagina > 1) {
        setPagina(pagina - 1);
        void caricaDati(pagina - 1, ricerca.trim(), stato);
      } else {
        void caricaDati(pagina, ricerca.trim(), stato);
      }
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore sconosciuto.");
    } finally {
      setEliminandoId(null);
    }
  };

  const azzeraFiltri = () => {
    setRicerca("");
    setStato("");
    setPagina(1);
    void caricaDati(1, "", "");
  };

  const haFiltri = ricerca !== "" || stato !== "";

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
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Newspaper className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Contenuti & Controllo creativo
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Contenuti editoriali
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Gestione degli articoli e dei contenuti editoriali del portale:
              creazione, modifica, pubblicazione e archiviazione con workflow
              bozza → pubblicato → archiviato.
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative min-w-0 md:max-w-md md:flex-1">
            <FileText
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applicaRicerca()}
              placeholder="Cerca per titolo, riassunto o autore…"
              aria-label="Cerca contenuti"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-700 placeholder:text-slate-400 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={stato}
              onChange={(e) => {
                setStato(e.target.value);
                setPagina(1);
              }}
              aria-label="Filtra per stato"
              className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-700 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Tutti gli stati</option>
              {STATI_CONTENUTO.map((s) => (
                <option key={s} value={s}>{ETICHETTE_STATO[s]}</option>
              ))}
            </select>

            <select
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPagina(1);
              }}
              aria-label="Contenuti per pagina"
              className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-700 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="20">20 per pagina</option>
              <option value="50">50 per pagina</option>
              <option value="100">100 per pagina</option>
            </select>

            <button
              type="button"
              onClick={apriCrea}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-yellow-400 px-4 text-sm font-bold text-blue-900 transition hover:bg-yellow-300"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Nuovo contenuto
            </button>
          </div>
        </div>

        {haFiltri && (
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
          <CheckCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
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
        <div className="flex items-center justify-center rounded-[2rem] border border-white/70 bg-white p-12 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
        </div>
      ) : contenuti.length === 0 ? (
        <div className="rounded-[2rem] border border-slate-100 bg-white px-6 py-16 text-center shadow-sm">
          <Newspaper className="mx-auto h-10 w-10 text-slate-200" aria-hidden />
          <p className="mt-4 text-lg font-bold text-slate-600">Nessun contenuto trovato</p>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            {haFiltri
              ? "Prova a modificare i filtri selezionati."
              : "Non sono presenti contenuti editoriali. Usa “Nuovo contenuto” per crearne uno."}
          </p>
          {!haFiltri && (
            <button
              type="button"
              onClick={apriCrea}
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-bold text-blue-900 transition hover:bg-yellow-300"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Nuovo contenuto
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="px-1 text-sm font-black text-slate-700">
            {totale} {totale === 1 ? "contenuto" : "contenuti"}
          </p>

          <div className="grid gap-3">
            {contenuti.map((c) => (
              <article
                key={c.id}
                className="card p-5 transition hover:border-blue-100 hover:shadow-md"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <BadgeStato stato={c.stato} />
                      {c.stato === "pubblicato" && c.pubblicato_il && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                          <CalendarDays className="h-3 w-3" aria-hidden />
                          {formattaData(c.pubblicato_il)}
                        </span>
                      )}
                      {c.autore && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                          {c.autore}
                        </span>
                      )}
                    </div>

                    <h2 className="text-base font-black tracking-tight text-slate-900">
                      {c.titolo}
                    </h2>

                    <p className="text-[11px] font-mono text-slate-400">/{c.slug}</p>

                    {c.riassunto && (
                      <p className="max-w-2xl text-sm leading-relaxed text-slate-500 line-clamp-2">
                        {c.riassunto}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 self-end md:self-start">
                    <button
                      type="button"
                      onClick={() => apriModifica(c)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
                    >
                      <PenLine className="h-3.5 w-3.5" aria-hidden />
                      Modifica
                    </button>
                    {c.stato === "pubblicato" ? (
                      <button
                        type="button"
                        onClick={() => void cambiaStato(c, "bozza")}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                        Togli dalla pubblicazione
                      </button>
                    ) : c.stato === "bozza" ? (
                      <button
                        type="button"
                        onClick={() => void cambiaStato(c, "pubblicato")}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                      >
                        <Globe className="h-3.5 w-3.5" aria-hidden />
                        Pubblica
                      </button>
                    ) : null}
                    {c.stato !== "archiviato" && (
                      <button
                        type="button"
                        onClick={() => void cambiaStato(c, "archiviato")}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                      >
                        <Archive className="h-3.5 w-3.5" aria-hidden />
                        Archivia
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={eliminandoId !== null}
                      onClick={() => void elimina(c)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {eliminandoId === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Elimina
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Paginazione */}
          {numeroPagine > 1 && (
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p>Pagina {paginaEffettiva} di {numeroPagine}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => vaiAPagina(paginaEffettiva - 1)}
                  disabled={paginaEffettiva <= 1 || isLoading}
                  aria-label="Pagina precedente"
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  Precedente
                </button>
                <button
                  type="button"
                  onClick={() => vaiAPagina(paginaEffettiva + 1)}
                  disabled={!hasMore || paginaEffettiva >= numeroPagine || isLoading}
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

      {/* Dialog crea/modifica */}
      {dialogAperto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                {inModifica ? (
                  <PenLine className="h-5 w-5" aria-hidden />
                ) : (
                  <Plus className="h-5 w-5" aria-hidden />
                )}
              </div>
              <h2 className="text-lg font-black tracking-tight text-slate-900">
                {inModifica ? "Modifica contenuto" : "Nuovo contenuto"}
              </h2>
              <button
                type="button"
                onClick={() => setDialogAperto(false)}
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
                aria-label="Chiudi"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Titolo *
                  </label>
                  <input
                    type="text"
                    value={form.titolo}
                    onChange={(e) => campo("titolo", e.target.value)}
                    placeholder="Titolo del contenuto"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Slug (opzionale — auto dal titolo)
                  </label>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={(e) => campo("slug", e.target.value)}
                    placeholder="es. il-natale-in-citta"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Riassunto
                </label>
                <textarea
                  rows={2}
                  value={form.riassunto}
                  onChange={(e) => campo("riassunto", e.target.value)}
                  placeholder="Breve introduzione mostrata nell'elenco…"
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Testo *
                </label>
                <textarea
                  rows={7}
                  value={form.corpo}
                  onChange={(e) => campo("corpo", e.target.value)}
                  placeholder="Corpo del contenuto…"
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    URL immagine
                  </label>
                  <input
                    type="text"
                    value={form.immagine_url}
                    onChange={(e) => campo("immagine_url", e.target.value)}
                    placeholder="https://…"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Autore
                  </label>
                  <input
                    type="text"
                    value={form.autore}
                    onChange={(e) => campo("autore", e.target.value)}
                    placeholder="es. Redazione"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Stato
                </label>
                <select
                  value={form.stato}
                  onChange={(e) => campo("stato", e.target.value as StatoContenuto)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {STATI_CONTENUTO.map((s) => (
                    <option key={s} value={s}>{ETICHETTE_STATO[s]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setDialogAperto(false)}
                className="h-11 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => void salva()}
                disabled={salvando}
                className="btn-cta h-11 px-5 text-sm disabled:opacity-50"
              >
                {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {inModifica ? "Salva modifiche" : "Crea contenuto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}