"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, LockKeyhole, Save, Wrench } from "lucide-react";

type Stato = { enabled: boolean; message: string; updatedAt?: string | null };
type ApiResponse = {
  success?: boolean;
  data?: Stato;
  enabled?: boolean;
  message?: string;
  updatedAt?: string | null;
  error?: { message?: string };
};

const DEFAULT_MESSAGE =
  "Stiamo lavorando per migliorare il servizio. Ci scusiamo per il disagio e torneremo online al più presto.";

export default function ManutenzioneSitoCard() {
  const [stato, setStato] = useState<Stato>({ enabled: false, message: DEFAULT_MESSAGE });
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [esito, setEsito] = useState<{ testo: string; ok: boolean } | null>(null);

  useEffect(() => {
    let attivo = true;
    fetch("/api/amministratore/manutenzione", { cache: "no-store" })
      .then(async (response) => {
        const json = (await response.json().catch(() => null)) as ApiResponse | null;
        if (!response.ok) throw new Error(json?.error?.message ?? "Impossibile leggere lo stato.");
        const value = json?.data ?? json;
        if (attivo) setStato({
          enabled: Boolean(value?.enabled),
          message: typeof value?.message === "string" ? value.message : DEFAULT_MESSAGE,
          updatedAt: value?.updatedAt ?? null,
        });
      })
      .catch((error: unknown) => {
        if (attivo) setEsito({ testo: error instanceof Error ? error.message : "Errore di caricamento.", ok: false });
      })
      .finally(() => { if (attivo) setCaricamento(false); });
    return () => { attivo = false; };
  }, []);

  const salva = async (enabled: boolean) => {
    setSalvataggio(true);
    setEsito(null);
    try {
      const response = await fetch("/api/amministratore/manutenzione", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, message: stato.message }),
      });
      const json = (await response.json().catch(() => null)) as ApiResponse | null;
      if (!response.ok) throw new Error(json?.error?.message ?? "Salvataggio non riuscito.");
      const value = json?.data ?? json;
      setStato((old) => ({
        enabled: Boolean(value?.enabled),
        message: typeof value?.message === "string" ? value.message : old.message,
        updatedAt: value?.updatedAt ?? null,
      }));
      setEsito({ testo: enabled ? "Manutenzione attivata. Il pubblico vedrà il messaggio." : "Sito riaperto al pubblico.", ok: true });
    } catch (error) {
      setEsito({ testo: error instanceof Error ? error.message : "Errore di salvataggio.", ok: false });
    } finally {
      setSalvataggio(false);
    }
  };

  const salvaMessaggio = async () => { await salva(stato.enabled); };

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-slate-100 px-6 py-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
          <Wrench className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black tracking-tight text-slate-900">Manutenzione e pubblicazione</h2>
          <p className="mt-1 text-sm text-slate-500">Gestisci il messaggio mostrato ai visitatori senza modificare il codice.</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${stato.enabled ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
          {caricamento ? "Caricamento…" : stato.enabled ? "In manutenzione" : "Sito aperto"}
        </span>
      </header>

      <div className="space-y-5 px-6 py-5">
        {esito && (
          <p role="status" className={`rounded-2xl border px-4 py-3 text-sm ${esito.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
            {esito.testo}
          </p>
        )}

        <label className="block">
          <span className="text-sm font-bold text-slate-800">Messaggio per i visitatori</span>
          <textarea
            value={stato.message}
            onChange={(event) => setStato((old) => ({ ...old, message: event.target.value }))}
            maxLength={500}
            rows={3}
            disabled={caricamento || salvataggio}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-100 disabled:opacity-60"
          />
          <span className="mt-1 block text-right text-xs text-slate-400">{stato.message.length}/500</span>
        </label>

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={salvaMessaggio} disabled={caricamento || salvataggio || stato.message.trim().length < 5} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {salvataggio ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Salva messaggio
          </button>
          <button type="button" onClick={() => salva(!stato.enabled)} disabled={caricamento || salvataggio} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-50 ${stato.enabled ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-amber-400 text-slate-950 hover:bg-amber-300"}`}>
            {salvataggio ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : stato.enabled ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <Wrench className="h-4 w-4" aria-hidden />}
            {stato.enabled ? "Riapri il sito al pubblico" : "Attiva manutenzione"}
          </button>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800">Anteprima privata e pubblicazione del codice</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Le modifiche al codice vanno salvate nel ramo di lavoro e verificate nell'anteprima Vercel. Questa scheda gestisce soltanto la manutenzione: non pubblica automaticamente codice né modifica ordini o pagamenti.
              </p>
              <a href="https://vercel.com/localhub-castrovillari/localhub" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-blue-700 underline decoration-blue-200 underline-offset-4 hover:text-blue-900">
                Apri il progetto e le anteprime Vercel <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
