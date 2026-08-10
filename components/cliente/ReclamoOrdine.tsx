"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import type { ReclamoOrdine as ReclamoOrdineType, StatoReclamo } from "@/lib/ordine-reclami-stati";

type Props = {
  ordineId: string;
  /** Il pulsante compare SOLO quando ha senso (ordine non annullato). */
  puòReclamare: boolean;
  /** Reclami già presenti (letto server-side). */
  reclamiIniziali: ReclamoOrdineType[];
};

const ETICHETTE: Record<StatoReclamo, string> = {
  aperto: "Aperto",
  in_gestione: "In gestione",
  risolto: "Risolto",
  chiuso: "Chiuso",
};

const COLORI: Record<StatoReclamo, string> = {
  aperto: "bg-red-50 text-red-700 ring-1 ring-red-200",
  in_gestione: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  risolto: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  chiuso: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

/**
 * Pulsante + dialog "Ordine non arrivato" (Area Clienti).
 * - Il pulsante NON compare per ordini annullati (deciso dal parent).
 * - Se esiste già un reclamo ATTIVO (aperto/in gestione) il pulsante viene
 *   sostituito da un riquadro informativo con lo stato: mai un secondo
 *   reclamo duplicato.
 * - Al click NON si invia nulla: si apre un dialog CONTROLLATO con messaggio
 *   opzionale. Dopo l'invio: conferma visibile + stato aggiornato.
 */
export default function ReclamoOrdine({ ordineId, puòReclamare, reclamiIniziali }: Props) {
  const router = useRouter();
  const [reclami, setReclami] = useState<ReclamoOrdineType[]>(reclamiIniziali);
  const [aperto, setAperto] = useState(false);
  const [messaggio, setMessaggio] = useState("");
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [conferma, setConferma] = useState<string | null>(null);

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

  // Reclamo attivo presente → riquadro informativo (niente pulsante duplicato).
  if (attivo) {
    return (
      <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 ring-1 ring-amber-200">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black uppercase tracking-wide text-amber-900">
                Reclamo inviato
              </p>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${COLORI[attivo.stato]}`}
              >
                {ETICHETTE[attivo.stato]}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-amber-700">
              {attivo.messaggio ? (
                <>“{attivo.messaggio}”</>
              ) : (
                "Hai segnalato un problema con questo ordine. Il negozio è stato avvisato."
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!puòReclamare) return null;

  return (
    <div className="space-y-3">
      {conferma && (
        <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {conferma}
        </p>
      )}
      {errore && (
        <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700">
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
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-bold text-red-700 transition hover:border-red-300 hover:bg-red-100 active:scale-[0.99] sm:w-auto"
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
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
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
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
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
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={inviaReclamo}
                disabled={invio}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
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
