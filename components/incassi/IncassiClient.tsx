"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Wallet, X } from "lucide-react";
import type { RiepilogoIncassi, EconomiaOrdine } from "@/lib/incassi";
import type { RigaIncassoAdmin } from "@/lib/amministratore/incassi";
import type { RigaIncassoVenditore } from "@/lib/merchant/incassi";

type RigaIncasso = RigaIncassoAdmin | RigaIncassoVenditore;

type IncassiResult = {
  riepilogo: RiepilogoIncassi;
  ordini: RigaIncasso[];
  pagina?: number;
  perPagina?: number;
  totaleOrdini?: number;
  pagineTotali?: number;
};

const ETICHETTE_PAGAMENTO: Record<string, string> = {
  pending: "In attesa",
  authorized: "Autorizzato",
  paid: "Pagato",
  failed: "Fallito",
  expired: "Scaduto",
  canceled: "Annullato",
  refunded: "Rimborsato",
  partially_refunded: "Parz. rimborsato",
};

const ETICHETTE_STATO: Record<string, string> = {
  in_preparazione: "Da confermare",
  confermato: "Confermato",
  in_lavorazione: "In lavorazione",
  pronto: "Pronto",
  in_consegna: "In consegna",
  consegnato: "Consegnato",
  cancellato: "Annullato",
};

function formattaEuro(v: number): string {
  return `€${(v || 0).toFixed(2).replace(".", ",")}`;
}

function formattaData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type FiltriLocal = {
  dataDa: string;
  dataA: string;
  pagamento: string;
  provider: string;
  stato: string;
  negozioId: string;
};

const FILTRI_VUOTI: FiltriLocal = {
  dataDa: "",
  dataA: "",
  pagamento: "",
  provider: "",
  stato: "",
  negozioId: "",
};

const STATI_PAGAMENTO = [
  "paid",
  "partially_refunded",
  "refunded",
  "pending",
  "authorized",
  "failed",
  "expired",
  "canceled",
];

const PROVIDER = ["stripe", "paypal", "klarna", "bonifico"];

type Props = {
  /** Endpoint API (server-side, protetto) che restituisce riepilogo + elenco. */
  apiUrl: string;
  /** Path di base per il link al dettaglio ordine. */
  dettaglioBase: string;
  /** Vista admin: aggiunge filtro negozio, colonna negozio e paginazione. */
  admin?: boolean;
  /** Negozi per il filtro admin (caricati dall'API /api/amministratore/negozi). */
  caricaNegozi?: boolean;
  /** Etichetta contesto (es. "Incassi del negozio"). */
  intestazione?: string;
};

