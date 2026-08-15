"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, Send, XCircle } from "lucide-react";

type PayoutDetail = {
  id: string;
  negozioId: string;
  negozioNome: string;
  periodoDa: string;
  periodoA: string;
  importoLordo: number;
  commissioneImporto: number;
  importoNetto: number;
  nOrdini: number;
  stato: string;
  stripePayoutId: string | null;
  stripePayoutStatus: string | null;
  errore: string | null;
  creatoAt: string;
  erogatoAt: string | null;
  ordini: Array<{
    id: string;
    numero: string;
    totale: number;
    payment_amount?: number | null;
    payment_refunded_amount?: number | null;
    payment_status?: string | null;
    payment_paid_at?: string | null;
    commissione_importo?: number | null;
  }>;
};

const ETICHETTE_STATO: Record<string, string> = {
  calcolato: "Calcolato",
  in_erogazione: "In erogazione",
  pagato: "Pagato",
  fallito: "Fallito",
  annullato: "Annullato",
};

function formattaEuro(v: number | null | undefined): string {
  return `€${(v ?? 0).toFixed(2).replace(".", ",")}`;
}

function formattaData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function BadgeStato({ stato }: { stato: string }) {
  const classe =
    stato === "pagato"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      : stato === "fallito"
        ? "bg-red-50 text-red-700 ring-1 ring-red-200"
        : stato === "annullato"
          ? "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
          : stato === "in_erogazione"
            ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
            : "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${classe}`}>
      {ETICHETTE_STATO[stato] ?? stato}
    </span>
  );
}

