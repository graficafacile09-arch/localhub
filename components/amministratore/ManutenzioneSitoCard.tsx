"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, LockKeyhole, Save, Wrench } from "lucide-react";

type Target = "production" | "preview";
type StatoSingolo = { enabled: boolean; message: string; updatedAt?: string | null; table?: string };
type PublishResponse = { success?: boolean; data?: { url?: string; state?: string; branch?: string }; error?: { message?: string } };
type ApiResponse = {
  success?: boolean;
  data?: { production?: StatoSingolo; preview?: StatoSingolo; target?: Target; enabled?: boolean; message?: string; updatedAt?: string | null; table?: string };
  error?: { message?: string };
};

const DEFAULT_MESSAGE =
  "Stiamo lavorando per migliorare il servizio. Ci scusiamo per il disagio e torneremo online al più presto.";

export default function ManutenzioneSitoCard() {
  const [stati, setStati] = useState<Record<Target, StatoSingolo>>({
    production: { enabled: true, message: DEFAULT_MESSAGE },
    preview: { enabled: false, message: DEFAULT_MESSAGE },
  });
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState<Target | null>(null);
  const [esito, setEsito] = useState<{ testo: string; ok: boolean } | null>(null);
  const [conferma, setConferma] = useState(false);
  const [testoConferma, setTestoConferma] = useState("");
  const [pubblicando, setPubblicando] = useState(false);
  const [deployment, setDeployment] = useState<{url:string; state:string; branch:string} | null>(null);

  useEffect(() => {
    let attivo = true;
    fetch("/api/amministratore/manutenzione", { cache: "no-store" })
      .then(async (response) => {
        const json = (await response.json().catch(() => null)) as ApiResponse | null;
        if (!response.ok) throw new Error(json?.error?.message ?? "Impossibile leggere gli stati.");
        const value = json?.data;
        if (!value?.production || !value?.preview) throw new Error("Il server non ha restituito entrambi gli stati di manutenzione.");
        if (attivo) setStati({
          production: { ...value.production, message: value.production.message || DEFAULT_MESSAGE },
          preview: { ...value.preview, message: value.preview.message || DEFAULT_MESSAGE },
        });
      })
      .catch((error: unknown) => {
        if (attivo) setEsito({ testo: error instanceof Error ? error.message : "Errore di caricamento.", ok: false });
      })
      .finally(() => { if (attivo) setCaricamento(false); });
    return () => { attivo = false; };
  }, []);

  const salva = async (target: Target, enabled: boolean) => {
    setSalvataggio(target);
    setEsito(null);
    try {
      const response = await fetch("/api/amministratore/manutenzione", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, enabled, message: stati[target].message }),
      });
      const json = (await response.json().catch(() => null)) as ApiResponse | null;
      if (!response.ok) throw new Error(json?.error?.message ?? "Salvataggio non riuscito.");
      const value = json?.data;
      if (!value || value.target !== target || typeof value.enabled !== "boolean") throw new Error("Risposta server non valida: stato non confermato.");
      setStati((old) => ({ ...old, [target]: { ...old[target], enabled: value.enabled!, message: value.message ?? old[target].message, updatedAt: value.updatedAt ?? null, table: value.table } }));
      setEsito({
        testo: target === "production"
          ? (enabled ? "Manutenzione attivata sul sito pubblico." : "Sito pubblico riaperto.")
          : (enabled ? "Manutenzione attivata solo nell'anteprima privata." : "Anteprima privata riaperta."),
        ok: true,
      });
    } catch (error) {
      setEsito({ testo: error instanceof Error ? error.message : "Errore di salvataggio.", ok: false });
    } finally {
      setSalvataggio(null);
    }
  };

  const salvaMessaggio = async (target: Target) => {
    await salva(target, stati[target].enabled);
    setEsito((old) => old?.ok ? { ...old, testo: target === "production" ? "Messaggio del sito pubblico salvato." : "Messaggio dell'anteprima privata salvato." } : old);
  };

  const pubblica = async () => {
    if (testoConferma !== "PUBBLICA INCITTÀ") return;
    setPubblicando(true); setEsito(null); setDeployment(null);
    try {
      const response = await fetch("/api/amministratore/pubblica-versione", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: testoConferma }) });
      const json = (await response.json().catch(() => null)) as PublishResponse | null;
      if (!response.ok) throw new Error(json?.error?.message ?? "Vercel non ha accettato la richiesta.");
      const value = json?.data;
      if (!value?.url) throw new Error("Vercel non ha restituito un URL di deployment.");
      setDeployment({ url: value.url, state: value.state ?? "BUILDING", branch: value.branch ?? "main" });
      setEsito({ testo: "Richiesta inviata. Verifica che il deployment sia READY e controlla il sito.", ok: true });
      setConferma(false); setTestoConferma("");
    } catch (error) { setEsito({ testo: error instanceof Error ? error.message : "Errore durante la pubblicazione.", ok: false }); }
    finally { setPubblicando(false); }
  };

  const renderMaintenanceControl = (target: Target) => {
    const pubblico = target === "production";
    const stato = stati[target];
    const busy = salvataggio !== null;
    return (
      <div key={target} className={`rounded-2xl border p-4 ${pubblico ? "border-blue-200 bg-blue-50/60" : "border-amber-200 bg-amber-50/60"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-slate-900">{pubblico ? "Sito pubblico · www.incitta.online" : "Anteprima privata"}</h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">{pubblico ? "Questo comando agisce sempre sul sito ufficiale, anche se stai usando il pannello dalla preview." : "Questo comando agisce soltanto sull'anteprima, senza cambiare il sito pubblico."}</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${stato.enabled ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
            {caricamento ? "Caricamento…" : stato.enabled ? "In manutenzione" : "Online"}
          </span>
        </div>
        <label className="mt-4 block">
          <span className="text-sm font-bold text-slate-800">Messaggio mostrato in {pubblico ? "produzione" : "anteprima"}</span>
          <textarea
            value={stato.message}
            onChange={(event) => setStati((old) => ({ ...old, [target]: { ...old[target], message: event.target.value } }))}
            maxLength={500}
            rows={2}
            disabled={caricamento || busy}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-100 disabled:opacity-60"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => salvaMessaggio(target)} disabled={caricamento || busy || stato.message.trim().length < 5} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {salvataggio === target ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Salva messaggio
          </button>
          <button type="button" onClick={() => salva(target, !stato.enabled)} disabled={caricamento || busy} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold disabled:opacity-50 ${stato.enabled ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-amber-400 text-slate-950 hover:bg-amber-300"}`}>
            {salvataggio === target ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : stato.enabled ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <Wrench className="h-4 w-4" aria-hidden />}
            {stato.enabled ? (pubblico ? "Riapri il sito pubblico" : "Riapri l'anteprima") : (pubblico ? "Metti il sito pubblico in manutenzione" : "Metti l'anteprima in manutenzione")}
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-slate-100 px-6 py-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
          <Wrench className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black tracking-tight text-slate-900">Manutenzione e pubblicazione</h2>
          <p className="mt-1 text-sm text-slate-500">Gestisci separatamente sito pubblico e anteprima privata. Le conferme indicano sempre la destinazione effettiva.</p>
        </div>
      </header>

      <div className="space-y-5 px-6 py-5">
        {esito && (
          <p role="status" className={`rounded-2xl border px-4 py-3 text-sm ${esito.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
            {esito.testo}
          </p>
        )}
        <div className="space-y-4">
          {renderMaintenanceControl("production")}
          {renderMaintenanceControl("preview")}
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800">Pubblicazione della versione</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">La pubblicazione del codice è separata dagli interruttori di manutenzione e richiede una conferma esplicita. Controlla la preview prima di pubblicare.</p>
              <a href="https://localhub-git-fix-hero-search-top-4e7c6e-localhub-castrovillari.vercel.app" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800">
                Apri il link privato per lavorare e testare <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
              <p className="mt-2 text-xs leading-5 text-slate-500">Questa è l’anteprima del ramo di lavoro. Le modifiche al codice devono essere salvate nel progetto GitHub e il nuovo deployment deve risultare READY prima della pubblicazione.</p>
              {deployment && <p className="mt-3 text-sm text-slate-700">Ultimo deployment richiesto: <strong>{deployment.state}</strong> dal ramo <strong>{deployment.branch}</strong>. <a className="font-bold text-blue-700 underline" href={deployment.url} target="_blank" rel="noreferrer">Apri deployment</a></p>}
              {!conferma ? (
                <button type="button" onClick={() => setConferma(true)} disabled={caricamento || salvataggio !== null || pubblicando} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50">
                  <ExternalLink className="h-4 w-4" aria-hidden /> Pubblica una versione su Vercel
                </button>
              ) : (
                <div className="mt-4 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
                  <p className="text-sm font-bold text-amber-950">Questa operazione può aggiornare il sito pubblico.</p>
                  <p className="text-sm leading-6 text-amber-900">Verifica prima la preview e assicurati che il codice desiderato sia nel ramo configurato. Scrivi PUBBLICA INCITTÀ per confermare.</p>
                  <input value={testoConferma} onChange={(event) => setTestoConferma(event.target.value)} autoComplete="off" aria-label="Conferma pubblicazione" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={pubblica} disabled={testoConferma !== "PUBBLICA INCITTÀ" || pubblicando} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-3 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50">
                      {pubblicando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ExternalLink className="h-4 w-4" aria-hidden />}
                      {pubblicando ? "Invio richiesta…" : "Conferma e avvia pubblicazione"}
                    </button>
                    <button type="button" onClick={() => { setConferma(false); setTestoConferma(""); }} disabled={pubblicando} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">Annulla</button>
                  </div>
                </div>
              )}
              <p className="mt-3 text-xs leading-5 text-slate-500">La pubblicazione richiede VERCEL_TOKEN nell'ambiente server-side. Il ramo di rilascio è quello configurato nel codice o in VERCEL_PUBLISH_BRANCH.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
