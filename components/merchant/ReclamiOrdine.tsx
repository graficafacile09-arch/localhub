"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Loader2,
  Mail,
  Phone,
  User,
} from "lucide-react";
import {
  azioniReclamoDisponibili,
  ETICHETTA_TIPO_RECLAMO,
  ETICHETTE_STATO_RECLAMO,
  formattaDataOraReclamo,
  type ReclamoOrdine as ReclamoOrdineType,
  type StatoReclamo,
} from "@/lib/ordine-reclami-stati";

type Props = {
  negozioId: string;
  ordineId: string;
  /** Numero LEGGIBILE dell'ordine (es. LH-000043, mai l'UUID). */
  numero: string;
  /** Sintesi dei prodotti (nome o \"N prodotti\"). */
  sintesi: string;
  reclamiIniziali: ReclamoOrdineType[];
};

const COLORI: Record<StatoReclamo, string> = {
  aperto: "bg-red-50 text-red-700 ring-1 ring-red-200",
  in_gestione: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  risolto: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  chiuso: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

/** Colore di riempimento dello step ATTIVO nel percorso del reclamo. */
const CERCHIO_ATTIVO: Record<StatoReclamo, string> = {
  aperto: "bg-red-600",
  in_gestione: "bg-amber-500",
  risolto: "bg-emerald-600",
  chiuso: "bg-slate-500",
};

const PASSI_RECLAMO: StatoReclamo[] = ["aperto", "in_gestione", "risolto", "chiuso"];

/**
 * CENTRO GESTIONE RECLAMO — Area Venditore.
 *
 * Un reclamo NON è una normale informazione dentro l'ordine: è un problema
 * da gestire. Il componente lo presenta come una vera scheda operativa:
 *
 *   🚨 RECLAMO APERTO            [stato]
 *   #LH-000043 · Nome prodotto
 *   Cliente: Mario Rossi · tel
 *   \"Problema del cliente\"
 *
 *   COSA FARE
 *   [✉ Scrivi al cliente]  [✓ Segna come risolto]  [Prendi in carico]
 *
 *   STATO DEL RECLAMO
 *   ● Aperto → ● In gestione → ○ Risolto → ○ Chiuso
 *
 * Le azioni usano SOLO la macchina a stati esistente
 * (azioniReclamoDisponibili → PATCH alla stessa API di sempre, ri-validata
 * server-side). \"Scrivi al cliente\" è mostrato come NON DISPONIBILE: non
 * esiste alcun endpoint di contatto diretto, quindi nessuna funzione finta.
 */
export default function ReclamiOrdine({
  negozioId,
  ordineId,
  numero,
  sintesi,
  reclamiIniziali,
}: Props) {
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
        const indiceAttivo = PASSI_RECLAMO.indexOf(reclamo.stato);
        return (
          <article
            key={reclamo.id}
            className="overflow-hidden rounded-[1.75rem] border border-red-200 bg-white shadow-sm"
          >
            {/* ── Intestazione: segnale operativo rosso ─────────────────────── */}
            <div className="relative border-b border-red-100 bg-red-50/80 px-5 py-4">
              <span
                className="absolute inset-y-0 left-0 w-1.5 bg-linear-to-b from-red-500 to-red-700"
                aria-hidden
              />
              <div className="flex flex-wrap items-center gap-3 pl-2">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-white shadow-sm shadow-red-600/30">
                  <AlertTriangle className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black uppercase tracking-wide text-red-800">
                    Reclamo — {ETICHETTA_TIPO_RECLAMO[reclamo.tipo] ?? reclamo.tipo}
                  </p>
                  <p className="mt-0.5 text-[11px] text-red-700/80">
                    Ricevuto il {formattaDataOraReclamo(reclamo.createdAt) || "—"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${COLORI[reclamo.stato]}`}
                >
                  {ETICHETTE_STATO_RECLAMO[reclamo.stato]}
                </span>
              </div>
            </div>

            {/* ── Riferimento ordine + cliente + problema ───────────────────── */}
            <div className="space-y-4 px-5 py-5">
              {/* Riferimento ordine */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-mono text-lg font-black tracking-tight text-slate-900 tabular-nums">
                  #{numero}
                </span>
                {sintesi && (
                  <span className="truncate text-sm font-semibold text-slate-500">
                    · {sintesi}
                  </span>
                )}
              </div>

              {/* Cliente */}
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                  <User className="h-3.5 w-3.5 text-red-500" aria-hidden />
                  {reclamo.clienteNome || "—"}
                </span>
                {reclamo.clienteTelefono ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                    {reclamo.clienteTelefono}
                  </span>
                ) : null}
              </p>

              {/* Problema */}
              <div className="rounded-xl border border-red-100 bg-red-50/60 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-red-700">
                  Problema segnalato
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-800">
                  {reclamo.messaggio
                    ? `“${reclamo.messaggio}”`
                    : "(nessun messaggio aggiuntivo)"}
                </p>
              </div>

              {reclamo.gestitoNota && (
                <p className="text-xs italic text-slate-500">
                  Nota di gestione: “{reclamo.gestitoNota}”
                </p>
              )}

              {/* ── COSA FARE ───────────────────────────────────────────────── */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Cosa fare
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {/* Scrivi al cliente — NON DISPONIBILE: nessun endpoint di
                      contatto diretto esiste. Nessuna funzione finta. */}
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    title="Non ancora disponibile"
                    className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-400"
                  >
                    <Mail className="h-4 w-4" aria-hidden />
                    Scrivi al cliente
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
                      Presto
                    </span>
                  </button>

                  {azioni.map((azione) => {
                    const attiva = azioneAttiva === `${reclamo.id}-${azione.stato}`;
                    const risolvi = azione.stato === "risolto";
                    return (
                      <button
                        key={`${reclamo.id}-${azione.stato}`}
                        type="button"
                        onClick={() => void eseguiAzione(reclamo.id, azione.stato)}
                        disabled={azioneAttiva !== null}
                        className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold transition active:scale-[0.98] disabled:opacity-50 ${
                          risolvi
                            ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                            : azione.stato === "chiuso"
                              ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              : "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                        }`}
                      >
                        {attiva ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : risolvi ? (
                          <CheckCircle2 className="h-4 w-4" aria-hidden />
                        ) : (
                          <Check className="h-4 w-4" aria-hidden />
                        )}
                        {azione.etichetta}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── STATO DEL RECLAMO — percorso operativo ──────────────────── */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Stato del reclamo
                </p>
                <ol className="mt-2.5 flex flex-wrap items-center gap-y-2">
                  {PASSI_RECLAMO.map((passo, idx) => {
                    const fatto = idx <= indiceAttivo;
                    const attuale = idx === indiceAttivo;
                    return (
                      <li key={passo} className="flex items-center">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black transition-colors ${
                              attuale
                                ? `${CERCHIO_ATTIVO[passo]} text-white shadow-sm`
                                : fatto
                                  ? "bg-slate-700 text-white"
                                  : "bg-slate-100 text-slate-400 ring-1 ring-slate-200"
                            }`}
                          >
                            {fatto && !attuale ? (
                              <Check className="h-3 w-3" aria-hidden />
                            ) : (
                              idx + 1
                            )}
                          </span>
                          <span
                            className={`text-[11px] font-bold ${
                              attuale
                                ? "text-slate-900"
                                : fatto
                                  ? "text-slate-600"
                                  : "text-slate-400"
                            }`}
                          >
                            {ETICHETTE_STATO_RECLAMO[passo]}
                          </span>
                        </div>
                        {idx < PASSI_RECLAMO.length - 1 && (
                          <span
                            className={`mx-2 h-px w-4 sm:w-6 ${
                              fatto ? "bg-slate-400" : "bg-slate-200"
                            }`}
                            aria-hidden
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
