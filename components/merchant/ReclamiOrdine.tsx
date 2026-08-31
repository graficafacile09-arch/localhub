"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquareText,
  Phone,
  Send,
  Store,
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
import type { MessaggioReclamo } from "@/lib/ordine-reclami-messaggi";

type Props = {
  negozioId: string;
  ordineId: string;
  /** Numero LEGGIBILE dell'ordine (es. LH-000043, mai l'UUID). */
  numero: string;
  /** Sintesi dei prodotti (nome o "N prodotti"). */
  sintesi: string;
  reclamiIniziali: ReclamoOrdineType[];
  /** Comunicazioni iniziali lette server-side (per reclamo id). */
  messaggiIniziali?: Record<string, MessaggioReclamo[]>;
  /** Dettaglio ordine completo: mostrato SOLO dietro il toggle. */
  ordineCompleto?: ReactNode;
};

const COLORI: Record<StatoReclamo, string> = {
  aperto: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  in_gestione: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
  risolto: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  chiuso: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const CERCHIO_ATTIVO: Record<StatoReclamo, string> = {
  aperto: "bg-blue-600",
  in_gestione: "bg-yellow-500",
  risolto: "bg-blue-600",
  chiuso: "bg-slate-500",
};

const PASSI_RECLAMO: StatoReclamo[] = ["aperto", "in_gestione", "risolto", "chiuso"];

/**
 * CONSOLE OPERATIVA RECLAMO — Area Venditore.
 *
 * Gerarchia: RECLAMO → CONVERSAZIONE → AZIONE.
 *  - header compatto: stato reclamo + #LH-XXXX · prodotto (una sola volta);
 *  - CHAT subito sotto, con composer INLINE (scrivi e invia senza modal);
 *  - azioni reclamo compatte, solo quelle consentite dallo stato;
 *  - stepper di stato compatto (● APERTO → IN GESTIONE → RISOLTO → CHIUSO);
 *  - il dettaglio completo dell'ordine è accessibile SOLO tramite il toggle
 *    "Vedi ordine completo" (mai una pagina ordine davanti al reclamo).
 *
 * FUNZIONALITÀ INVARIATE (nessun cambio backend/API): il messaggio del
 * venditore viene salvato via POST /messaggi (ownership server-side) e il
 * cliente riceve l'email best-effort; le azioni usano PATCH (macchina a
 * stati esistente). La risposta del cliente appare nello storico.
 */
export default function ReclamiOrdine({
  negozioId,
  ordineId,
  numero,
  sintesi,
  reclamiIniziali,
  messaggiIniziali = {},
  ordineCompleto,
}: Props) {
  const router = useRouter();
  const [reclami, setReclami] = useState<ReclamoOrdineType[]>(reclamiIniziali);
  const [messaggi, setMessaggi] = useState<Record<string, MessaggioReclamo[]>>(
    messaggiIniziali
  );
  const [azioneAttiva, setAzioneAttiva] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [successo, setSuccesso] = useState<string | null>(null);

  // Composer INLINE della chat (sostituisce il vecchio modal "Contatta cliente").
  const [testoMessaggio, setTestoMessaggio] = useState("");
  const [invioMessaggio, setInvioMessaggio] = useState(false);
  const [erroreInvio, setErroreInvio] = useState<string | null>(null);

  // Dettaglio ordine completo: dietro il toggle, mai davanti alla chat.
  const [mostraOrdine, setMostraOrdine] = useState(false);

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

      if (!res.ok) {
        setErroreInvio(
          data?.error?.message ?? "Impossibile inviare il messaggio. Riprova."
        );
        return;
      }
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

      {reclami.map((reclamo) => {
        const azioni = azioniReclamoDisponibili(reclamo.stato);
        const indiceAttivo = PASSI_RECLAMO.indexOf(reclamo.stato);
        const storico = messaggi[reclamo.id] ?? [];
        const reclamoChiuso = reclamo.stato === "chiuso";
        return (
          <article
            key={reclamo.id}
            className="overflow-hidden rounded-[1.75rem] border border-blue-200 bg-white shadow-sm"
          >
            {/* ── HEADER COMPATTO: 🔴 RECLAMO · #LH-XXXX · prodotto ─────────── */}
            <div className="relative border-b border-blue-100 bg-blue-50/80 px-5 py-3.5">
              <span
                className="absolute inset-y-0 left-0 w-1.5 bg-linear-to-b from-blue-500 to-blue-700"
                aria-hidden
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30">
                  <AlertTriangle className="h-4.5 w-4.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] font-black uppercase tracking-wide text-blue-800">
                    Reclamo —{" "}
                    {ETICHETTA_TIPO_RECLAMO[reclamo.tipo] ?? reclamo.tipo}
                    <span className="font-mono text-sm font-black normal-case tracking-tight text-slate-900 tabular-nums">
                      #{numero}
                    </span>
                    {sintesi && (
                      <span className="max-w-[60vw] truncate text-xs font-semibold normal-case text-slate-600 sm:max-w-none">
                        · {sintesi}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-blue-700/80">
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" aria-hidden />
                      {reclamo.clienteNome || "—"}
                    </span>
                    {reclamo.clienteTelefono ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" aria-hidden />
                        {reclamo.clienteTelefono}
                      </span>
                    ) : null}
                    <span>· {formattaDataOraReclamo(reclamo.createdAt) || "—"}</span>
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${COLORI[reclamo.stato]}`}
                >
                  {ETICHETTE_STATO_RECLAMO[reclamo.stato]}
                </span>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5">
              {/* ── CONVERSAZIONE — il cuore della schermata ───────────────── */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                  Conversazione
                </p>

                {/* Messaggio iniziale del cliente (il problema segnalato). */}
                {reclamo.messaggio ? (
                  <div className="mb-3 flex items-start gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-white shadow-sm">
                      <User className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 max-w-[85%] rounded-xl bg-slate-100 px-3.5 py-2.5 ring-1 ring-slate-200">
                      <p className="text-[11px] font-bold text-slate-700">
                        {reclamo.clienteNome || "Cliente"}
                        <span className="ml-2 font-medium text-slate-400">
                          segnalazione iniziale
                        </span>
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm leading-5 text-slate-800">
                        {reclamo.messaggio}
                      </p>
                    </div>
                  </div>
                ) : null}

                {/* Storico della conversazione. */}
                {storico.length > 0 ? (
                  <ol className="space-y-2.5">
                    {storico.map((msg) => {
                      const èVenditore = msg.mittente === "venditore";
                      return (
                        <li
                          key={msg.id}
                          className={`flex items-start gap-2.5 ${èVenditore ? "" : "flex-row-reverse"}`}
                        >
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm ${
                              èVenditore ? "bg-blue-600 text-white" : "bg-slate-700 text-white"
                            }`}
                          >
                            {èVenditore ? (
                              <Store className="h-4 w-4" aria-hidden />
                            ) : (
                              <User className="h-4 w-4" aria-hidden />
                            )}
                          </span>
                          <div
                            className={`min-w-0 max-w-[85%] rounded-xl px-3.5 py-2.5 ${
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
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3 text-center text-xs text-slate-400">
                    Nessuna risposta ancora: scrivi tu il primo messaggio al cliente.
                  </p>
                )}

                {/* ── COMPOSER INLINE (mai un modal): scrivi e invia qui ────── */}
                <div className="mt-3">
                  {erroreInvio && (
                    <p
                      role="alert"
                      className="mb-2 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700"
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {erroreInvio}
                    </p>
                  )}
                  <div className="flex items-end gap-2">
                    <textarea
                      value={testoMessaggio}
                      onChange={(e) => setTestoMessaggio(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      disabled={reclamoChiuso}
                      placeholder={
                        reclamoChiuso
                          ? "Reclamo chiuso: non è possibile inviare messaggi."
                          : "Scrivi una risposta al cliente…"
                      }
                      className="min-w-0 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => void inviaMessaggio(reclamo.id)}
                      disabled={invioMessaggio || reclamoChiuso}
                      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-yellow-400 hover:text-blue-900 active:scale-[0.98] disabled:opacity-50"
                    >
                      {invioMessaggio ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Send className="h-4 w-4" aria-hidden />
                      )}
                      Invia
                    </button>
                  </div>
                  <p className="mt-1 text-right text-[10px] text-slate-400">
                    {testoMessaggio.length}/2000
                  </p>
                </div>
              </div>

              {/* ── AZIONI RECLAMO — compatte, solo quelle consentite ──────── */}
              {azioni.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    Azioni
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {azioni.map((azione) => {
                      const attiva = azioneAttiva === `${reclamo.id}-${azione.stato}`;
                      const risolvi = azione.stato === "risolto";
                      return (
                        <button
                          key={`${reclamo.id}-${azione.stato}`}
                          type="button"
                          onClick={() => void eseguiAzione(reclamo.id, azione.stato)}
                          disabled={azioneAttiva !== null}
                          className={`inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-xs font-bold transition active:scale-[0.98] disabled:opacity-50 ${
                            risolvi
                              ? "bg-blue-600 text-white shadow-sm hover:bg-yellow-300"
                              : azione.stato === "chiuso"
                                ? "border border-blue-300 bg-white text-blue-700 hover:bg-yellow-50"
                                : "border border-yellow-300 bg-yellow-50 text-yellow-800"
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
              )}

              {/* ── STATO RECLAMO — stepper compatto ───────────────────────── */}
              <div className="flex flex-wrap items-center gap-y-1.5">
                {PASSI_RECLAMO.map((passo, idx) => {
                  const fatto = idx <= indiceAttivo;
                  const attuale = idx === indiceAttivo;
                  return (
                    <div key={passo} className="flex items-center">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black transition-colors ${
                          attuale
                            ? `${CERCHIO_ATTIVO[passo]} text-white shadow-sm`
                            : fatto
                              ? "bg-slate-700 text-white"
                              : "bg-slate-100 text-slate-400 ring-1 ring-slate-200"
                        }`}
                        title={ETICHETTE_STATO_RECLAMO[passo]}
                      >
                        {fatto && !attuale ? (
                          <Check className="h-3 w-3" aria-hidden />
                        ) : (
                          idx + 1
                        )}
                      </span>
                      <span
                        className={`ml-1.5 text-[10px] font-bold ${
                          attuale
                            ? "text-slate-900"
                            : fatto
                              ? "text-slate-600"
                              : "text-slate-400"
                        }`}
                      >
                        {ETICHETTE_STATO_RECLAMO[passo]}
                      </span>
                      {idx < PASSI_RECLAMO.length - 1 && (
                        <span
                          className={`mx-2 h-px w-4 sm:w-8 ${
                            fatto ? "bg-slate-400" : "bg-slate-200"
                          }`}
                          aria-hidden
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {reclamo.gestitoNota && (
                <p className="text-xs italic text-slate-500">
                  Nota di gestione: “{reclamo.gestitoNota}”
                </p>
              )}
            </div>
          </article>
        );
      })}

      {/* ── DETTAGLIO ORDINE COMPLETO — SOLO dietro il toggle ─────────────── */}
      {ordineCompleto && (
        <div>
          <button
            type="button"
            onClick={() => setMostraOrdine((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:border-yellow-300 hover:text-yellow-800"
          >
            {mostraOrdine ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            )}
            {mostraOrdine ? "Nascondi dettagli ordine" : "Vedi ordine completo"}
          </button>
          {mostraOrdine && <div className="mt-4">{ordineCompleto}</div>}
        </div>
      )}
    </div>
  );
}
