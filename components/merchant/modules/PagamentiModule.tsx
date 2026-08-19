"use client";

import { useState, useEffect } from "react";
import { CreditCard, CheckCircle2, AlertCircle, ShieldCheck, Lock, Info } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { Toggle, SaveBar } from "./ModuleFields";

type Props = { storeId: string };

type ProviderConfig = {
  provider: string;
  presente: boolean;
  attivo: boolean;
  test_mode: boolean;
  client_id: string | null;
  payee_email: string | null;
  iban: string | null;
  account_id: string | null;
  account_name: string | null;
  has_secret: boolean;
};

type MetodoConfig = {
  metodo: string;
  attivo: boolean;
  ordine_mostra: number;
};

/**
 * Info di UN provider mostrato nel pannello.
 * Ogni gateway ha etichette e URL webhook propri: il merchant deve capire
 * esattamente quale campo va riempito e dove puntare il webhook.
 */
type ProviderInfoEntry = {
  nome: string;
  descrizione: string;
  /** Etichetta del campo client_id (Stripe: Publishable Key, PayPal: Client ID, ...). */
  campoId: string;
  /** Etichetta del campo secret. */
  campoSecret: string;
  /** Etichetta del campo webhook (PayPal = Webhook ID, Klarna = Shared Secret HMAC). */
  campoWebhook: string;
  /** URL webhook relativo da registrare presso il provider (null = nessun webhook). */
  webhookUrl: string | null;
  /** Istruzioni webhook mostrate al merchant. */
  webhookIstruzioni?: string;
  /** Etichetta della modalità test. */
  testLabel: string;
  /** Etichetta della modalità live. */
  liveLabel: string;
  /** True se il provider richiede secret + webhook (false per bonifico). */
  haSecret: boolean;
  /** True se il provider ha UNA sola credenziale (API key, nessun client id né webhook separato). */
  soloSecret?: boolean;
  /** Nota informativa opzionale (es. Publishable Key Stripe non usata). */
  nota?: string;
};

const PROVIDER_INFO: Record<string, ProviderInfoEntry> = {
  stripe: {
    nome: "Carta (Stripe)",
    descrizione: "Carte di credito/debito + Apple Pay + Google Pay",
    campoId: "Publishable Key (non necessaria)",
    campoSecret: "Secret Key",
    campoWebhook: "Webhook Secret",
    webhookUrl: "/api/webhook/pagamenti/stripe",
    webhookIstruzioni:
      "Imposta questo URL come endpoint webhook nel Dashboard Stripe (Developers → Webhooks) e incolla il signing secret nel campo \"Webhook Secret\". Eventi necessari: checkout.session.completed, checkout.session.expired, charge.refunded.",
    testLabel: "Test",
    liveLabel: "Live",
    haSecret: true,
    nota:
      "La Publishable Key non viene utilizzata dal flusso Stripe Checkout hosted: servono solo Secret Key e Webhook Secret. Apple Pay e Google Pay sono gestiti da Stripe (Dynamic Payment Methods): per mostrarli occorre abilitarli nel Dashboard Stripe (Apple Pay richiede anche la verifica del dominio).",
  },
  paypal: {
    nome: "PayPal",
    descrizione: "Pagamenti con account PayPal",
    campoId: "Client ID",
    campoSecret: "Secret",
    campoWebhook: "Webhook ID",
    webhookUrl: "/api/webhook/pagamenti/paypal",
    webhookIstruzioni:
      "Nel PayPal Developer Dashboard crea un webhook su questo URL e incolla il suo \"Webhook ID\" nel campo \"Webhook ID\" (non un secret). Eventi necessari: PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED, PAYMENT.CAPTURE.DENIED, PAYMENT.CAPTURE.FAILED, CHECKOUT.ORDER.CANCELLED.",
    testLabel: "Sandbox",
    liveLabel: "Live",
    haSecret: true,
  },
  klarna: {
    nome: "Klarna",
    descrizione: "Paga in 3 o 4 rate — pay later",
    campoId: "Client ID / Username",
    campoSecret: "Secret / Password",
    campoWebhook: "Shared Secret HMAC",
    webhookUrl: "/api/webhook/pagamenti/klarna",
    webhookIstruzioni:
      "Registra questo URL come push URL Klarna e imposta lo stesso \"Shared Secret HMAC\" nel campo dedicato (Klarna firma gli eventi con HMAC-SHA256). Eventi gestiti: AUTHORIZED/CAPTURED, CANCELLED, EXPIRED, REFUNDED.",
    testLabel: "Playground",
    liveLabel: "Live",
    haSecret: true,
  },
  scalapay: {
    nome: "Scalapay",
    descrizione: "Paga in 3 rate — buy now, pay later",
    campoId: "",
    campoSecret: "API Key",
    campoWebhook: "",
    webhookUrl: "/api/webhook/pagamenti/scalapay",
    webhookIstruzioni:
      "Registra questo URL come endpoint webhook nel Merchant Portal Scalapay. Scalapay firma gli eventi con HMAC-SHA256 usando la stessa API Key (header x-scalapay-hmac-v1). Eventi gestiti: charged, authorized, refunded, expired.",
    testLabel: "Sandbox",
    liveLabel: "Live",
    haSecret: true,
    soloSecret: true,
    nota:
      "Scalapay richiede solo l'API Key del TUO account Scalapay (prefissata sp_): devi procurartela autonomamente, la registrazione Scalapay è a tuo carico. Sandbox e Live usano ciascuna la rispettiva API Key. LocalHub non fornisce né utilizza un account Scalapay globale: la configurazione è gestita da te, per il tuo negozio. La stessa chiave autentica le chiamate API e firma i webhook; non servono Client ID né un webhook secret separato.",
  },
  bonifico: {
    nome: "Bonifico bancario",
    descrizione: "Pagamento manuale tramite bonifico",
    campoId: "",
    campoSecret: "",
    campoWebhook: "",
    webhookUrl: null,
    testLabel: "",
    liveLabel: "",
    haSecret: false,
  },
};

