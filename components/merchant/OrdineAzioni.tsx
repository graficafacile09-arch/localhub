"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ExternalLink,
  Hammer,
  Loader2,
  PackageCheck,
  Settings2,
  Truck,
  X,
} from "lucide-react";
import type { StatoOrdine, StatoSpedizione } from "@/lib/cliente/types";
import {
  azioniDisponibili,
  MOTIVI_ANNULLAMENTO,
  type AzioneOrdine,
} from "@/lib/merchant/ordini-stati";
import {
  azioniSpedizioneDisponibili,
  etichettaStatoSpedizione,
  type AzioneSpedizione,
} from "@/lib/merchant/ordini-spedizioni";

type Props = {
  negozioId: string;
  ordineId: string;
  numero: string;
  stato: StatoOrdine;
  modalita: "ritiro" | "spedizione";
  statoSpedizione: StatoSpedizione | null;
  trackingUrl: string | null;
  /**
   * Base dell'endpoint azioni. Default: endpoint merchant
   * `/api/merchant/stores/<negozioId>/ordini/<ordineId>`. L'Area
   * Amministratore riusa il componente passando
   * `/api/amministratore/ordini/<ordineId>` (stesse RPC, stessa macchina
   * a stati, autorizzazione admin server-side).
   */
  apiBase?: string;
};

/** Icona per ogni azione di avanzamento (pannello operativo professionale). */
const ICONE_AZIONE: Record<string, React.ComponentType<{ className?: string }>> = {
  confermato: CheckCircle2,
  in_lavorazione: Hammer,
  pronto: PackageCheck,
  consegnato: CheckCircle2,
  cancellato: Ban,
};

/** Icona per ogni azione di spedizione. */
const ICONE_AZIONE_SPEDIZIONE: Record<string, React.ComponentType<{ className?: string }>> = {
  affida: Truck,
  riassegna: Truck,
  transito: Truck,
  consegnata: CheckCircle2,
  problema: AlertTriangle,
};

/**
 * Pulsanti azione del dettaglio ordine (area venditore) — pannello
 * operativo professionale:
 * - azioni NON distruttive con icona → PATCH (stato di destinazione); dopo
 *   il successo `router.refresh()` mantiene il venditore NEL dettaglio;
 * - "Annulla ordine" → dialog CONTROLLATO con motivo OBBLIGATORIO e nota
 *   opzionale (obbligatoria se motivo = "Altro"); conferma rosso evidente;
 * - SEZIONE SPEDIZIONE (solo modalita=spedizione): azioni della macchina a
 *   stati spedizione; "Affida al corriere"/"Riaffida spedizione" aprono un
 *   dialog compatto con tracking OBBLIGATORIO, URL e consegna stimata.
 * - errori inline (transizione non consentita, tracking mancante, …).
 */
