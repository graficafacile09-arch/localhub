"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, FileCheck2, Loader2, PackageCheck } from "lucide-react";

type Riga = {
  id: string;
  nome_prodotto: string;
  prezzo_unitario: number;
  quantita_richiesta: number;
};

type Richiesta = {
  id: string;
  numero: string;
  stato: string;
  cliente_nome: string;
  cliente_cognome: string;
  cliente_email: string | null;
  cliente_telefono: string | null;
  ricevuta_at: string;
  richiesta_at: string;
  termine_recesso_at: string | null;
  motivo_cliente: string | null;
  note_cliente: string | null;
  rifiuto_nota: string | null;
  importo_previsto: number | null;
  importo_rimborsato: number | null;
};

type ApiData = {
  richiesta: Richiesta | null;
  righe: Riga[];
  ordine: {
    numero: string;
    totale: number;
    payment_status: string | null;
    payment_amount: number | null;
    payment_refunded_amount: number | null;
    payment_provider: string | null;
  } | null;
  residuoRimborsabile: number;
};

function data(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("it-IT");
}

function euro(value: number | null | undefined) {
  return Number(value ?? 0).toFixed(2).replace(".", ",");
}

function statoLabel(stato: string) {
  const map: Record<string, string> = {
    richiesta: "Richiesta ricevuta",
    presa_in_carico: "Presa in carico",
    istruzioni_reso: "Istruzioni reso",
    reso_ricevuto: "Reso ricevuto",
    rimborso_in_elaborazione: "Rimborso in elaborazione",
    rimborsata: "Rimborsata",
    rifiutata: "Rifiutata",
    chiusa: "Chiusa",
  };
  return map[stato] ?? stato;
}

export default function RecessoOrdineMerchant({
  negozioId,
  ordineId,
}: {
  negozioId: string;
  ordineId: string;
}) {
  const [state, setState] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [refundAmount, setRefundAmount] = useState("");

  async function load() {
    try {
      const response = await fetch(
        "/api/merchant/stores/" + encodeURIComponent(negozioId) +
        "/ordini/" + encodeURIComponent(ordineId) + "/recesso",
        { cache: "no-store" }
      );
      const json = (await response.json().catch(() => null)) as {
        data?: ApiData;
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        setError(json?.error?.message ?? "Impossibile caricare la pratica.");
        return;
      }
      setState(json?.data ?? null);
      const suggested = json?.data?.richiesta?.importo_previsto;
      if (suggested != null) setRefundAmount(euro(suggested));
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [negozioId, ordineId]);

  async function action(name: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (name === "rimborso") headers["Idempotency-Key"] = crypto.randomUUID();

      const response = await fetch(
        "/api/merchant/stores/" + encodeURIComponent(negozioId) +
        "/ordini/" + encodeURIComponent(ordineId) + "/recesso",
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ azione: name, ...extra }),
        }
      );
      const json = (await response.json().catch(() => null)) as {
        data?: Record<string, unknown>;
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        setError(json?.error?.message ?? "Operazione non completata.");
        return;
      }
      await load();
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !state?.richiesta) return null;

  const r = state.richiesta;
  const canTake = r.stato === "richiesta";
  const canInstructions = r.stato === "richiesta" || r.stato === "presa_in_carico";
  const canReceiveReturn = r.stato === "istruzioni_reso";
  const canRefund = r.stato === "reso_ricevuto";
  const amount = Number(refundAmount.replace(",", "."));

  return (
    <section className="rounded-[1.75rem] border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <FileCheck2 className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Diritto di recesso</p>
          <h2 className="mt-1 text-base font-black text-slate-900">
            {r.numero} · {statoLabel(r.stato)}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Cliente: <strong>{r.cliente_nome} {r.cliente_cognome}</strong>
          </p>
          <p className="text-xs text-slate-500">
            Ricevuta il {data(r.ricevuta_at)}
            {r.termine_recesso_at ? " · termine ordinario " + data(r.termine_recesso_at) : " · richiesta precedente alla consegna"}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {state.righe.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{item.nome_prodotto}</p>
              <p className="text-xs text-slate-500">Quantità {item.quantita_richiesta} · € {euro(item.prezzo_unitario)}</p>
            </div>
            <PackageCheck className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />
          </div>
        ))}
      </div>

      {(r.motivo_cliente || r.note_cliente) ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {r.motivo_cliente ? <p><strong>Motivo cliente:</strong> {r.motivo_cliente}</p> : null}
          {r.note_cliente ? <p className={r.motivo_cliente ? "mt-2" : ""}><strong>Nota cliente:</strong> {r.note_cliente}</p> : null}
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 flex gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {canTake ? (
          <button type="button" disabled={busy} onClick={() => void action("presa_in_carico")} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            Prendi in carico
          </button>
        ) : null}

        {canInstructions ? (
          <button
            type="button"
            disabled={busy || !message.trim()}
            onClick={() => void action("istruzioni_reso", { messaggio: message.trim() })}
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700 disabled:opacity-50"
          >
            Invia istruzioni reso
          </button>
        ) : null}

        {canReceiveReturn ? (
          <button type="button" disabled={busy} onClick={() => void action("reso_ricevuto")} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            Segna reso ricevuto
          </button>
        ) : null}

        {canRefund ? (
          <button
            type="button"
            disabled={busy || !Number.isFinite(amount) || amount <= 0}
            onClick={() => void action("rimborso", { importo: amount })}
            className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-xs font-bold text-blue-800 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Avvia rimborso
          </button>
        ) : null}
      </div>

      {canInstructions ? (
        <div className="mt-3">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor={"recesso-messaggio-" + ordineId}>
            Istruzioni per il reso
          </label>
          <textarea
            id={"recesso-messaggio-" + ordineId}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Indica al cliente come e dove effettuare il reso."
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      ) : null}

      {canRefund ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor={"recesso-importo-" + ordineId}>
              Importo da rimborsare
            </label>
            <input
              id={"recesso-importo-" + ordineId}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              inputMode="decimal"
              className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <p className="text-xs leading-5 text-slate-500 sm:max-w-xs">
            Residuo pagamento: € {euro(state.residuoRimborsabile)}. Verifica l'importo dovuto prima del rimborso.
          </p>
        </div>
      ) : null}

      {r.stato === "rimborsata" ? (
        <p className="mt-3 flex gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-xs text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Rimborso registrato: € {euro(r.importo_rimborsato)}.
        </p>
      ) : null}
    </section>
  );
}
