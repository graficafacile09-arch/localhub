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
  Send,
  Store,
  User,
  X,
} from "lucide-react";
import {
  azioniReclamoDisponibili,
  ETICHETTA_TIPO_RECLAMO,
  ETICHETTE_STATO_RECLAMO,
  formattaDataOraReclamo,
  type ReclamoOrdine as ReclamoOrdineType,
  type StatoReclamo,
} from "@/lib/ordine-reclami-stati";
import type { MessaggioReclamo } from "@/lib/ordine-reclami-messaggi";

type Props = {
  negozioId: string;
  ordineId: string;
  /** Numero LEGGIBILE dell'ordine (es. LH-000043, mai l'UUID). */
  numero: string;
  /** Sintesi dei prodotti (nome o \"N prodotti\"). */
  sintesi: string;
  reclamiIniziali: ReclamoOrdineType[];
  /** Comunicazioni iniziali lette server-side (per reclamo id). */
  messaggiIniziali?: Record<string, MessaggioReclamo[]>;
};

const COLORI: Record<StatoReclamo, string> = {
  aperto: "bg-red-50 text-red-700 ring-1 ring-red-200",
  in_gestione: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  risolto: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  chiuso: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

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
 * Scheda operativa completa: segnale rosso, riferimento ordine/prodotto,
 * cliente, problema, COSA FARE e STATO DEL RECLAMO (stepper). Include il
 * DIALOGO REALE col cliente:
 *
 *   RECLAMO APERTO → PRENDI IN CARICO → CONTATTA CLIENTE → messaggio →
 *   storico della comunicazione → PROBLEMA RISOLTO → CHIUDI
 *
 * - \"Contatta cliente\" apre un dialog controllato e salva il messaggio nel
 *   DB tramite l'API dedicata (ownership verificata server-side); dopo il
 *   salvataggio il cliente riceve l'email BEST-EFFORT.
 * - Lo storico comunicazione mostra tutti i messaggi (venditore/cliente)
 *   con data e mittente: il venditore sa sempre cosa è stato detto.
 */
export default function ReclamiOrdine({
  negozioId,
  ordineId,
  numero,
  sintesi,
  reclamiIniziali,
  messaggiIniziali = {},
}: Props) {
  const router = useRouter();
  const [reclami, setReclami] = useState<ReclamoOrdineType[]>(reclamiIniziali);
  const [messaggi, setMessaggi] = useState<Record<string, MessaggioReclamo[]>>(
    messaggiIniziali
  );
  const [azioneAttiva, setAzioneAttiva] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [successo, setSuccesso] = useState<string | null>(null);

  // Dialog \"Contatta cliente\"
  const [contattaAperto, setContattaAperto] = useState<string | null>(null);
  const [testoMessaggio, setTestoMessaggio] = useState("");
  const [invioMessaggio, setInvioMessaggio] = useState(false);
  // Errore mostrato DENTRO il dialog (mai nascosto sotto il backdrop).
  const [erroreInvio, setErroreInvio] = useState<string | null>(null);

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

  async function inviaMessaggio(reclamoId: string) {
    // Guardia anti doppio submit (oltre al disabled del pulsante).
    if (invioMessaggio) return;
    const corpo = testoMessaggio.trim();
    // Messaggio vuoto → errore DENTRO il modal, MAI una POST, contenuto intatto.
    if (!corpo) {
      setErroreInvio("Scrivi un messaggio prima di inviarlo.");
      return;
    }
    setInvioMessaggio(true);
    setErroreInvio(null);
    try {
      const res = await fetch(
        `/api/merchant/stores/${negozioId}/ordini/${ordineId}/reclami/${reclamoId}/messaggi`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ corpo }),
        }
      );
      const data = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        data?: { messaggio?: MessaggioReclamo };
      } | null;

      // 4xx/5xx → errore nel modal, il modal NON si chiude, testo preservato.
      if (!res.ok) {
        setErroreInvio(
          data?.error?.message ?? "Impossibile inviare il messaggio. Riprova."
        );
        return;
      }
      // Il modal si chiude SOLO dopo una risposta di successo.
      if (data?.data?.messaggio) {
        const msg = data.data.messaggio;
        setMessaggi((prev) => ({
          ...prev,
          [reclamoId]: [...(prev[reclamoId] ?? []), msg],
        }));
      }
      setSuccesso("Messaggio inviato al cliente. Verrà avvisato via email.");
      setTestoMessaggio("");
      setErroreInvio(null);
      setContattaAperto(null);
      router.refresh();
    } catch {
      setErroreInvio("Errore di rete. Controlla la connessione e riprova.");
    } finally {
      setInvioMessaggio(false);
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
        const storico = messaggi[reclamo.id] ?? [];
        const reclamoChiuso = reclamo.stato === "chiuso";
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
                  {/* CONTATTA CLIENTE — dialog reale (mai bottone finto) */}
                  <button
                    type="button"
                    onClick={() => {
                      setErrore(null);
                      setSuccesso(null);
                      setErroreInvio(null);
                      setTestoMessaggio("");
                      setContattaAperto(reclamo.id);
                    }}
                    disabled={reclamoChiuso}
                    title={
                      reclamoChiuso
                        ? "Il reclamo è chiuso: non è possibile inviare messaggi"
                        : undefined
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
                  >
                    <Mail className="h-4 w-4" aria-hidden />
                    Contatta cliente
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
                              : "border border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
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

              {/* ── STORICO DELLA COMUNICAZIONE ─────────────────────────────── */}
              {storico.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    Storico della comunicazione
                  </p>
                  <ol className="mt-2.5 space-y-2.5">
                    {storico.map((msg) => {
                      const èVenditore = msg.mittente === "venditore";
                      return (
                        <li
                          key={msg.id}
                          className={`flex items-start gap-2.5 ${èVenditore ? "" : "flex-row-reverse"}`}
                        >
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm ${
                              èVenditore
                                ? "bg-blue-600 text-white"
                                : "bg-slate-700 text-white"
                            }`}
                          >
                            {èVenditore ? (
                              <Store className="h-4 w-4" aria-hidden />
                            ) : (
                              <User className="h-4 w-4" aria-hidden />
                            )}
                          </span>
                          <div
                            className={`min-w-0 max-w-[75%] rounded-xl px-3.5 py-2.5 ${
                              èVenditore
                                ? "bg-blue-50 ring-1 ring-blue-100"
                                : "bg-slate-100 ring-1 ring-slate-200"
                            }`}
                          >
                            <p className="flex flex-wrap items-center gap-x-2 text-[11px] font-bold text-slate-700">
                              {èVenditore ? msg.mittenteNome || "Negozio" : "Cliente"}
                              <span className="font-medium text-slate-400">
                                {formattaDataOraReclamo(msg.createdAt) || ""}
                              </span>
                            </p>
                            <p className="mt-0.5 whitespace-pre-wrap text-sm leading-5 text-slate-800">
                              {msg.corpo}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}

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

      {/* ── Dialog CONTATTA CLIENTE (controllato dallo stato, mai alert) ─── */}
      {contattaAperto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              // Durante l'invio il modal NON può essere chiuso dal backdrop.
              if (!invioMessaggio) setContattaAperto(null);
            }}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Mail className="h-5 w-5" aria-hidden />
                </span>
                <h2 className="text-sm font-black text-slate-900">
                  Contatta il cliente — {numero}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  // Durante l'invio il modal NON può essere chiuso dalla X.
                  if (!invioMessaggio) setContattaAperto(null);
                }}
                disabled={invioMessaggio}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
                aria-label="Chiudi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {erroreInvio && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wide text-red-700">
                      Invio non riuscito
                    </p>
                    <p className="mt-0.5 text-sm leading-5 text-red-700/90">
                      {erroreInvio}
                    </p>
                  </div>
                </div>
              )}
              <p className="text-xs leading-5 text-slate-500">
                Scrivi un messaggio al cliente: verrà avvisato via email e
                potrà risponderti direttamente dal dettaglio del suo ordine.
              </p>
              <div>
                <label
                  htmlFor="messaggio-contatta"
                  className="text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Messaggio
                </label>
                <textarea
                  id="messaggio-contatta"
                  value={testoMessaggio}
                  onChange={(e) => setTestoMessaggio(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  autoFocus
                  placeholder="Spiega al cliente come intendi risolvere il problema…"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
                <p className="mt-1 text-right text-[10px] text-slate-400">
                  {testoMessaggio.length}/2000
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setContattaAperto(null)}
                disabled={invioMessaggio}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => void inviaMessaggio(contattaAperto)}
                disabled={invioMessaggio}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {invioMessaggio ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
                {invioMessaggio ? "Invio…" : "Invia messaggio"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
