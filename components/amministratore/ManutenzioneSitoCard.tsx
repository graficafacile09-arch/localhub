"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Save, Wrench } from "lucide-react";

type MaintenanceState = { enabled: boolean; message: string; updatedAt?: string | null };
type ApiResponse = {
  success?: boolean;
  data?: {
    production?: MaintenanceState;
    enabled?: boolean;
    message?: string;
    updatedAt?: string | null;
    target?: string;
  };
  error?: { message?: string };
};
type PublishResponse = {
  success?: boolean;
  data?: { url?: string; state?: string; branch?: string; testedCommitSha?: string };
  error?: { message?: string };
};

const DEFAULT_MESSAGE =
  "Stiamo lavorando per migliorare il servizio. Ci scusiamo per il disagio e torneremo online al più presto.";
const PREVIEW_URL = "https://localhub-git-fix-hero-search-top-4e7c6e-localhub-castrovillari.vercel.app/?_vercel_share=fbtgiQM83OQQcLYyEQ4IDLOxlqsOaLnf";

export default function ManutenzioneSitoCard() {
  const [stato, setStato] = useState<MaintenanceState>({ enabled: true, message: DEFAULT_MESSAGE });
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [esito, setEsito] = useState<{ testo: string; ok: boolean } | null>(null);
  const [testoMessaggio, setTestoMessaggio] = useState(DEFAULT_MESSAGE);
  const [conferma, setConferma] = useState(false);
  const [testoConferma, setTestoConferma] = useState("");
  const [pubblicando, setPubblicando] = useState(false);
  const [deployment, setDeployment] = useState<{ url: string; state: string; branch: string; sha?: string } | null>(null);

  useEffect(() => {
    let attivo = true;
    fetch("/api/amministratore/manutenzione", { cache: "no-store" })
      .then(async (response) => {
        const json = (await response.json().catch(() => null)) as ApiResponse | null;
        if (!response.ok) throw new Error(json?.error?.message ?? "Impossibile leggere lo stato del sito pubblico.");
        const value = json?.data?.production;
        if (!value || typeof value.enabled !== "boolean") throw new Error("Il server non ha restituito lo stato del sito pubblico.");
        if (attivo) {
          setStato({ ...value, message: value.message || DEFAULT_MESSAGE });
          setTestoMessaggio(value.message || DEFAULT_MESSAGE);
        }
      })
      .catch((error: unknown) => {
        if (attivo) setEsito({ testo: error instanceof Error ? error.message : "Errore di caricamento.", ok: false });
      })
      .finally(() => { if (attivo) setCaricamento(false); });
    return () => { attivo = false; };
  }, []);

  const salva = async (enabled: boolean, message = testoMessaggio) => {
    setSalvataggio(true);
    setEsito(null);
    try {
      const response = await fetch("/api/amministratore/manutenzione", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "production", enabled, message }),
      });
      const json = (await response.json().catch(() => null)) as ApiResponse | null;
      if (!response.ok) throw new Error(json?.error?.message ?? "Salvataggio non riuscito.");
      const value = json?.data;
      if (value?.target !== "production" || typeof value.enabled !== "boolean") throw new Error("Il server non ha confermato lo stato del sito pubblico.");
      const next = { enabled: value.enabled, message: value.message ?? message, updatedAt: value.updatedAt ?? null };
      setStato(next);
      setTestoMessaggio(next.message);
      setEsito({ testo: enabled ? "www.incitta.online è in manutenzione." : "www.incitta.online è online.", ok: true });
    } catch (error) {
      setEsito({ testo: error instanceof Error ? error.message : "Errore di salvataggio.", ok: false });
    } finally {
      setSalvataggio(false);
    }
  };

  const pubblica = async () => {
    if (testoConferma !== "PUBBLICA INCITTÀ") return;
    setPubblicando(true);
    setEsito(null);
    setDeployment(null);
    try {
      const response = await fetch("/api/amministratore/pubblica-versione", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: testoConferma }),
      });
      const json = (await response.json().catch(() => null)) as PublishResponse | null;
      if (!response.ok) throw new Error(json?.error?.message ?? "Vercel non ha accettato la pubblicazione.");
      const value = json?.data;
      if (!value?.url) throw new Error("Vercel non ha restituito l'URL del deployment.");
      setDeployment({
        url: value.url,
        state: value.state ?? "BUILDING",
        branch: value.branch ?? "fix/hero-search-top-2026-10-08",
        sha: value.testedCommitSha,
      });
      setEsito({ testo: "Pubblicazione avviata. Il sito pubblico non sarà aggiornato finché Vercel non avrà completato il deployment.", ok: true });
      setConferma(false);
      setTestoConferma("");
    } catch (error) {
      setEsito({ testo: error instanceof Error ? error.message : "Errore durante la pubblicazione.", ok: false });
    } finally {
      setPubblicando(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-slate-100 px-6 py-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
          <Wrench className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black tracking-tight text-slate-900">Sito online e pubblicazione</h2>
          <p className="mt-1 text-sm text-slate-500">Gestisci il sito pubblico, prova in privato e pubblica solo quando decidi tu.</p>
        </div>
      </header>

      <div className="space-y-5 px-6 py-5">
        {esito && (
          <p role="status" className={`rounded-2xl border px-4 py-3 text-sm ${esito.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
            {esito.testo}
          </p>
        )}

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-slate-900">www.incitta.online</h3>
              <p className="mt-1 text-sm leading-5 text-slate-600">Questo tasto controlla il sito pubblico, non l'anteprima privata.</p>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${stato.enabled ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
              {caricamento ? "Caricamento…" : stato.enabled ? "OFF LINE · manutenzione" : "ON LINE"}
            </span>
          </div>
          <label className="mt-4 block">
            <span className="text-sm font-bold text-slate-800">Messaggio in manutenzione</span>
            <textarea
              value={testoMessaggio}
              onChange={(event) => setTestoMessaggio(event.target.value)}
              maxLength={500}
              rows={2}
              disabled={caricamento || salvataggio}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-100 disabled:opacity-60"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => salva(stato.enabled, testoMessaggio)} disabled={caricamento || salvataggio || testoMessaggio.trim().length < 5} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {salvataggio ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              Salva messaggio
            </button>
            <button type="button" onClick={() => salva(!stato.enabled)} disabled={caricamento || salvataggio} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50 ${stato.enabled ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-amber-400 text-slate-950 hover:bg-amber-300"}`}>
              {salvataggio ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
              {stato.enabled ? "METTI ON LINE" : "METTI OFF LINE"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <h3 className="font-extrabold text-slate-900">Anteprima privata e pubblicazione</h3>
          <p className="mt-1 text-sm leading-5 text-slate-600">Apri il sito privato, verifica le modifiche e poi pubblica la versione verificata.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href={PREVIEW_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50">
              Apri anteprima privata <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
            {!conferma ? (
              <button type="button" onClick={() => setConferma(true)} disabled={caricamento || salvataggio || pubblicando} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50">
                Pubblica su incitta.online <ExternalLink className="h-4 w-4" aria-hidden />
              </button>
            ) : (
              <div className="w-full space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-950">Conferma solo dopo aver verificato l'anteprima.</p>
                <label className="block text-sm text-amber-900">Scrivi <strong>PUBBLICA INCITTÀ</strong> per pubblicare il commit della preview READY.</label>
                <input value={testoConferma} onChange={(event) => setTestoConferma(event.target.value)} autoComplete="off" aria-label="Conferma pubblicazione" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={pubblica} disabled={testoConferma !== "PUBBLICA INCITTÀ" || pubblicando} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-3 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50">
                    {pubblicando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ExternalLink className="h-4 w-4" aria-hidden />}
                    {pubblicando ? "Pubblicazione in corso…" : "Conferma pubblicazione"}
                  </button>
                  <button type="button" onClick={() => { setConferma(false); setTestoConferma(""); }} disabled={pubblicando} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">Annulla</button>
                </div>
              </div>
            )}
          </div>
          {deployment && (
            <p className="mt-3 text-sm text-slate-700">
              Deployment richiesto: <strong>{deployment.state}</strong> · ramo <strong>{deployment.branch}</strong>
              {deployment.sha ? <> · commit <code>{deployment.sha.slice(0, 7)}</code></> : null}.{" "}
              <a className="font-bold text-blue-700 underline" href={deployment.url} target="_blank" rel="noreferrer">Apri deployment</a>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
