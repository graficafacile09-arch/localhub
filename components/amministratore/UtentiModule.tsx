"use client";

import { useMemo, useState } from "react";
import { Plus, Sparkles, UserRound } from "lucide-react";
import type { FiltroRuoloUtente, Utente } from "@/lib/amministratore/types";
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
  const [mostraNuovo, setMostraNuovo] = useState(false);
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

  const visibili = useMemo(
    () => (filtro === "tutti" ? utenti : utenti.filter((utente) => utente.ruolo === filtro)),
    [filtro, utenti]
  );

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

  return (
    <div className="space-y-5">
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 ring-1 ring-violet-100"><UserRound className="h-7 w-7" aria-hidden /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-700">Sistema Ruoli e Permessi</p>
              <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">Utenti</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Centro di gestione degli utenti LocalHub: amministratori, commercianti e clienti, con i loro ruoli e stati. I dati provengono dal database reale della piattaforma.</p>
            </div>
          </div>
          <button type="button" onClick={() => setMostraNuovo((value) => !value)} className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700"><Plus className="h-4 w-4" />Nuovo utente</button>
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
                className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
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
              {errore && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{errore}</p>}
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => { setMostraNuovo(false); setErrore(null); }} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100">Annulla</button>
                <button disabled={creando} type="submit" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60">{creando ? "Creazione..." : "Crea utente"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-[2rem] border border-white/70 bg-white p-4 shadow-sm md:p-5"><UtentiTabs attivo={filtro} conteggi={conteggi} onChange={setFiltro} /></div>
      <div role="tabpanel" id="panel-utenti" aria-labelledby="tab-utenti-tutti"><UtentiTable utenti={visibili} onAggiorna={aggiornaUtente} onElimina={eliminaUtente} /></div>
      <div className="flex items-start gap-3 rounded-3xl border border-violet-100 bg-violet-50/60 px-5 py-4 text-sm text-violet-900"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden /><p className="leading-6"><span className="font-bold">Dati reali:</span> elenco e gestione degli utenti registrati sulla piattaforma.</p></div>
    </div>
  );
}
