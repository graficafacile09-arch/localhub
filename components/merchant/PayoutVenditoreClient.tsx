"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Coins, Loader2, Wallet } from "lucide-react";
import type {
  PayoutRiga,
  RiepilogoPayoutVenditore,
} from "@/lib/merchant/payout";

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

function Kpi({ label, valore, colore }: { label: string; valore: string; colore: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/70 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-black tracking-tight ${colore}`}>{valore}</p>
    </div>
  );
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

export default function PayoutVenditoreClient({ apiUrl }: { apiUrl: string }) {
  const [riepilogo, setRiepilogo] = useState<RiepilogoPayoutVenditore | null>(null);
  const [payout, setPayout] = useState<PayoutRiga[]>([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const [periodoDa, setPeriodoDa] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [periodoA, setPeriodoA] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-12-31`;
  });
  const [calcolando, setCalcolando] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [erroreCalcolo, setErroreCalcolo] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setCaricando(true);
    setErrore(null);
    try {
      const res = await fetch(apiUrl);
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        data?: { payout?: PayoutRiga[]; riepilogo?: RiepilogoPayoutVenditore } | null;
      };
      if (!res.ok) {
        setErrore(json?.error?.message ?? "Impossibile caricare i payout.");
        return;
      }
      setPayout(json?.data?.payout ?? []);
      setRiepilogo(json?.data?.riepilogo ?? null);
    } catch {
      setErrore("Errore di rete. Riprova.");
    } finally {
      setCaricando(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function calcolaPayout() {
    setCalcolando(true);
    setMessaggio(null);
    setErroreCalcolo(null);
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodoDa, periodoA }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        data?: { payout?: PayoutRiga; giaEsistente?: boolean } | null;
      };
      if (!res.ok) {
        setErroreCalcolo(json?.error?.message ?? "Impossibile calcolare il payout.");
        return;
      }
      setMessaggio(
        json?.data?.giaEsistente
          ? "Payout già esistente per questo periodo (nessun doppio calcolo)."
          : "Payout calcolato correttamente."
      );
      await carica();
    } catch {
      setErroreCalcolo("Errore di rete. Riprova.");
    } finally {
      setCalcolando(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Intestazione */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Coins className="h-7 w-7" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Area venditore
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Payout
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Calcolo e tracciamento del netto da erogare per periodo. Gli
              importi sono calcolati dal sistema sugli ordini pagati (dopo
              commissioni e rimborsi) — mai dal browser. In questa V1 non
              viene creato alcun bonifico o pagamento reale: l&apos;erogazione
              resta gestita fuori piattaforma.
            </p>
          </div>
        </div>
      </div>

      {/* KPI */}
      {riepilogo && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Saldo disponibile" valore={formattaEuro(riepilogo.saldoDisponibile)} colore="text-emerald-700" />
          <Kpi label="Totale già erogato" valore={formattaEuro(riepilogo.totaleErogato)} colore="text-slate-900" />
          <Kpi label="Payout in corso" valore={String(riepilogo.payoutInCorso)} colore="text-slate-700" />
          <Kpi
            label="Ultimo payout"
            valore={
              riepilogo.ultimoPayout
                ? formattaEuro(riepilogo.ultimoPayout.importoNetto)
                : "—"
            }
            colore="text-blue-700"
          />
        </div>
      )}

      {/* Calcolo periodo */}
      <div className="rounded-[1.75rem] border border-white/70 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="periodo-da" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Periodo da
              </label>
              <input
                id="periodo-da"
                type="date"
                value={periodoDa}
                onChange={(e) => setPeriodoDa(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="periodo-a" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Periodo a
              </label>
              <input
                id="periodo-a"
                type="date"
                value={periodoA}
                onChange={(e) => setPeriodoA(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <button
              type="button"
              onClick={() => void calcolaPayout()}
              disabled={calcolando}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {calcolando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarRange className="h-4 w-4" aria-hidden />}
              Calcola payout periodo
            </button>
          </div>
          <p className="max-w-xs text-[11px] leading-4 text-slate-400">
            Il calcolo include gli ordini pagati nel periodo non ancora
            coperti da un payout. Nessun importo viene inviato dal browser.
          </p>
        </div>
        {messaggio && (
          <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            {messaggio}
          </p>
        )}
        {erroreCalcolo && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {erroreCalcolo}
          </p>
        )}
      </div>

      {/* Stati */}
      {errore && (
        <div className="rounded-[1.75rem] border border-blue-100 bg-blue-50 p-6 text-center">
          <p className="text-sm font-semibold text-blue-700">{errore}</p>
        </div>
      )}

      {!errore && caricando && !riepilogo && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">Caricamento payout…</p>
        </div>
      )}

      {!errore && !caricando && payout.length === 0 && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-10 text-center shadow-sm">
          <Wallet className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-slate-700">Nessun payout calcolato</p>
          <p className="mt-1 text-xs text-slate-500">
            Seleziona un periodo e premi &quot;Calcola payout periodo&quot;.
          </p>
        </div>
      )}

      {/* Storico */}
      {payout.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Storico payout
          </h2>
          {payout.map((p) => (
            <div
              key={p.id}
              className="rounded-[1.5rem] border border-white/70 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <BadgeStato stato={p.stato} />
                    <span className="text-xs font-semibold text-slate-500">
                      {formattaData(p.periodoDa)} → {formattaData(p.periodoA)}
                    </span>
                    <span className="text-xs text-slate-400">
                      {p.nOrdini} {p.nOrdini === 1 ? "ordine" : "ordini"}
                    </span>
                  </div>
                  {p.stripePayoutId && (
                    <p className="mt-1 font-mono text-[11px] text-slate-400">
                      {p.stripePayoutId}
                    </p>
                  )}
                  {p.errore && (
                    <p className="mt-1 text-[11px] text-red-600">{p.errore}</p>
                  )}
                </div>
                <div className="grid shrink-0 grid-cols-3 gap-3 text-right">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Lordo</p>
                    <p className="text-sm font-black text-slate-900">{formattaEuro(p.importoLordo)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Commissione</p>
                    <p className="text-sm font-black text-blue-700">{formattaEuro(p.commissioneImporto)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Netto</p>
                    <p className="text-sm font-black text-emerald-700">{formattaEuro(p.importoNetto)}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
