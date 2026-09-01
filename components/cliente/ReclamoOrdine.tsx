"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Send,
  Store,
  User,
  X,
} from "lucide-react";
import type { ReclamoOrdine as ReclamoOrdineType, StatoReclamo } from "@/lib/ordine-reclami-stati";
import type { MessaggioReclamo } from "@/lib/ordine-reclami-messaggi";

type Props = {
  ordineId: string;
  /** Il pulsante compare SOLO quando ha senso (ordine non annullato). */
  puòReclamare: boolean;
  /** Reclami già presenti (letto server-side). */
  reclamiIniziali: ReclamoOrdineType[];
  /** Comunicazioni iniziali (per reclamo id), lette server-side. */
  messaggiIniziali?: Record<string, MessaggioReclamo[]>;
};

const ETICHETTE: Record<StatoReclamo, string> = {
  aperto: "Aperto",
  in_gestione: "In gestione",
  risolto: "Risolto",
  chiuso: "Chiuso",
};

const COLORI: Record<StatoReclamo, string> = {
  aperto: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  in_gestione: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
  risolto: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  chiuso: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

function formattaDataBreve(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Reclamo ordine — Area Clienti.
 * - Se NON esiste un reclamo attivo: pulsante "Ordine non arrivato — Invia
 *   reclamo" + dialog controllato (nessun alert JS, nessun duplicato).
 * - Se esiste un reclamo ATTIVO: scheda operativa rossa con lo STATO, il
 *   problema segnalato, lo STORICO DELLA COMUNICAZIONE col negozio e la
 *   possibilità di RISPONDERE al venditore (salvato nel DB via API, con
 *   ownership verificata server-side; il negozio riceve la notifica).
 */
export default function ReclamoOrdine({
  ordineId,
  puòReclamare,
  reclamiIniziali,
  messaggiIniziali = {},
}: Props) {
  const router = useRouter();
  const [reclami, setReclami] = useState<ReclamoOrdineType[]>(reclamiIniziali);
  const [messaggi, setMessaggi] = useState<Record<string, MessaggioReclamo[]>>(
    messaggiIniziali
  );
  const [aperto, setAperto] = useState(false);
  const [messaggio, setMessaggio] = useState("");
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [conferma, setConferma] = useState<string | null>(null);

  // Risposta al venditore (reclamo attivo)
  const [risposta, setRisposta] = useState("");
  const [invioRisposta, setInvioRisposta] = useState(false);

  const attivo = reclami.find((r) => r.stato === "aperto" || r.stato === "in_gestione") ?? null;

  async function inviaReclamo() {
    setInvio(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/cliente/ordini/${ordineId}/reclami`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "ordine_non_arrivato",
          messaggio: messaggio.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        data?: { reclamo?: ReclamoOrdineType; giaEsistente?: boolean };
      } | null;

      if (!res.ok) {
        setErrore(data?.error?.message ?? "Impossibile inviare la segnalazione.");
        return;
      }

      if (data?.data?.reclamo) {
        setReclami([data.data.reclamo, ...reclami.filter((r) => r.id !== data.data!.reclamo!.id)]);
      }
      setConferma(
        data?.data?.giaEsistente
          ? "Hai già una segnalazione aperta per questo ordine: il negozio la sta gestendo."
          : "La tua segnalazione è stata registrata. Il negozio è stato avvisato e risponderà al più presto."
      );
      setAperto(false);
      setMessaggio("");
      router.refresh();
    } catch {
      setErrore("Errore di rete. Riprova.");
    } finally {
      setInvio(false);
    }
  }

  async function inviaRisposta(reclamoId: string) {
    const corpo = risposta.trim();
    if (!corpo) return;
    setInvioRisposta(true);
    setErrore(null);
    try {
      const res = await fetch(
        `/api/cliente/ordini/${ordineId}/reclami/${reclamoId}/messaggi`,
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
        setErrore(data?.error?.message ?? "Impossibile inviare la risposta.");
        return;
      }
      if (data?.data?.messaggio) {
        const msg = data.data.messaggio;
        setMessaggi((prev) => ({
          ...prev,
          [reclamoId]: [...(prev[reclamoId] ?? []), msg],
        }));
      }
      setConferma("La tua risposta è stata inviata al negozio.");
      setRisposta("");
      router.refresh();
    } catch {
      setErrore("Errore di rete. Riprova.");
    } finally {
      setInvioRisposta(false);
    }
  }

  // Reclamo attivo presente → scheda operativa con dialogo e storico.
  if (attivo) {
    const storico = messaggi[attivo.id] ?? [];
    const puòRispondere = attivo.stato === "aperto" || attivo.stato === "in_gestione";
    return (
      <div className="space-y-4">
        {conferma && (
          <p className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-medium text-blue-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {conferma}
          </p>
        )}
        {errore && (
          <p className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-medium text-blue-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {errore}
          </p>
        )}

        <div className="relative overflow-hidden rounded-[1.75rem] border border-blue-200 bg-white shadow-sm">
          <span
            className="absolute inset-y-0 left-0 w-1.5 bg-linear-to-b from-blue-500 to-blue-700"
            aria-hidden
          />
          <div className="space-y-4 px-5 py-5 pl-6">
            {/* Intestazione reclamo */}
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-black uppercase tracking-wide text-blue-800">
                    {attivo.stato === "in_gestione"
                      ? "Reclamo in gestione"
                      : "Reclamo inviato"}
                  </p>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${COLORI[attivo.stato]}`}
                  >
                    {ETICHETTE[attivo.stato]}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {attivo.messaggio ? (
                    <>“{attivo.messaggio}”</>
                  ) : (
                    "Hai segnalato un problema con questo ordine: il negozio è stato avvisato e sta gestendo la tua segnalazione."
                  )}
                </p>
              </div>
            </div>

            {/* Storico della comunicazione */}
            {storico.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Comunicazioni con il negozio
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
                              : "bg-blue-600 text-white"
                          }`}
                        >
                          {èVenditore ? (
                            <Store className="h-4 w-4" aria-hidden />
                          ) : (
                            <User className="h-4 w-4" aria-hidden />
                          )}
                        </span>
                        <div
                          className={`min-w-0 max-w-[80%] rounded-xl px-3.5 py-2.5 ${
                            èVenditore
                              ? "bg-blue-50 ring-1 ring-blue-100"
                              : "bg-blue-50 ring-1 ring-blue-100"
                          }`}
                        >
                          <p className="flex flex-wrap items-center gap-x-2 text-[11px] font-bold text-slate-700">
                            {èVenditore ? msg.mittenteNome || "Negozio" : "Tu"}
                            <span className="font-medium text-slate-400">
                              {formattaDataBreve(msg.createdAt) || ""}
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

            {/* Risposta al venditore */}
            {puòRispondere && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Rispondi al negozio
                </p>
                <textarea
                  value={risposta}
                  onChange={(e) => setRisposta(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Scrivi qui la tua risposta al negozio…"
                  aria-label="Risposta al negozio"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] text-slate-400">{risposta.length}/2000</p>
                  <button
                    type="button"
                    onClick={() => void inviaRisposta(attivo.id)}
                    disabled={invioRisposta || !risposta.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-2 text-xs font-bold text-blue-800 transition hover:bg-yellow-300 disabled:opacity-50"
                  >
                    {invioRisposta ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Send className="h-4 w-4" aria-hidden />
                    )}
                    {invioRisposta ? "Invio…" : "Invia risposta"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!puòReclamare) return null;

  return (
    <div className="space-y-3">
      {conferma && (
        <p className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-medium text-blue-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {conferma}
        </p>
      )}
      {errore && (
        <p className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-medium text-blue-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {errore}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setErrore(null);
          setConferma(null);
          setAperto(true);
        }}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 active:scale-[0.99] sm:w-auto"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden />
        🚨 Ordine non arrivato — Invia reclamo
      </button>

      {/* ── Dialog controllato (mai alert JS) ───────────────────────────────── */}
      {aperto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setAperto(false)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-bold text-slate-900">Segnala un problema</h2>
              <button
                type="button"
                onClick={() => setAperto(false)}
                className="rounded-lg border border-blue-200 bg-blue-50 p-1 text-blue-600 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
                aria-label="Chiudi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
              <p className="text-xs leading-5 text-slate-500">
                Non hai ricevuto il tuo ordine? Invia una segnalazione al
                negozio: verrà avvisato immediatamente e potrà prendere in
                carico il problema.
              </p>

              <div>
                <label
                  htmlFor="messaggio-reclamo"
                  className="text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Messaggio (facoltativo)
                </label>
                <textarea
                  id="messaggio-reclamo"
                  value={messaggio}
                  onChange={(e) => setMessaggio(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Descrivi il problema, ad esempio la data prevista di consegna…"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
                <p className="mt-1 text-right text-[10px] text-slate-400">
                  {messaggio.length}/1000
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setAperto(false)}
                disabled={invio}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800 disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={inviaReclamo}
                disabled={invio}
                className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-2 text-xs font-bold text-blue-800 transition hover:bg-yellow-300 disabled:opacity-50"
              >
                {invio ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                )}
                {invio ? "Invio…" : "Invia segnalazione"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
