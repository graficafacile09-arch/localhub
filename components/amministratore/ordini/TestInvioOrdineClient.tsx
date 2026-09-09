"use client";

import { useState } from "react";
import { Loader2, Send, ShieldCheck, PackageX, Wallet } from "lucide-react";

type CanaleReport = {
  canale: string;
  eseguito: boolean;
  stato: string;
  dettaglio: string;
};

type ReportTest = {
  ok: boolean;
  idTest: string;
  numeroTest: string;
  ordineCreato: false;
  stockModificato: false;
  pagamentoCreato: false;
  canali: CanaleReport[];
  eseguiti: number;
  saltatiONonEseguiti: number;
  errori: number;
};

/**
 * Test invio ordine — Area Amministratore (client).
 *
 * Invoca GET /api/amministratore/test-invio-ordine con i destinatari
 * opzionali (email/telefono, whitelist esplicite) e mostra il report
 * per canale: cosa è stato eseguito, cosa è stato saltato e perché.
 */
export default function TestInvioOrdineClient() {
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [inviando, setInviando] = useState(false);
  const [report, setReport] = useState<ReportTest | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const esegui = async () => {
    setInviando(true);
    setErrore(null);
    setReport(null);
    try {
      const params = new URLSearchParams();
      if (email.trim()) params.set("email", email.trim());
      if (telefono.trim()) params.set("telefono", telefono.trim());
      const res = await fetch(`/api/amministratore/test-invio-ordine?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: ReportTest;
        error?: { code?: string; message?: string };
      };
      if (!res.ok || !json.success || !json.data) {
        setErrore(json.error?.message ?? "Test non riuscito.");
        return;
      }
      setReport(json.data);
    } catch {
      setErrore("Errore di rete durante il test.");
    } finally {
      setInviando(false);
    }
  };

  const labelCanale: Record<string, string> = {
    email: "Email (Resend)",
    whatsapp: "WhatsApp (negoziante)",
    ntfy: "ntfy",
    notifica_admin: "Notifica admin",
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-900">Test invio ordine</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Verifica end-to-end delle notifiche di un ordine (email, WhatsApp, ntfy, notifica
          admin) <strong>senza creare ordini reali</strong>, <strong>senza modificare lo stock</strong>{" "}
          e <strong>senza generare pagamenti</strong>. Il flusso payment-first del cliente resta
          intatto: è uno strumento di diagnostica separato.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="email-test" className="block text-xs font-semibold text-slate-700">
              Email destinataria (whitelist TEST_EMAIL_ADDRESSES)
            </label>
            <input
              id="email-test"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="destinatario@esempio.it"
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-100"
            />
          </div>
          <div>
            <label htmlFor="telefono-test" className="block text-xs font-semibold text-slate-700">
              Telefono WhatsApp (whitelist TEST_WHATSAPP_NUMBERS)
            </label>
            <input
              id="telefono-test"
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="3935..."
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-100"
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-slate-400">
          I campi sono opzionali: i canali senza destinatario vengono segnalati come non eseguiti
          nel report (mai invii a destinatari non autorizzati).
        </p>

        <button
          type="button"
          onClick={esegui}
          disabled={inviando}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-5 py-2.5 text-sm font-bold text-blue-900 shadow-sm transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {inviando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Invio test in corso...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Esegui test invio ordine
            </>
          )}
        </button>
      </div>

      {errore && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {errore}
        </div>
      )}

      {report && (
        <div className="space-y-4">
          {/* Garanzie strutturali */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              <PackageX className="h-4 w-4 shrink-0" />
              Nessun ordine reale creato
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              Stock non modificato
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              <Wallet className="h-4 w-4 shrink-0" />
              Nessun pagamento reale
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-black text-slate-900">
                Report test — ordine <span className="text-yellow-700">{report.numeroTest}</span>
              </h3>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  report.ok
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {report.ok ? "TUTTI I CANALI ESITOSI" : "CONTROLLARE I CANALI"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Eseguiti: {report.eseguiti} · Saltati/non eseguiti: {report.saltatiONonEseguiti} ·
              Errori: {report.errori}
            </p>

            <div className="mt-4 space-y-2">
              {report.canali.map((c) => (
                <div
                  key={c.canale}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">
                      {labelCanale[c.canale] ?? c.canale}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-600">{c.dettaglio}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      c.stato === "inviato" || c.stato === "creato"
                        ? "bg-emerald-100 text-emerald-800"
                        : c.stato === "errore"
                          ? "bg-red-100 text-red-700"
                          : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {c.stato.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-4 text-[11px] leading-4 text-slate-400">
              Test id: {report.idTest} — ordine sintetico, nessuna riga in `ordini`, nessuna
              modifica a prodotti/stock, nessuna sessione di pagamento.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}