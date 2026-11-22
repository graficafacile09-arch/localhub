"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, History, RefreshCw } from "lucide-react";
import type { EsitoAnalisi, Livello } from "@/lib/radiscan/tipi";

interface RigaStorico {
  id: string;
  creato_il: string;
  livello: Livello;
  denominazione_verificata: string | null;
  esito: EsitoAnalisi;
  provider: string;
  modello: string;
}

const LIVELLI: Record<Livello, string> = {
  verificato: "Denominazione confermata",
  coerente_non_verificato: "Riscontro parziale",
  non_verificato: "Non verificato",
  incongruenza_possibile: "Possibile incongruenza",
};

export default function StoricoRadiciScan() {
  const [righe, setRighe] = useState<RigaStorico[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [disponibile, setDisponibile] = useState(true);

  const carica = useCallback(async () => {
    setCaricamento(true);
    try {
      const response = await fetch("/api/radiscan/storico", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== "object" || !("analisi" in body) || !Array.isArray(body.analisi)) {
        setDisponibile(false);
        return;
      }
      setRighe(body.analisi as RigaStorico[]);
      setDisponibile(true);
    } catch {
      setDisponibile(false);
    } finally {
      setCaricamento(false);
    }
  }, []);

  useEffect(() => {
    void carica();
    const aggiorna = () => void carica();
    window.addEventListener("radiscan:aggiorna-storico", aggiorna);
    return () => window.removeEventListener("radiscan:aggiorna-storico", aggiorna);
  }, [carica]);

  return (
    <section className="mb-5 rounded-2xl border border-[#e5ded0] bg-white p-4" aria-label="Storico delle analisi RadiciScan">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[#1b3624]">
          <History className="h-4 w-4" aria-hidden />
          <h2 className="text-sm font-black">Le tue ultime analisi</h2>
          {!caricamento && righe.length > 0 ? <span className="rounded-full bg-[#f4f1e8] px-2 py-0.5 text-[10px] font-bold text-[#6b6459]">{righe.length}</span> : null}
        </div>
        <button type="button" onClick={() => void carica()} disabled={caricamento} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#24462f] hover:bg-[#f4f8f4] disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${caricamento ? "animate-spin" : ""}`} aria-hidden />
          Aggiorna
        </button>
      </div>

      {caricamento ? <p className="mt-3 text-xs text-[#6b6459]">Caricamento dello storico…</p> : null}
      {!caricamento && !disponibile ? <p className="mt-3 text-xs leading-5 text-[#8a5a3b]">Storico momentaneamente non disponibile. Le analisi continuano a essere registrate.</p> : null}
      {!caricamento && disponibile && righe.length === 0 ? <p className="mt-3 text-xs leading-5 text-[#6b6459]">Qui compariranno le analisi effettuate da questo account o da questo browser.</p> : null}

      {!caricamento && disponibile && righe.length > 0 ? (
        <ul className="mt-3 divide-y divide-[#eee8dc]">
          {righe.map((riga) => {
            const riconoscimento = riga.esito?.riconoscimento;
            const nome = riconoscimento?.prodotto || riga.denominazione_verificata || "Prodotto non identificato";
            const categoria = riconoscimento?.categoria;
            const data = new Date(riga.creato_il);
            return (
              <li key={riga.id} className="py-3 first:pt-0 last:pb-0">
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#1b3624]">{nome}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#777064]">
                        <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" aria-hidden />{Number.isNaN(data.getTime()) ? "Data non disponibile" : data.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</span>
                        {categoria ? <span>· {categoria}</span> : null}
                      </span>
                    </span>
                    <span className="rounded-full border border-[#e5ded0] bg-[#fffdf7] px-2.5 py-1 text-[10px] font-bold text-[#57534e]">{LIVELLI[riga.livello] ?? "Esito registrato"}</span>
                  </summary>
                  <div className="mt-3 rounded-xl bg-[#faf8f2] p-3 text-xs leading-5 text-[#57534e]">
                    {riconoscimento?.denominazioneProposta ? <p><strong className="text-[#1b3624]">Denominazione proposta:</strong> {riconoscimento.denominazioneProposta}</p> : null}
                    {riconoscimento?.territorioProposto ? <p><strong className="text-[#1b3624]">Territorio:</strong> {riconoscimento.territorioProposto}</p> : null}
                    <p className="mt-1">{riga.esito?.verifica?.motivazione || riconoscimento?.note || "Nessuna nota aggiuntiva registrata."}</p>
                    {riga.denominazione_verificata ? <p className="mt-2 font-semibold text-[#24462f]">Denominazione verificata: {riga.denominazione_verificata}</p> : null}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="mt-3 text-[10px] leading-4 text-[#8a8378]">Mostro al massimo 25 analisi. Le fotografie non vengono salvate.</p>
    </section>
  );
}