export default function PayoutAdminDetailClient({ payoutId }: { payoutId: string }) {
  const [dettaglio, setDettaglio] = useState<PayoutDetail | null>(null);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [azione, setAzione] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [erroreAzione, setErroreAzione] = useState<string | null>(null);
  const [conferma, setConferma] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setCaricando(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/amministratore/payout/${payoutId}`);
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        data?: PayoutDetail | null;
      };
      if (!res.ok) {
        setErrore(json?.error?.message ?? "Impossibile caricare il payout.");
        return;
      }
      setDettaglio(json?.data ?? null);
    } catch {
      setErrore("Errore di rete. Riprova.");
    } finally {
      setCaricando(false);
    }
  }, [payoutId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function eseguiAzione(nome: string, extra: Record<string, unknown> = {}) {
    setAzione(nome);
    setMessaggio(null);
    setErroreAzione(null);
    try {
      const res = await fetch(`/api/amministratore/payout/${payoutId}/${nome}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extra),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        data?: { cambiato?: boolean; stato?: string } | null;
      };
      if (!res.ok) {
        setErroreAzione(json?.error?.message ?? "Impossibile eseguire l'azione.");
        return;
      }
      setMessaggio(`Azione completata: stato ${json?.data?.stato ?? nome}.`);
      setConferma(null);
      await carica();
    } catch {
      setErroreAzione("Errore di rete. Riprova.");
    } finally {
      setAzione(null);
    }
  }

  if (caricando && !dettaglio) {
    return (
      <div className="rounded-[1.75rem] border border-white/70 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-slate-500">Caricamento payout…</p>
      </div>
    );
  }

  if (errore || !dettaglio) {
    return (
      <div className="rounded-[1.75rem] border border-blue-100 bg-blue-50 p-6 text-center">
        <p className="text-sm font-semibold text-blue-700">{errore ?? "Payout non trovato."}</p>
        <Link href="/amministratore/payout" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Torna all&apos;elenco
        </Link>
      </div>
    );
  }

  const d = dettaglio;
  const statoPagato = d.stato === "pagato";
  const statoAnnullato = d.stato === "annullato";
  const azioniDisponibili = !statoPagato && !statoAnnullato;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/amministratore/payout" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Payout
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
                Payout {d.negozioNome}
              </h1>
              <BadgeStato stato={d.stato} />
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {formattaData(d.periodoDa)} → {formattaData(d.periodoA)} · {d.nOrdini}{" "}
              {d.nOrdini === 1 ? "ordine" : "ordini"} · creato il {formattaData(d.creatoAt)}
            </p>
            {d.stripePayoutId && (
              <p className="mt-1 font-mono text-[11px] text-slate-400">Stripe: {d.stripePayoutId}</p>
            )}
            {d.errore && <p className="mt-1 text-xs text-red-600">{d.errore}</p>}
          </div>
          <div className="grid grid-cols-3 gap-3 text-right">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Lordo</p>
              <p className="text-lg font-black text-slate-900">{formattaEuro(d.importoLordo)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Commissione</p>
              <p className="text-lg font-black text-blue-700">{formattaEuro(d.commissioneImporto)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Netto</p>
              <p className="text-lg font-black text-emerald-700">{formattaEuro(d.importoNetto)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Azioni di stato */}
      <div className="rounded-[1.75rem] border border-white/70 bg-white p-4 shadow-sm md:p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Operatività</h2>
        {!azioniDisponibili ? (
          <p className="mt-2 text-sm text-slate-500">
            {statoPagato
              ? "Payout già pagato: stato terminale, nessuna azione disponibile."
              : "Payout annullato: stato terminale, nessuna azione disponibile."}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {d.stato === "calcolato" && (
              <button
                type="button"
                disabled={azione !== null}
                onClick={() => eseguiAzione("eroga", { azione: "in_erogazione" })}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {azione === "in_erogazione" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                Segna in erogazione
              </button>
            )}
            {(d.stato === "calcolato" || d.stato === "in_erogazione") && (
              <button
                type="button"
                disabled={azione !== null}
                onClick={() => setConferma("pagato")}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Segna pagato
              </button>
            )}
            {d.stato === "calcolato" && (
              <button
                type="button"
                disabled={azione !== null}
                onClick={() => setConferma("annulla")}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
              >
                <XCircle className="h-4 w-4" aria-hidden />
                Annulla payout
              </button>
            )}
          </div>
        )}

        {/* Conferma modale per azioni irreversibili */}
        {conferma && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-800">
              {conferma === "pagato"
                ? `Confermi di segnare il payout come PAGATO (${formattaEuro(d.importoNetto)})?`
                : "Confermi di ANNULLARE il payout? Gli ordini inclusi torneranno disponibili per un nuovo calcolo."}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={azione !== null}
                onClick={() =>
                  conferma === "pagato"
                    ? eseguiAzione("eroga", { azione: "pagato" })
                    : eseguiAzione("annulla")
                }
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {azione ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Conferma
              </button>
              <button
                type="button"
                disabled={azione !== null}
                onClick={() => setConferma(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300"
              >
                Annulla
              </button>
            </div>
          </div>
        )}

        {messaggio && (
          <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{messaggio}</p>
        )}
        {erroreAzione && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{erroreAzione}</p>
        )}
      </div>

      {/* Ordini inclusi */}
      <div className="rounded-[1.75rem] border border-white/70 bg-white p-4 shadow-sm md:p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          Ordini inclusi ({d.ordini.length})
        </h2>
        {d.ordini.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nessun ordine associato.</p>
        ) : (
          <div className="mt-3 divide-y divide-slate-100">
            {d.ordini.map((o) => (
              <div key={o.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link
                    href={`/amministratore/ordini/${o.id}`}
                    className="font-mono text-sm font-bold text-slate-900 hover:text-blue-700 hover:underline"
                  >
                    {o.numero}
                  </Link>
                  <p className="text-xs text-slate-400">
                    {formattaData(o.payment_paid_at ?? null)} · {o.payment_status ?? "—"}
                  </p>
                </div>
                <div className="grid shrink-0 grid-cols-3 gap-3 text-right">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Totale</p>
                    <p className="text-sm font-black text-slate-900">{formattaEuro(o.totale)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Commissione</p>
                    <p className="text-sm font-black text-blue-700">{formattaEuro(o.commissione_importo)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Pagato</p>
                    <p className="text-sm font-black text-emerald-700">{formattaEuro(o.payment_amount)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