function Kpi({ label, valore, colore }: { label: string; valore: string; colore: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/70 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-black tracking-tight ${colore}`}>{valore}</p>
    </div>
  );
}

/**
 * Rendicontazione incassi (V1): riepilogo economico aggregato + elenco
 * ordini con dettaglio (pagato, commissione, rimborsato, netto). TUTTI i
 * valori provengono dal server (API protetta + RLS); nessun calcolo
 * economico lato client. I filtri sono applicati SERVER-SIDE: ogni
 * variazione ricarica la pagina dall'API.
 */
export default function IncassiClient({
  apiUrl,
  dettaglioBase,
  admin = false,
  caricaNegozi = false,
  intestazione = "Rendicontazione incassi",
}: Props) {
  const [filtri, setFiltri] = useState<FiltriLocal>(FILTRI_VUOTI);
  const [pagina, setPagina] = useState(1);
  const [negozi, setNegozi] = useState<Array<{ id: string; nome: string }>>([]);
  const [dati, setDati] = useState<IncassiResult | null>(null);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    if (!caricaNegozi) return;
    fetch("/api/amministratore/negozi")
      .then((r) => r.json())
      .then((d) => {
        setNegozi((d?.data?.stores ?? []) as Array<{ id: string; nome: string }>);
      })
      .catch(() => {});
  }, [caricaNegozi]);

  const carica = useCallback(async () => {
    setCaricando(true);
    setErrore(null);
    try {
      const params = new URLSearchParams();
      if (filtri.dataDa) params.set("data_da", filtri.dataDa);
      if (filtri.dataA) params.set("data_a", filtri.dataA);
      if (filtri.pagamento) params.set("pagamento", filtri.pagamento);
      if (filtri.provider) params.set("provider", filtri.provider);
      if (filtri.stato) params.set("stato", filtri.stato);
      if (filtri.negozioId) params.set("negozio_id", filtri.negozioId);
      if (admin) params.set("pagina", String(pagina));

      const res = await fetch(`${apiUrl}?${params.toString()}`);
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        data?: IncassiResult | null;
      };
      if (!res.ok) {
        setErrore(json?.error?.message ?? "Impossibile caricare gli incassi.");
        setDati(null);
        return;
      }
      setDati(json?.data ?? null);
    } catch {
      setErrore("Errore di rete. Riprova.");
      setDati(null);
    } finally {
      setCaricando(false);
    }
  }, [apiUrl, admin, filtri, pagina]);

  useEffect(() => {
    void carica();
  }, [carica]);

  function setFiltro(chiave: keyof FiltriLocal, valore: string) {
    setFiltri((prev) => ({ ...prev, [chiave]: valore }));
    setPagina(1);
  }

  function azzera() {
    setFiltri(FILTRI_VUOTI);
    setPagina(1);
  }

  const riepilogo = dati?.riepilogo;
  const ordini = dati?.ordini ?? [];
  const pagineTotali = dati?.pagineTotali ?? 0;
  const totaleOrdini = dati?.totaleOrdini ?? ordini.length;

  return (
    <div className="space-y-5">
      {/* Intestazione modulo */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Wallet className="h-7 w-7" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              {intestazione}
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Incassi
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Rendicontazione economica degli ordini: totale pagato,
              commissioni piattaforma, rimborsi e netto venditore. Tutti gli
              importi sono calcolati dal sistema sugli snapshot dell&apos;ordine.
            </p>
            {riepilogo && (
              <p className="mt-4 text-sm font-semibold text-slate-500">
                {totaleOrdini} {totaleOrdini === 1 ? "ordine" : "ordini"} nel periodo selezionato
              </p>
            )}
          </div>
        </div>
      </div>

      {/* KPI economici */}
      {riepilogo && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Totale pagato (GMV)" valore={formattaEuro(riepilogo.gmv)} colore="text-slate-900" />
          <Kpi label="Commissioni piattaforma" valore={formattaEuro(riepilogo.commissioni)} colore="text-blue-700" />
          <Kpi label="Rimborsi" valore={formattaEuro(riepilogo.rimborsi)} colore="text-red-600" />
          <Kpi label="Netto venditori" valore={formattaEuro(riepilogo.nettoVenditori)} colore="text-emerald-700" />
          <Kpi label="Incassato (dopo rimborsi)" valore={formattaEuro(riepilogo.incassato)} colore="text-slate-900" />
          <Kpi label="Ordini pagati" valore={String(riepilogo.ordiniPagati)} colore="text-slate-700" />
          <Kpi label="Ordini rimborsati" valore={String(riepilogo.ordiniRimborsati)} colore="text-slate-700" />
          <Kpi label="Rimborsati al 100%" valore={String(riepilogo.ordiniRimborsatiTotali)} colore="text-slate-700" />
        </div>
      )}

      {/* Barra filtri */}
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
            value={filtri.pagamento}
            onChange={(e) => setFiltro("pagamento", e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Pagamento: tutti</option>
            {STATI_PAGAMENTO.map((s) => (
              <option key={s} value={s}>{ETICHETTE_PAGAMENTO[s] ?? s}</option>
            ))}
          </select>

          <select
            value={filtri.provider}
            onChange={(e) => setFiltro("provider", e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Provider: tutti</option>
            {PROVIDER.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <select
            value={filtri.stato}
            onChange={(e) => setFiltro("stato", e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Stato ordine: tutti</option>
            {Object.entries(ETICHETTE_STATO).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          {admin && (
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
          )}

          <button
            type="button"
            onClick={azzera}
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
          <p className="text-sm text-slate-500">Caricamento incassi…</p>
        </div>
      )}

      {!errore && !caricando && ordini.length === 0 && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-700">Nessun incasso trovato</p>
          <p className="mt-1 text-xs text-slate-500">
            Modifica i filtri oppure attendi nuovi ordini pagati.
          </p>
        </div>
      )}

      {ordini.length > 0 && (
        <div className="space-y-3">
          {ordini.map((o: RigaIncasso) => (
            <RigaCard key={o.id} ordine={o} dettaglioBase={dettaglioBase} admin={admin} />
          ))}
        </div>
      )}

      {/* Paginazione (admin) */}
      {admin && pagineTotali > 1 && (
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

function RigaCard({
  ordine,
  dettaglioBase,
  admin,
}: {
  ordine: RigaIncasso;
  dettaglioBase: string;
  admin: boolean;
}) {
  const e: EconomiaOrdine = ordine.economia;
  const negozioNome = "negozioNome" in ordine ? ordine.negozioNome : null;
  return (
    <Link
      href={`${dettaglioBase}/${ordine.id}`}
      className="block rounded-[1.5rem] border border-white/70 bg-white p-4 shadow-sm transition hover:shadow-md"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-slate-900">{ordine.numero}</span>
            {ordine.paymentStatus && <BadgePagamento stato={ordine.paymentStatus} />}
            <span className="text-xs text-slate-400">
              {formattaData(ordine.paymentPaidAt ?? ordine.createdAt)}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            <span className="font-semibold text-slate-800">
              {ordine.clienteNome} {ordine.clienteCognome}
            </span>
            {negozioNome && (
              <>
                {" · "}
                <span>{negozioNome}</span>
              </>
            )}
          </p>
          {admin && ordine.paymentProvider && (
            <p className="mt-0.5 text-[11px] text-slate-400">Provider: {ordine.paymentProvider}</p>
          )}
        </div>
        <div className="grid shrink-0 grid-cols-3 gap-3 text-right md:grid-cols-4">
          <Cella label="Pagato" valore={formattaEuro(e.importoPagato)} />
          <Cella label="Commissione" valore={formattaEuro(e.commissioneEffettiva)} colore="text-blue-700" />
          <Cella label="Rimborsato" valore={formattaEuro(e.importoRimborsato)} colore={e.importoRimborsato > 0 ? "text-red-600" : undefined} />
          <Cella label="Netto venditore" valore={formattaEuro(e.nettoVenditoreEffettivo)} colore="text-emerald-700" />
        </div>
      </div>
    </Link>
  );
}

function Cella({ label, valore, colore }: { label: string; valore: string; colore?: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-sm font-black text-slate-900 ${colore ?? ""}`}>{valore}</p>
    </div>
  );
}

function BadgePagamento({ stato }: { stato: string }) {
  const classe =
    stato === "paid"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      : stato === "refunded" || stato === "partially_refunded"
        ? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
        : stato === "failed" || stato === "expired"
          ? "bg-red-50 text-red-700 ring-1 ring-red-200"
          : "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${classe}`}>
      {ETICHETTE_PAGAMENTO[stato] ?? stato}
    </span>
  );
}