const METODI_INFO: Record<string, { nome: string; descrizione: string }> = {
  carta: { nome: "Carta", descrizione: "Carte di credito e debito" },
  paypal: { nome: "PayPal", descrizione: "Account PayPal" },
  klarna: { nome: "Klarna", descrizione: "Paga in 3/4 rate" },
  scalapay: { nome: "Scalapay", descrizione: "Paga in 3 rate" },
  bonifico: { nome: "Bonifico", descrizione: "Bonifico bancario" },
};

type FormState = {
  providers: Record<string, ProviderForm>;
  metodi: Record<string, { attivo: boolean }>;
};

type ProviderForm = {
  attivo: boolean;
  test_mode: boolean;
  client_id: string;
  payee_email: string;
  iban: string;
  secret: string;
  webhook_secret: string;
  has_secret: boolean;
  account_id: string;
  account_name: string;
};

function statoIniziale(): FormState {
  const providers: Record<string, ProviderForm> = {};
  for (const key of Object.keys(PROVIDER_INFO)) {
    providers[key] = {
      attivo: false,
      test_mode: true,
      client_id: "",
      payee_email: "",
      iban: "",
      secret: "",
      webhook_secret: "",
      has_secret: false,
      account_id: "",
      account_name: "",
    };
  }
  const metodi: Record<string, { attivo: boolean }> = {};
  for (const key of Object.keys(METODI_INFO)) {
    metodi[key] = { attivo: false };
  }
  return { providers, metodi };
}

