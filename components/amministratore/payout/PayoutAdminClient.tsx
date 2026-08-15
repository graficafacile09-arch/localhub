"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Coins, X } from "lucide-react";
import type { PayoutAdminRiga, RiepilogoPayoutAdmin } from "@/lib/amministratore/payout";

const ETICHETTE_STATO: Record<string, string> = {
  calcolato: "Calcolato",
  in_erogazione: "In erogazione",
  pagato: "Pagato",
  fallito: "Fallito",
  annullato: "Annullato",
};

const STATI = ["calcolato", "in_erogazione", "pagato", "fallito", "annullato"];

function formattaEuro(v: number): string {
  return `€${(v || 0).toFixed(2).replace(".", ",")}`;
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

export default function PayoutAdminClient() {
  const [filtri, setFiltri] = useState<{ stato: string; negozioId: string; dataDa: string; dataA: string }>({
    stato: "",
    negozioId: "",
    dataDa: "",
    dataA: "",
  });
  const [pagina, setPagina] = useState(1);
  const [negozi, setNegozi] = useState<Array<{ id: string; nome: string }>>([]);
  const [dati, setDati] = useState<{
    riepilogo: RiepilogoPayoutAdmin | null;
    payout: PayoutAdminRiga[];
    totale: number;
    pagineTotali: number;
  } | null>(null);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/amministratore/negozi")
      .then((r) => r.json())
      .then((d) => {
        setNegozi((d?.data?.stores ?? []) as Array<{ id: string; nome: string }>);
      })
      .catch(() => {});
  }, []);

  const carica = useCallback(async () => {
    setCaricando(true);
    setErrore(null);
    try {
      const params = new URLSearchParams();
      if (filtri.stato) params.set("stato", filtri.stato);
      if (filtri.negozioId) params.set("negozio_id", filtri.negozioId);
      if (filtri.dataDa) params.set("data_da", filtri.dataDa);
      if (filtri.dataA) params.set("data_a", filtri.dataA);
      params.set("pagina", String(pagina));

      const res = await fetch(`/api/amministratore/payout?${params.toString()}`);
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        data?: {
          riepilogo?: RiepilogoPayoutAdmin;
          payout?: PayoutAdminRiga[];
          totale?: number;
          pagineTotali?: number;
        } | null;
      };
      if (!res.ok) {
        setErrore(json?.error?.message ?? "Impossibile caricare i payout.");
        setDati(null);
        return;
      }
      setDati({
        riepilogo: json?.data?.riepilogo ?? null,
        payout: json?.data?.payout ?? [],
        totale: json?.data?.totale ?? 0,
        pagineTotali: json?.data?.pagineTotali ?? 0,
      });
    } catch {
      setErrore("Errore di rete. Riprova.");
      setDati(null);
    } finally {
      setCaricando(false);
    }
  }, [filtri, pagina]);

  useEffect(() => {
    void carica();
  }, [carica]);

  function setFiltro(chiave: "stato" | "negozioId" | "dataDa" | "dataA", valore: string) {
    setFiltri((prev) => ({ ...prev, [chiave]: valore }));
    setPagina(1);
  }

  const riepilogo = dati?.riepilogo;
  const payout = dati?.payout ?? [];
  const pagineTotali = dati?.pagineTotali ?? 0;

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
              Pannello Amministratore
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Payout
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Supervisione globale dei payout interni di tutti i negozi:
              calcolo per periodo, stato di erogazione e storico. V1 di
              tracciamento: nessun pagamento reale viene creato da questo
              pannello.
            </p>
          </div>
        </div>
      </div>

      {/* KPI */}
      {riepilogo && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Da erogare (calcolati)" valore={formattaEuro(riepilogo.daErogare)} colore="text-amber-700" />
          <Kpi label="In erogazione" valore={formattaEuro(riepilogo.inErogazione)} colore="text-blue-700" />
          <Kpi label="Pagati" valore={formattaEuro(riepilogo.pagato)} colore="text-emerald-700" />
          <Kpi label="Falliti" valore={formattaEuro(riepilogo.importoFalliti)} colore="text-red-600" />
        </div>
      )}

      {/* Filtri */}
      <div className="rounded-[1.75rem] border border-white/70 bg-white p-4 shadow-sm md:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filtri.dataDa}
              onChange={(e) => setFiltro("dataDa", e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              aria-label="Data da"
            />
            <span className="text-slate-400">→</span>
            <input
              type="date"
              value={filtri.dataA}
              onChange={(e) => setFiltro("dataA", e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              aria-label="Data a"
            />
          </div>

          <select
            value={filtri.stato}
            onChange={(e) => setFiltro("stato", e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Stato: tutti</option>
            {STATI.map((s) => (
              <option key={s} value={s}>{ETICHETTE_STATO[s] ?? s}</option>
            ))}
          </select>

          <select
            value={filtri.negozioId}
            onChange={(e) => setFiltro("negozioId", e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Negozio: tutti</option>
            {negozi.map((n) => (
              <option key={n.id} value={n.id}>{n.nome}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setFiltri({ stato: "", negozioId: "", dataDa: "", dataA: "" });
              setPagina(1);
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
          >
            <X className="h-4 w-4" aria-hidden />
            Azzera filtri
          </button>
        </div>
      </div>

      {/* Stati */}
      {errore && (
        <div className="rounded-[1.75rem] border border-blue-100 bg-blue-50 p-6 text-center">
          <p className="text-sm font-semibold text-blue-700">{errore}</p>
        </div>
      )}

      {!errore && caricando && !dati && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">Caricamento payout…</p>
        </div>
      )}

      {!errore && !caricando && payout.length === 0 && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-700">Nessun payout trovato</p>
          <p className="mt-1 text-xs text-slate-500">
            I payout compaiono quando un venditore calcola un periodo.
          </p>
        </div>
      )}

      {/* Elenco */}
      {payout.length > 0 && (
        <div className="space-y-3">
          {payout.map((p) => (
            <Link
              key={p.id}
              href={`/amministratore/payout/${p.id}`}
              className="block rounded-[1.5rem] border border-white/70 bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <BadgeStato stato={p.stato} />
                    <span className="text-sm font-bold text-slate-900">{p.negozioNome}</span>
                    <span className="text-xs font-semibold text-slate-500">
                      {formattaData(p.periodoDa)} → {formattaData(p.periodoA)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {p.nOrdini} {p.nOrdini === 1 ? "ordine" : "ordini"} · creato il {formattaData(p.creatoAt)}
                  </p>
                  {p.errore && <p className="mt-1 text-[11px] text-red-600">{p.errore}</p>}
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
            </Link>
          ))}
        </div>
      )}

      {/* Paginazione */}
      {pagineTotali > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina <= 1 || caricando}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700 disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Precedente
          </button>
          <span className="text-sm font-semibold text-slate-600">
            Pagina {pagina} di {pagineTotali}
          </span>
          <button
            type="button"
            onClick={() => setPagina((p) => Math.min(pagineTotali, p + 1))}
            disabled={pagina >= pagineTotali || caricando}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700 disabled:opacity-40"
          >
            Successiva <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
