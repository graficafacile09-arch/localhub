"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Hammer,
  Loader2,
  PackageCheck,
  Settings2,
  X,
} from "lucide-react";
import type { StatoOrdine } from "@/lib/cliente/types";
import {
  azioniDisponibili,
  MOTIVI_ANNULLAMENTO,
  type AzioneOrdine,
} from "@/lib/merchant/ordini-stati";

type Props = {
  negozioId: string;
  ordineId: string;
  numero: string;
  stato: StatoOrdine;
};

/** Icona per ogni azione di avanzamento (pannello operativo professionale). */
const ICONE_AZIONE: Record<string, React.ComponentType<{ className?: string }>> = {
  confermato: CheckCircle2,
  in_lavorazione: Hammer,
  pronto: PackageCheck,
  consegnato: CheckCircle2,
  cancellato: Ban,
};

/**
 * Pulsanti azione del dettaglio ordine (area venditore) — pannello
 * operativo professionale:
 * - azioni NON distruttive con icona → PATCH (stato di destinazione); dopo
 *   il successo `router.refresh()` mantiene il venditore NEL dettaglio;
 * - "Annulla ordine" → dialog CONTROLLATO con motivo OBBLIGATORIO e nota
 *   opzionale (obbligatoria se motivo = "Altro"); conferma rosso evidente;
 * - errori inline (transizione non consentita, motivo mancante, …).
 */
export default function OrdineAzioni({ negozioId, ordineId, numero, stato }: Props) {
  const router = useRouter();
  const azioni = azioniDisponibili(stato);

  const [azioneAttiva, setAzioneAttiva] = useState<AzioneOrdine | null>(null);
  const [annullaAperto, setAnnullaAperto] = useState(false);
  const [motivo, setMotivo] = useState(MOTIVI_ANNULLAMENTO[0]?.valore ?? "altro");
  const [nota, setNota] = useState("");
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [successo, setSuccesso] = useState<string | null>(null);

  const motivoSelezionato = MOTIVI_ANNULLAMENTO.find((m) => m.valore === motivo);

  // Stati terminali (completato/annullato): nessuna azione, ma se c'è un
  // messaggio di esito da mostrare lo rendiamo comunque visibile.
  if (azioni.length === 0 && !successo && !errore) return null;

  async function eseguiStato(statoDestinazione: StatoOrdine, body: { motivo?: string; nota?: string }) {
    setInvio(true);
    setErrore(null);
    setSuccesso(null);
    try {
      const res = await fetch(`/api/merchant/stores/${negozioId}/ordini/${ordineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stato: statoDestinazione, ...body }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        data?: { cambiato?: boolean };
      } | null;

      if (!res.ok) {
        setErrore(data?.error?.message ?? "Impossibile aggiornare l'ordine.");
        return false;
      }
      setSuccesso(
        statoDestinazione === "cancellato"
          ? "Ordine annullato. Il cliente riceverà un'email."
          : "Stato aggiornato con successo."
      );
      router.refresh();
      return true;
    } catch {
      setErrore("Errore di rete. Riprova.");
      return false;
    } finally {
      setInvio(false);
    }
  }

  function avviaAzione(azione: AzioneOrdine) {
    setErrore(null);
    setSuccesso(null);
    setAzioneAttiva(azione);
    if (azione.distruttiva) {
      setMotivo(MOTIVI_ANNULLAMENTO[0]?.valore ?? "altro");
      setNota("");
      setAnnullaAperto(true);
    } else {
      void eseguiStato(azione.stato, {});
    }
  }

  async function confermaAnnullamento() {
    if (!motivo) {
      setErrore("Seleziona un motivo per l'annullamento.");
      return;
    }
    if (motivoSelezionato?.richiedeNota && !nota.trim()) {
      setErrore("Indica una nota per il motivo selezionato.");
      return;
    }
    const ok = await eseguiStato("cancellato", {
      motivo,
      nota: nota.trim() || undefined,
    });
    if (ok) {
      setAnnullaAperto(false);
      setAzioneAttiva(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Messaggi inline */}
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

      {/* Pulsanti azione — gerarchia chiara (azioni principali vs annulla) */}
      <div className="flex flex-wrap gap-2.5">
        {azioni.map((azione) => {
          const Icon = ICONE_AZIONE[azione.stato] ?? Settings2;
          return (
            <button
              key={`${azione.stato}-${azione.etichetta}`}
              type="button"
              onClick={() => avviaAzione(azione)}
              disabled={invio}
              className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 ${
                azione.distruttiva
                  ? "border border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50"
                  : "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
              }`}
            >
              {invio && azioneAttiva?.stato === azione.stato ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Icon className="h-4 w-4" aria-hidden />
              )}
              {azione.etichetta}
            </button>
          );
        })}
      </div>

      {/* ── Dialog di annullamento (controllato dallo stato, mai alert JS) ── */}
      {annullaAperto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setAnnullaAperto(false)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <Ban className="h-5 w-5" aria-hidden />
                </span>
                <h2 className="text-sm font-black text-slate-900">
                  Annulla ordine {numero}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAnnullaAperto(false)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Chiudi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
              <p className="rounded-xl border border-red-100 bg-red-50/60 px-3.5 py-3 text-xs leading-5 text-red-800">
                <strong>Attenzione:</strong> vuoi davvero annullare questo
                ordine? Il cliente riceverà un&apos;email di avviso con il
                motivo indicato e lo stock verrà ripristinato. L&apos;operazione
                non può essere annullata.
              </p>

              {/* Motivazioni rapide (obbligatorie) */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Motivo
                </label>
                <div className="mt-2 space-y-2">
                  {MOTIVI_ANNULLAMENTO.map((m) => (
                    <label
                      key={m.valore}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition ${
                        motivo === m.valore
                          ? "border-red-300 bg-red-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="motivo"
                        value={m.valore}
                        checked={motivo === m.valore}
                        onChange={() => setMotivo(m.valore)}
                        className="mt-0.5 h-4 w-4 accent-red-600"
                      />
                      <span className="text-slate-700">{m.etichetta}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Nota (obbligatoria se "Altro") */}
              <div>
                <label
                  htmlFor="nota-annullamento"
                  className="text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Nota {motivoSelezionato?.richiedeNota ? "(obbligatoria)" : "(opzionale)"}
                </label>
                <textarea
                  id="nota-annullamento"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  rows={3}
                  placeholder={
                    motivoSelezionato?.richiedeNota
                      ? "Descrivi il motivo dell'annullamento…"
                      : "Eventuali dettagli per il cliente…"
                  }
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
                />
              </div>

              {errore && (
                <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {errore}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setAnnullaAperto(false)}
                disabled={invio}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Torna indietro
              </button>
              <button
                type="button"
                onClick={confermaAnnullamento}
                disabled={invio}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {invio ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Ban className="h-4 w-4" aria-hidden />
                )}
                {invio ? "Annullamento…" : "Conferma annullamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
