"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import {
  azioniReclamoDisponibili,
  ETICHETTA_TIPO_RECLAMO,
  ETICHETTE_STATO_RECLAMO,
  type ReclamoOrdine as ReclamoOrdineType,
  type StatoReclamo,
} from "@/lib/ordine-reclami-stati";

type Props = {
  negozioId: string;
  ordineId: string;
  reclamiIniziali: ReclamoOrdineType[];
};

const COLORI: Record<StatoReclamo, string> = {
  aperto: "bg-red-50 text-red-700 ring-1 ring-red-200",
  in_gestione: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  risolto: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  chiuso: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

/**
 * Gestione reclami nel dettaglio ordine (Area Venditore).
 * - Riquadro "🚨 Reclamo aperto" con messaggio cliente, data e stato;
 * - pulsanti [Prendi in carico] [Segna come risolto] [Chiudi] in base allo
 *   stato (macchina a stati specchiata in lib/ordine-reclami.ts);
 * - dopo l'azione `router.refresh()` mantiene il venditore NEL dettaglio
 *   (nessun redirect), con messaggio di successo/errore inline.
 * L'OWNERSHIP è sempre verificata server-side (canManageStore + RPC).
 */
export default function ReclamiOrdine({ negozioId, ordineId, reclamiIniziali }: Props) {
  const router = useRouter();
  const [reclami, setReclami] = useState<ReclamoOrdineType[]>(reclamiIniziali);
  const [azioneAttiva, setAzioneAttiva] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [successo, setSuccesso] = useState<string | null>(null);

  if (reclami.length === 0) return null;

  async function eseguiAzione(reclamoId: string, stato: StatoReclamo) {
    setAzioneAttiva(`${reclamoId}-${stato}`);
    setErrore(null);
    setSuccesso(null);
    try {
      const res = await fetch(
        `/api/merchant/stores/${negozioId}/ordini/${ordineId}/reclami/${reclamoId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stato }),
        }
      );
      const data = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        data?: { reclamo?: ReclamoOrdineType };
      } | null;

      if (!res.ok) {
        setErrore(data?.error?.message ?? "Impossibile aggiornare il reclamo.");
        return;
      }
      if (data?.data?.reclamo) {
        setReclami((prev) =>
          prev.map((r) => (r.id === data.data!.reclamo!.id ? data.data!.reclamo! : r))
        );
      }
      setSuccesso("Reclamo aggiornato con successo.");
      router.refresh();
    } catch {
      setErrore("Errore di rete. Riprova.");
    } finally {
      setAzioneAttiva(null);
    }
  }

  return (
    <div className="space-y-4">
      {errore && (
        <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {errore}
        </p>
      )}
      {successo && (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          {successo}
        </p>
      )}

      {reclami.map((reclamo) => {
        const azioni = azioniReclamoDisponibili(reclamo.stato);
        return (
          <div
            key={reclamo.id}
            className="rounded-xl border border-red-100 bg-red-50/50 p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700">
                <AlertTriangle className="h-4 w-4" aria-hidden />
              </span>
              <p className="text-sm font-bold text-red-800">
                🚨 Reclamo — {ETICHETTA_TIPO_RECLAMO[reclamo.tipo] ?? reclamo.tipo}
              </p>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${COLORI[reclamo.stato]}`}
              >
                {ETICHETTE_STATO_RECLAMO[reclamo.stato]}
              </span>
            </div>

            <div className="mt-3 space-y-1.5 text-xs leading-5 text-slate-600">
              {reclamo.messaggio && (
                <p className="rounded-lg bg-white/80 px-3 py-2 text-slate-700">
                  “{reclamo.messaggio}”
                </p>
              )}
              <p>
                Cliente: <strong>{reclamo.clienteNome || "—"}</strong>
                {reclamo.clienteTelefono ? ` · ${reclamo.clienteTelefono}` : ""}
              </p>
              <p>
                Ricevuto il{" "}
                {new Date(reclamo.createdAt).toLocaleString("it-IT", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              {reclamo.gestitoNota && (
                <p className="italic text-slate-500">Nota: “{reclamo.gestitoNota}”</p>
              )}
            </div>

            {azioni.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {azioni.map((azione) => (
                  <button
                    key={azione.stato}
                    type="button"
                    onClick={() => void eseguiAzione(reclamo.id, azione.stato)}
                    disabled={azioneAttiva !== null}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                      azione.stato === "risolto"
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : azione.stato === "chiuso"
                          ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    {azioneAttiva === `${reclamo.id}-${azione.stato}` && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    )}
                    {azione.etichetta}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
