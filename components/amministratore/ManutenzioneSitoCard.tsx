"use client";

import { useEffect, useState } from "react";
import { Loader2, Power, Wrench } from "lucide-react";

type Stato = { target: "production" | "preview"; enabled: boolean; updatedAt?: string | null };
type Risposta = { data?: Stato; error?: { message?: string } };

export default function ManutenzioneSitoCard() {
  const [stato, setStato] = useState<Stato | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    let attivo = true;
    fetch("/api/amministratore/manutenzione", { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json() as Risposta;
        if (!r.ok || !json.data) throw new Error(json.error?.message || "Impossibile leggere lo stato.");
        if (attivo) setStato(json.data);
      })
      .catch((e: unknown) => { if (attivo) setErrore(e instanceof Error ? e.message : "Errore di caricamento."); })
      .finally(() => { if (attivo) setCaricamento(false); });
    return () => { attivo = false; };
  }, []);

  async function cambiaStato() {
    if (!stato) return;
    setSalvataggio(true); setErrore("");
    try {
      const r = await fetch("/api/amministratore/manutenzione", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !stato.enabled }),
      });
      const json = await r.json() as Risposta;
      if (!r.ok || !json.data) throw new Error(json.error?.message || "Aggiornamento non riuscito.");
      setStato(json.data);
    } catch (e) { setErrore(e instanceof Error ? e.message : "Errore di salvataggio."); }
    finally { setSalvataggio(false); }
  }

  const ambiente = stato?.target === "production" ? "Sito pubblico · www.incitta.online" : "Anteprima Vercel";
  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-slate-100 px-6 py-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Wrench className="h-5 w-5" aria-hidden /></span>
        <div><h2 className="text-lg font-black text-slate-900">Manutenzione sito</h2><p className="text-sm text-slate-500">Interruttore online / manutenzione. L'ambiente viene riconosciuto automaticamente.</p></div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div>
          <p className="font-bold text-slate-900">{caricamento ? "Lettura stato…" : ambiente}</p>
          <p className="mt-1 text-sm text-slate-500">{stato ? (stato.enabled ? "Il sito è in manutenzione." : "Il sito è online.") : "Stato non disponibile."}</p>
          {errore && <p role="alert" className="mt-2 text-sm text-red-700">{errore}</p>}
        </div>
        <button type="button" onClick={cambiaStato} disabled={!stato || caricamento || salvataggio}
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-50 ${stato?.enabled ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-amber-400 text-slate-950 hover:bg-amber-300"}`}>
          {salvataggio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
          {stato?.enabled ? "RIMETTI ONLINE" : "METTI IN MANUTENZIONE"}
        </button>
      </div>
    </section>
  );
}