export default function PagamentiModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);
  const [form, setForm] = useState<FormState>(statoIniziale);
  const [original, setOriginal] = useState("");
  const [secretDirty, setSecretDirty] = useState<Record<string, boolean>>({});
  const [connectBusy, setConnectBusy] = useState(false);
  const [stripeMsg, setStripeMsg] = useState<{ tipo: "ok" | "errore"; testo: string } | null>(null);

  // Messaggio di ritorno dal flusso Stripe Connect (query param impostato dal callback).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const esito = new URLSearchParams(window.location.search).get("stripe");
    if (esito === "connected") {
      setStripeMsg({ tipo: "ok", testo: "Account Stripe collegato correttamente." });
    } else if (esito === "error") {
      setStripeMsg({ tipo: "errore", testo: "Collegamento Stripe non riuscito. Riprova." });
    }
  }, []);

  useEffect(() => {
    fetch(`/api/merchant/stores/${storeId}/pagamenti`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const prossimo = statoIniziale();
          for (const p of json.data.pagamenti ?? []) {
            if (!prossimo.providers[p.provider]) continue;
            prossimo.providers[p.provider] = {
              attivo: p.attivo ?? false,
              test_mode: p.test_mode ?? true,
              client_id: p.client_id ?? "",
              payee_email: p.payee_email ?? "",
              iban: p.iban ?? "",
              secret: "",
              webhook_secret: "",
              has_secret: p.has_secret ?? false,
              account_id: p.account_id ?? "",
              account_name: p.account_name ?? "",
            };
          }
          for (const m of json.data.metodi ?? []) {
            if (prossimo.metodi[m.metodo]) {
              prossimo.metodi[m.metodo] = { attivo: m.attivo ?? false };
            }
          }
          setForm(prossimo);
          setOriginal(JSON.stringify(prossimo));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [storeId]);

  function setProvider(key: string, patch: Partial<ProviderForm>) {
    setForm((f) => ({
      ...f,
      providers: { ...f.providers, [key]: { ...f.providers[key], ...patch } },
    }));
  }

  function setMetodo(key: string, attivo: boolean) {
    setForm((f) => ({
      ...f,
      metodi: { ...f.metodi, [key]: { attivo } },
    }));
  }

  async function handleConnectStripe() {
    setConnectBusy(true);
    setStripeMsg(null);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/pagamenti/stripe/connect`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success && json.data?.url) {
        window.location.href = json.data.url;
        return;
      }
      setStripeMsg({
        tipo: "errore",
        testo: json.error?.message ?? "Impossibile avviare il collegamento Stripe.",
      });
    } catch {
      setStripeMsg({ tipo: "errore", testo: "Errore di rete durante il collegamento." });
    } finally {
      setConnectBusy(false);
    }
  }

  async function handleDisconnectStripe() {
    setConnectBusy(true);
    setStripeMsg(null);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/pagamenti/stripe/disconnect`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        setStripeMsg({ tipo: "ok", testo: "Account Stripe scollegato." });
        // Aggiorna lo stato locale senza ricaricare: nessun account collegato.
        setForm((f) => ({
          ...f,
          providers: {
            ...f.providers,
            stripe: { ...f.providers.stripe, account_id: "", account_name: "", attivo: false },
          },
        }));
      } else {
        setStripeMsg({
          tipo: "errore",
          testo: json.error?.message ?? "Impossibile scollegare Stripe.",
        });
      }
    } catch {
      setStripeMsg({ tipo: "errore", testo: "Errore di rete durante lo scollegamento." });
    } finally {
      setConnectBusy(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setErrore(null);
    setSalvato(false);

    // Stripe è gestito esclusivamente via Connect (collega/scollega): non
    // viene incluso nel PUT manuale (mai secret/webhook per Stripe).
    const pagamenti = Object.entries(form.providers)
      .filter(([provider]) => provider !== "stripe")
      .map(([provider, p]) => {
      const entry: Record<string, unknown> = {
        provider,
        attivo: p.attivo,
        test_mode: p.test_mode,
      };
      if (provider !== "bonifico") {
        if (p.client_id.trim()) entry.client_id = p.client_id.trim();
        // I secret vengono inviati SOLO se l'utente ne ha digitato uno nuovo.
        if (secretDirty[provider] && p.secret.trim()) entry.secret = p.secret.trim();
        if (secretDirty[provider] && p.webhook_secret.trim()) {
          entry.webhook_secret = p.webhook_secret.trim();
        }
      } else {
        if (p.payee_email.trim()) entry.payee_email = p.payee_email.trim();
        if (p.iban.trim()) entry.iban = p.iban.trim();
      }
      return entry;
    });

    const metodi = Object.entries(form.metodi).map(([metodo, m]) => ({
      metodo,
      attivo: m.attivo,
    }));

    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/pagamenti`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagamenti, metodi }),
      });
      const json = await res.json();
      if (json.success) {
        // Dopo il salvataggio i secret digitati non vengono conservati:
        // costruiamo il form pulito UNA volta e lo usiamo sia per il
        // render sia per il confronto dirty (mai secret in original).
        const prossimo = { ...form, providers: { ...form.providers } };
        for (const key of Object.keys(prossimo.providers)) {
          prossimo.providers[key] = {
            ...prossimo.providers[key],
            secret: "",
            webhook_secret: "",
          };
        }
        setForm(prossimo);
        setSecretDirty({});
        setOriginal(JSON.stringify(prossimo));
        setSalvato(true);
        setTimeout(() => setSalvato(false), 2500);
      } else {
        setErrore(json.error?.message ?? "Impossibile salvare la configurazione.");
      }
    } catch {
      setErrore("Errore di rete durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify(form) !== original;

  if (loading) {
    return (
      <ModuleShell
        icon={<CreditCard className="h-4 w-4" />}
        title="Pagamenti"
        subtitle="Caricamento..."
        id="pagamenti"
      >
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      icon={<CreditCard className="h-4 w-4" />}
      title="Pagamenti"
      subtitle="Metodi di pagamento accettati nel tuo negozio"
      id="pagamenti"
    >
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <p className="text-xs leading-5 text-blue-900">
          Le credenziali dei provider sono cifrate e salvate esclusivamente lato server:
          non vengono mai mostrate né restituite. Ogni negozio gestisce solo i propri
          account di pagamento.
        </p>
      </div>

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-yellow-100 bg-yellow-50 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
        <p className="text-xs leading-5 text-yellow-900">
          Ci sono <strong>due passaggi distinti</strong>: prima configura e attiva il{" "}
          <strong>provider</strong> (collegando il gateway), poi abilita il relativo{" "}
          <strong>metodo al checkout</strong> per renderlo selezionabile dai clienti.
          Un metodo online è disponibile solo se il suo provider è configurato E il metodo
          è abilitato.
        </p>
      </div>

      {errore && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errore}
        </div>
      )}
      {salvato && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Configurazione salvata.
        </div>
      )}
      {stripeMsg && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold ${
            stripeMsg.tipo === "ok"
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-blue-200 bg-blue-50 text-blue-700"
          }`}
        >
          {stripeMsg.tipo === "ok" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {stripeMsg.testo}
        </div>
      )}

      <div className="space-y-6">
        {/* ── Provider ─────────────────────────────────────────────────── */}
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Provider di pagamento
          </p>
          <p className="mb-3 text-[11px] leading-4 text-slate-400">
            Collega il gateway al tuo account e attivalo. Il badge mostra se le credenziali
            sono già salvate.
          </p>
          <div className="space-y-3">
            {Object.entries(PROVIDER_INFO).map(([key, info]) => {
              const p = form.providers[key];
              if (!p) return null;

              // Stripe è collegato via Connect: nessuna credenziale manuale.
              if (key === "stripe") {
                const collegato = !!p.account_id;
                return (
                  <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-900">{info.nome}</p>
                          {collegato ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                              <CheckCircle2 className="h-3 w-3" /> Collegato
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                              <AlertCircle className="h-3 w-3" /> Non collegato
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">{info.descrizione}</p>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-slate-100 pt-4">
                      {collegato ? (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-slate-700">
                              Account collegato:{" "}
                              <span className="font-semibold">{p.account_name || "Stripe"}</span>
                            </p>
                            {p.account_id && (
                              <p className="mt-1 font-mono text-[11px] text-slate-400">
                                ID account Connect: {p.account_id}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={connectBusy}
                            onClick={handleDisconnectStripe}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                          >
                            Scollega
                          </button>
                        </div>
                      ) : (
                        <div>
                          <p className="mb-3 text-xs text-slate-500">
                            Collega il tuo account Stripe per accettare pagamenti con carta e,
                            quando disponibili, Apple Pay e Google Pay. Non serve inserire
                            alcuna chiave: Stripe gestisce accesso, registrazione e verifica.
                          </p>
                          <button
                            type="button"
                            disabled={connectBusy}
                            onClick={handleConnectStripe}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-yellow-400 px-3 py-2 text-xs font-semibold text-blue-800 transition hover:bg-yellow-300 disabled:opacity-50"
                          >
                            {connectBusy ? "Reindirizzamento…" : "Collega Stripe"}
                          </button>
                        </div>
                      )}

                      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                        <p className="text-[10px] leading-4 text-slate-500">
                          Apple Pay e Google Pay sono gestiti da Stripe (Dynamic Payment
                          Methods) e compaiono automaticamente quando abilitati nel Dashboard
                          Stripe. Non vengono richiesti né mostrati Secret Key o Webhook Secret
                          del venditore.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900">{info.nome}</p>
                        {p.has_secret ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                            <CheckCircle2 className="h-3 w-3" /> Configurato
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                            <AlertCircle className="h-3 w-3" /> Non configurato
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{info.descrizione}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Provider
                      </span>
                      <Toggle
                        label=""
                        description=""
                        checked={p.attivo}
                        onChange={(v) => setProvider(key, { attivo: v })}
                      />
                    </div>
                  </div>

                  {p.attivo && (
                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                      {key !== "bonifico" ? (
                        <>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {!info.soloSecret && (
                            <div>
                              <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-500">
                                {info.campoId}
                              </label>
                              <input
                                type="text"
                                value={p.client_id}
                                onChange={(e) => setProvider(key, { client_id: e.target.value })}
                                placeholder={info.campoId}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                              />
                              </div>
                              )}
                            <div className={info.soloSecret ? "sm:col-span-2" : ""}>
                              <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-500">
                                Modalità
                              </label>
                              <select
                                value={p.test_mode ? "test" : "live"}
                                onChange={(e) => setProvider(key, { test_mode: e.target.value === "test" })}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                              >
                                <option value="test">{info.testLabel}</option>
                                <option value="live">{info.liveLabel}</option>
                              </select>
                            </div>
                          </div>

                          {info.haSecret && (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className={info.soloSecret ? "sm:col-span-2" : ""}>
                                <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-500">
                                  <Lock className="h-3 w-3 text-slate-400" /> {info.campoSecret}
                                  <span className="font-normal text-slate-400">
                                    {p.has_secret ? " (configurato — lascia vuoto per non cambiarlo)" : ""}
                                  </span>
                                </label>
                                <input
                                  type="password"
                                  value={p.secret}
                                  autoComplete="new-password"
                                  onChange={(e) => {
                                    setProvider(key, { secret: e.target.value });
                                    setSecretDirty((d) => ({ ...d, [key]: true }));
                                  }}
                                  placeholder={p.has_secret ? "•••••••• (non modificare)" : `Inserisci ${info.campoSecret.toLowerCase()}`}
                                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                />
                              </div>
                              {!info.soloSecret && (
                              <div>
                                <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-500">
                                  <Lock className="h-3 w-3 text-slate-400" /> {info.campoWebhook}
                                  <span className="font-normal text-slate-400">
                                    {p.has_secret ? " (opzionale)" : ""}
                                  </span>
                                </label>
                                <input
                                  type="password"
                                  value={p.webhook_secret}
                                  autoComplete="new-password"
                                  onChange={(e) => {
                                    setProvider(key, { webhook_secret: e.target.value });
                                    setSecretDirty((d) => ({ ...d, [key]: true }));
                                  }}
                                  placeholder={p.has_secret ? "•••••••• (non modificare)" : `Inserisci ${info.campoWebhook.toLowerCase()}`}
                                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                />
                              </div>
                              )}
                            </div>
                          )}

                          {info.webhookUrl && (
                            <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                              <p className="text-[11px] font-semibold text-slate-600">
                                Webhook da configurare ({info.nome})
                              </p>
                              <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
                                {typeof window !== "undefined"
                                  ? `${window.location.origin}${info.webhookUrl}`
                                  : info.webhookUrl}
                              </p>
                              {info.webhookIstruzioni && (
                                <p className="mt-1 text-[10px] leading-4 text-slate-400">
                                  {info.webhookIstruzioni}
                                </p>
                              )}
                            </div>
                          )}

                          {info.nota && (
                            <div className="rounded-xl bg-yellow-50 px-3 py-2.5 ring-1 ring-yellow-100">
                              <p className="text-[10px] leading-4 text-yellow-800">{info.nota}</p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-500">
                              Intestatario / email
                            </label>
                            <input
                              type="text"
                              value={p.payee_email}
                              onChange={(e) => setProvider(key, { payee_email: e.target.value })}
                              placeholder="es. contabilita@negozio.it"
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-500">
                              IBAN
                            </label>
                            <input
                              type="text"
                              value={p.iban}
                              onChange={(e) => setProvider(key, { iban: e.target.value })}
                              placeholder="IT00 XXXX XXXX XXXX XXXX XXXX XXX"
                              maxLength={60}
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Metodi mostrati al checkout ─────────────────────────────── */}
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Metodi mostrati al checkout
          </p>
          <p className="mb-3 text-[11px] leading-4 text-slate-400">
            Abilita i metodi che i clienti possono selezionare. Un metodo online diventa
            realmente selezionabile solo se il relativo provider è configurato e attivo
            (sezione sopra).
          </p>
          <div className="space-y-2">
            {Object.entries(METODI_INFO).map(([key, info]) => (
              <Toggle
                key={key}
                icon={<CreditCard className="h-4 w-4 text-slate-500" />}
                label={info.nome}
                description={info.descrizione}
                checked={form.metodi[key]?.attivo ?? false}
                onChange={(v) => setMetodo(key, v)}
              />
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-slate-400">
            Bonifico non richiede un provider e resta sempre disponibile. Carta, PayPal,
            Klarna e Scalapay richiedono sia la configurazione del provider sia
            l&apos;abilitazione del metodo.
          </p>
        </div>

        <SaveBar saving={saving} onSave={handleSave} dirty={dirty} />
      </div>
    </ModuleShell>
  );
}