export default function OrdineAzioni({
  negozioId,
  ordineId,
  numero,
  stato,
  modalita,
  statoSpedizione,
  trackingUrl,
  apiBase,
}: Props) {
  const router = useRouter();
  const endpointBase =
    apiBase ?? `/api/merchant/stores/${negozioId}/ordini/${ordineId}`;
  const azioni = azioniDisponibili(stato);
  const azioniSpedizione = modalita === "spedizione" ? azioniSpedizioneDisponibili(statoSpedizione, stato) : [];

  const [azioneAttiva, setAzioneAttiva] = useState<AzioneOrdine | null>(null);
  const [annullaAperto, setAnnullaAperto] = useState(false);
  const [motivo, setMotivo] = useState(MOTIVI_ANNULLAMENTO[0]?.valore ?? "altro");
  const [nota, setNota] = useState("");
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [successo, setSuccesso] = useState<string | null>(null);

  // ── Stato dialog spedizione (affida/riassegna) ──────────────────────────
  const [spedizioneAperta, setSpedizioneAperta] = useState<AzioneSpedizione | null>(null);
  const [trackingCode, setTrackingCode] = useState("");
  const [trackingUrlInput, setTrackingUrlInput] = useState("");
  const [consegnaStimata, setConsegnaStimata] = useState("");
  const [invioSpedizione, setInvioSpedizione] = useState(false);

  const motivoSelezionato = MOTIVI_ANNULLAMENTO.find((m) => m.valore === motivo);

  // Stati terminali (completato/annullato) senza azioni ordine: si rende
  // comunque la sezione spedizione (se disponibile) e i messaggi di esito.
  if (azioni.length === 0 && azioniSpedizione.length === 0 && !successo && !errore) return null;

  async function eseguiStato(statoDestinazione: StatoOrdine, body: { motivo?: string; nota?: string }) {
    setInvio(true);
    setErrore(null);
    setSuccesso(null);
    try {
      const res = await fetch(endpointBase, {
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

  // ── Spedizione ──────────────────────────────────────────────────────────
  function apriSpedizione(azione: AzioneSpedizione) {
    setErrore(null);
    setSuccesso(null);
    if (azione.richiedeTracking) {
      setTrackingCode("");
      setTrackingUrlInput("");
      setConsegnaStimata("");
      setSpedizioneAperta(azione);
    } else {
      void eseguiSpedizione(azione, {});
    }
  }

  async function eseguiSpedizione(
    azione: AzioneSpedizione,
    body: { trackingCode?: string; trackingUrl?: string; consegnaStimata?: string }
  ) {
    setInvioSpedizione(true);
    setErrore(null);
    setSuccesso(null);
    try {
      const res = await fetch(`${endpointBase}/spedizione`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          azione: azione.azione,
          tracking_code: body.trackingCode ?? null,
          tracking_url: body.trackingUrl ?? null,
          consegna_stimata: body.consegnaStimata ?? null,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;

      if (!res.ok) {
        setErrore(data?.error?.message ?? "Impossibile aggiornare la spedizione.");
        return false;
      }
      setSuccesso(`Spedizione aggiornata: ${etichettaStatoSpedizione(azione.stato) ?? ""}`.trim());
      router.refresh();
      return true;
    } catch {
      setErrore("Errore di rete. Riprova.");
      return false;
    } finally {
      setInvioSpedizione(false);
    }
  }

  async function confermaSpedizione() {
    if (!spedizioneAperta) return;
    if (!trackingCode.trim()) {
      setErrore("Inserisci il codice di tracking.");
      return;
    }
    const ok = await eseguiSpedizione(spedizioneAperta, {
      trackingCode: trackingCode.trim(),
      trackingUrl: trackingUrlInput.trim() || undefined,
      consegnaStimata: consegnaStimata.trim() || undefined,
    });
    if (ok) {
      setSpedizioneAperta(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Messaggi inline */}
      {errore && (
        <p className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-medium text-blue-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {errore}
        </p>
      )}
      {successo && (
        <p className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-medium text-blue-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          {successo}
        </p>
      )}

      {/* Pulsanti azione ordine — gerarchia chiara (azioni principali vs annulla) */}
      {azioni.length > 0 && (
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
                    ? "border border-blue-200 bg-white text-blue-600 hover:border-blue-300 hover:bg-blue-50"
                    : "bg-yellow-400 text-blue-800 shadow-sm hover:bg-yellow-300"
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
      )}

      {/* ── Sezione spedizione (solo modalita=spedizione) ──────────────────── */}
      {modalita === "spedizione" && azioniSpedizione.length > 0 && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
            <Truck className="h-4 w-4" aria-hidden />
            Spedizione
            {statoSpedizione && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-slate-600">
                {etichettaStatoSpedizione(statoSpedizione)}
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2.5">
            {azioniSpedizione.map((azione) => {
              const Icon = ICONE_AZIONE_SPEDIZIONE[azione.azione] ?? Truck;
              return (
                <button
                  key={`${azione.azione}-${azione.etichetta}`}
                  type="button"
                  onClick={() => apriSpedizione(azione)}
                  disabled={invioSpedizione}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-white px-3.5 py-2 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50 active:scale-[0.98] disabled:opacity-50"
                >
                  {invioSpedizione && spedizioneAperta?.azione === azione.azione ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Icon className="h-4 w-4" aria-hidden />
                  )}
                  {azione.etichetta}
                </button>
              );
            })}
          </div>
          {trackingUrl && (
            <a
              href={trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Apri pagina tracking
            </a>
          )}
        </div>
      )}

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
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Ban className="h-5 w-5" aria-hidden />
                </span>
                <h2 className="text-sm font-black text-slate-900">
                  Annulla ordine {numero}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAnnullaAperto(false)}
                className="rounded-lg border border-blue-200 bg-blue-50 p-1 text-blue-600 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
                aria-label="Chiudi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
              <p className="rounded-xl border border-blue-100 bg-blue-50/60 px-3.5 py-3 text-xs leading-5 text-blue-800">
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
                          ? "border-blue-300 bg-blue-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="motivo"
                        value={m.valore}
                        checked={motivo === m.valore}
                        onChange={() => setMotivo(m.valore)}
                        className="mt-0.5 h-4 w-4 accent-blue-600"
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
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {errore && (
                <p className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-medium text-blue-700">
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
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800 disabled:opacity-50"
              >
                Torna indietro
              </button>
              <button
                type="button"
                onClick={confermaAnnullamento}
                disabled={invio}
                className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-xs font-bold text-blue-800 transition hover:bg-yellow-300 disabled:opacity-50"
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

      {/* ── Dialog spedizione (tracking obbligatorio per affida/riassegna) ── */}
      {spedizioneAperta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSpedizioneAperta(null)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Truck className="h-5 w-5" aria-hidden />
                </span>
                <h2 className="text-sm font-black text-slate-900">
                  {spedizioneAperta.etichetta}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSpedizioneAperta(null)}
                className="rounded-lg border border-blue-200 bg-blue-50 p-1 text-blue-600 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
                aria-label="Chiudi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <label
                  htmlFor="tracking-code"
                  className="text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Codice tracking <span className="text-red-500">*</span>
                </label>
                <input
                  id="tracking-code"
                  value={trackingCode}
                  onChange={(e) => setTrackingCode(e.target.value)}
                  placeholder="Es. 1234567890"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="tracking-url"
                  className="text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  URL tracking (opzionale)
                </label>
                <input
                  id="tracking-url"
                  value={trackingUrlInput}
                  onChange={(e) => setTrackingUrlInput(e.target.value)}
                  placeholder="https://…"
                  inputMode="url"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="consegna-stimata"
                  className="text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Consegna stimata (opzionale)
                </label>
                <input
                  id="consegna-stimata"
                  value={consegnaStimata}
                  onChange={(e) => setConsegnaStimata(e.target.value)}
                  placeholder="Es. 1-2 giorni"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {errore && (
                <p className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-medium text-blue-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {errore}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setSpedizioneAperta(null)}
                disabled={invioSpedizione}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800 disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={confermaSpedizione}
                disabled={invioSpedizione}
                className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-xs font-bold text-blue-800 transition hover:bg-yellow-300 disabled:opacity-50"
              >
                {invioSpedizione ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Truck className="h-4 w-4" aria-hidden />
                )}
                {invioSpedizione ? "Invio…" : "Conferma"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
