"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Plus,
  Search,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  RUOLI_UTENTE,
  type FiltroRuoloUtente,
  type Utente,
} from "@/lib/amministratore/types";
import UtentiTabs from "./UtentiTabs";
import UtentiTable from "./UtentiTable";

export default function UtentiModule({
  utenti: utentiIniziali,
  conteggi: conteggiIniziali,
}: {
  utenti: Utente[];
  conteggi: Record<FiltroRuoloUtente, number>;
}) {
  const [utenti, setUtenti] = useState(utentiIniziali);
  const [conteggi, setConteggi] = useState(conteggiIniziali);
  const [filtro, setFiltro] = useState<FiltroRuoloUtente>("tutti");
  const [ricerca, setRicerca] = useState("");
  const [ordinamento, setOrdinamento] = useState<OrdinamentoUtenti>("nome");
  const [direzione, setDirezione] = useState<DirezioneOrdinamento>("asc");
  const [pagina, setPagina] = useState(1);
  const [perPagina, setPerPagina] = useState(10);
  const [mostraNuovo, setMostraNuovo] = useState(false);
  const [utenteDettaglio, setUtenteDettaglio] = useState<Utente | null>(null);
  const [creando, setCreando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  type RuoloCreabile = "utente" | "commerciante" | "amministratore";
  const [form, setForm] = useState({
    nome: "",
    email: "",
    password: "",
    confermaPassword: "",
    ruolo: "utente" as RuoloCreabile,
  });

  const filtrati = useMemo(() => {
    const query = ricerca.trim().toLocaleLowerCase("it");
    return utenti.filter((utente) => {
      const ruolo = RUOLI_UTENTE[utente.ruolo].label.toLocaleLowerCase("it");
      const corrispondeRuolo = filtro === "tutti" || utente.ruolo === filtro;
      const corrispondeRicerca =
        !query ||
        [utente.nome, utente.email, utente.ruolo, ruolo].some((valore) =>
          valore.toLocaleLowerCase("it").includes(query)
        );
      return corrispondeRuolo && corrispondeRicerca;
    });
  }, [filtro, ricerca, utenti]);

  const ordinate = useMemo(() => {
    const copia = [...filtrati];
    copia.sort((a, b) => {
      const valoreA = valoreOrdinamento(a, ordinamento);
      const valoreB = valoreOrdinamento(b, ordinamento);
      const confronto = valoreA.localeCompare(valoreB, "it", {
        numeric: true,
        sensitivity: "base",
      });
      return direzione === "asc" ? confronto : -confronto;
    });
    return copia;
  }, [direzione, filtrati, ordinamento]);

  const numeroPagine = Math.max(1, Math.ceil(ordinate.length / perPagina));
  const paginaEffettiva = Math.min(pagina, numeroPagine);
  const utentiPagina = ordinate.slice(
    (paginaEffettiva - 1) * perPagina,
    paginaEffettiva * perPagina
  );

  useEffect(() => {
    setPagina(1);
  }, [direzione, filtro, ordinamento, perPagina, ricerca]);

  function aggiornaConteggi(delta: Partial<Record<FiltroRuoloUtente, number>>) {
    setConteggi((precedenti) => ({
      ...precedenti,
      ...Object.fromEntries(Object.entries(delta).map(([chiave, valore]) => [chiave, (precedenti[chiave as FiltroRuoloUtente] ?? 0) + (valore ?? 0)])),
    }));
  }

  function aggiornaUtente(id: string, aggiornamento: Partial<Pick<Utente, "ruolo" | "stato">>) {
    const precedente = utenti.find((utente) => utente.id === id);
    setUtenti((precedenti) => precedenti.map((utente) => (utente.id === id ? { ...utente, ...aggiornamento } : utente)));
    if (precedente && aggiornamento.ruolo && aggiornamento.ruolo !== precedente.ruolo) {
      aggiornaConteggi({ [precedente.ruolo]: -1, [aggiornamento.ruolo]: 1 });
    }
  }

  function eliminaUtente(id: string) {
    const rimosso = utenti.find((utente) => utente.id === id);
    setUtenti((precedenti) => precedenti.filter((utente) => utente.id !== id));
    if (rimosso) aggiornaConteggi({ tutti: -1, [rimosso.ruolo]: -1 });
    setUtenteDettaglio((precedente) => (precedente?.id === id ? null : precedente));
  }

  function aggiornaDettaglio(id: string, aggiornamento: Partial<Pick<Utente, "ruolo" | "stato">>) {
    setUtenteDettaglio((precedente) =>
      precedente?.id === id ? { ...precedente, ...aggiornamento } : precedente
    );
  }

  async function creaUtente(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreando(true);
    setErrore(null);
    try {
      if (form.password !== form.confermaPassword) {
        throw new Error("Le password non coincidono.");
      }
      const response = await fetch("/api/amministratore/utenti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error?.message ?? "Impossibile creare l'utente.");
      const nuovo = json.data?.utente as Utente;
      setUtenti((precedenti) => [nuovo, ...precedenti]);
      aggiornaConteggi({ tutti: 1, [nuovo.ruolo]: 1 });
      setForm({ nome: "", email: "", password: "", confermaPassword: "", ruolo: "utente" });
      setMostraNuovo(false);
    } catch (caught) {
      setErrore(caught instanceof Error ? caught.message : "Errore sconosciuto.");
    } finally {
      setCreando(false);
    }
  }

  function cambiaOrdinamento(value: OrdinamentoUtenti) {
    if (value === ordinamento) {
      setDirezione((precedente) => (precedente === "asc" ? "desc" : "asc"));
      return;
    }
    setOrdinamento(value);
    setDirezione("asc");
  }

  return (
    <div className="space-y-5">
      <div className="card p-6 md:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100"><UserRound className="h-7 w-7" aria-hidden /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">Sistema Ruoli e Permessi</p>
              <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">Utenti</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Centro di gestione degli utenti LocalHub: amministratori, commercianti e clienti, con i loro ruoli e stati. I dati provengono dal database reale della piattaforma.</p>
            </div>
          </div>
          <button type="button" onClick={() => setMostraNuovo((value) => !value)} className="btn-cta shrink-0 px-5 py-2.5 text-sm"><Plus className="h-4 w-4" />Nuovo utente</button>
        </div>
      </div>

      {mostraNuovo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="nuovo-utente-titolo"
            className="w-full max-w-2xl rounded-[2rem] border border-white/70 bg-white p-6 shadow-2xl md:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Gestione utenti</p>
                <h2 id="nuovo-utente-titolo" className="mt-1 text-xl font-black text-slate-900">Nuovo utente</h2>
                <p className="mt-1 text-sm text-slate-500">Crea un account reale e assegna il ruolo iniziale.</p>
              </div>
              <button
                type="button"
                aria-label="Chiudi nuovo utente"
                onClick={() => { setMostraNuovo(false); setErrore(null); }}
                className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-yellow-100 hover:text-yellow-800"
              >
                Chiudi
              </button>
            </div>
            <form onSubmit={creaUtente} className="mt-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">Nome completo<input required value={form.nome} onChange={(event) => setForm((precedenti) => ({ ...precedenti, nome: event.target.value }))} placeholder="Nome completo" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal" /></label>
                <label className="text-sm font-semibold text-slate-700">Email<input required type="email" value={form.email} onChange={(event) => setForm((precedenti) => ({ ...precedenti, email: event.target.value }))} placeholder="nome@email.it" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal" /></label>
                <label className="text-sm font-semibold text-slate-700">Password<input required minLength={8} type="password" value={form.password} onChange={(event) => setForm((precedenti) => ({ ...precedenti, password: event.target.value }))} placeholder="Almeno 8 caratteri" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal" /></label>
                <label className="text-sm font-semibold text-slate-700">Conferma password<input required minLength={8} type="password" value={form.confermaPassword} onChange={(event) => setForm((precedenti) => ({ ...precedenti, confermaPassword: event.target.value }))} placeholder="Ripeti la password" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal" /></label>
                <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Ruolo<select value={form.ruolo} onChange={(event) => setForm((precedenti) => ({ ...precedenti, ruolo: event.target.value as RuoloCreabile }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"><option value="utente">Utente</option><option value="commerciante">Commerciante</option><option value="amministratore">Amministratore</option></select></label>
              </div>
              {errore && <p role="alert" className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">{errore}</p>}
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => { setMostraNuovo(false); setErrore(null); }} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-yellow-100 hover:text-yellow-800">Annulla</button>
                <button disabled={creando} type="submit" className="btn-cta px-4 py-2.5 text-sm disabled:opacity-60">{creando ? "Creazione..." : "Crea utente"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block min-w-0 flex-1 lg:max-w-md">
            <span className="sr-only">Cerca utenti per nome, email o ruolo</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              value={ricerca}
              onChange={(event) => setRicerca(event.target.value)}
              placeholder="Cerca nome, email o ruolo..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-yellow-400 focus:bg-white focus:ring-2 focus:ring-yellow-100"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <span>Ordina</span>
              <select
                value={ordinamento}
                onChange={(event) => cambiaOrdinamento(event.target.value as OrdinamentoUtenti)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100"
              >
                <option value="nome">Nome</option>
                <option value="email">Email</option>
                <option value="ruolo">Ruolo</option>
                <option value="ultimoAccesso">Ultimo accesso</option>
                <option value="stato">Stato</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setDirezione((precedente) => (precedente === "asc" ? "desc" : "asc"))}
              aria-label={`Ordinamento ${direzione === "asc" ? "crescente" : "decrescente"}`}
              title={`Ordine ${direzione === "asc" ? "crescente" : "decrescente"}`}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800"
            >
              <ChevronsUpDown className="h-4 w-4" aria-hidden />
            </button>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <span>Righe</span>
              <select
                value={perPagina}
                onChange={(event) => setPerPagina(Number(event.target.value))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
          </div>
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <UtentiTabs attivo={filtro} conteggi={conteggi} onChange={setFiltro} />
        </div>
      </div>
      {utenteDettaglio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dettaglio-utente-titolo"
            className="w-full max-w-lg rounded-[2rem] border border-white/70 bg-white p-6 shadow-2xl md:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <UserRound className="h-6 w-6" aria-hidden />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Dettaglio utente</p>
                  <h2 id="dettaglio-utente-titolo" className="mt-1 text-xl font-black text-slate-900">{utenteDettaglio.nome}</h2>
                </div>
              </div>
              <button
                type="button"
                aria-label="Chiudi dettaglio utente"
                onClick={() => setUtenteDettaglio(null)}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-yellow-100 hover:text-yellow-700"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <dl className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Email</dt>
                <dd className="mt-1 break-all text-sm font-semibold text-slate-800">{utenteDettaglio.email}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Ruolo</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{RUOLI_UTENTE[utenteDettaglio.ruolo].label}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Stato account</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{utenteDettaglio.stato === "attivo" ? "Attivo" : "Disattivato"}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Ultimo accesso</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{utenteDettaglio.ultimoAccesso ? formatDataDettaglio(utenteDettaglio.ultimoAccesso) : "Mai"}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Registrato il</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{formatDataDettaglio(utenteDettaglio.registratoIl)}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Negozi gestiti</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{utenteDettaglio.negozi ?? 0}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
      <div role="tabpanel" id="panel-utenti" aria-labelledby="tab-utenti-tutti">
        <UtentiTable utenti={utentiPagina} onAggiorna={(id, aggiornamento) => { aggiornaUtente(id, aggiornamento); aggiornaDettaglio(id, aggiornamento); }} onDettaglio={setUtenteDettaglio} onElimina={eliminaUtente} />
        <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            {ordinate.length === 0
              ? "Nessun risultato"
              : `Visualizzati ${(paginaEffettiva - 1) * perPagina + 1}–${Math.min(paginaEffettiva * perPagina, ordinate.length)} di ${ordinate.length}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPagina((precedente) => Math.max(1, precedente - 1))}
              disabled={paginaEffettiva <= 1}
              aria-label="Pagina precedente"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800 disabled:cursor-not-allowed disabled:opacity-40"
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-3xl border border-blue-100 bg-blue-50/60 px-5 py-4 text-sm text-blue-900"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden /><p className="leading-6"><span className="font-bold">Dati reali:</span> elenco e gestione degli utenti registrati sulla piattaforma.</p></div>
    </div>
  );
}

type OrdinamentoUtenti = "nome" | "email" | "ruolo" | "ultimoAccesso" | "stato";
type DirezioneOrdinamento = "asc" | "desc";

const formatDataDettaglioFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function formatDataDettaglio(value: string): string {
  return formatDataDettaglioFormatter.format(new Date(value));
}

function valoreOrdinamento(utente: Utente, campo: OrdinamentoUtenti): string {
  switch (campo) {
    case "email":
      return utente.email;
    case "ruolo":
      return utente.ruolo;
    case "ultimoAccesso":
      return utente.ultimoAccesso ?? "";
    case "stato":
      return utente.stato;
    case "nome":
    default:
      return utente.nome;
  }
}
