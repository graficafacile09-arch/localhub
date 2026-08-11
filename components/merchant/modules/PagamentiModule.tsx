"use client";

import { useState, useEffect } from "react";
import { CreditCard, CheckCircle2, AlertCircle, ShieldCheck, Lock } from "lucide-react";
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
  has_secret: boolean;
};

type MetodoConfig = {
  metodo: string;
  attivo: boolean;
  ordine_mostra: number;
};

/** Etichetta e campi da mostrare per ogni provider. */
const PROVIDER_INFO: Record<
  string,
  { nome: string; descrizione: string; campoId: string; haSecret: boolean }
> = {
  klarna: {
    nome: "Klarna",
    descrizione: "Paga in 3 o 4 rate — pay later",
    campoId: "Merchant ID",
    haSecret: true,
  },
  scalapay: {
    nome: "Scalapay",
    descrizione: "Paga in 3 rate senza interessi",
    campoId: "Merchant Code",
    haSecret: true,
  },
  paypal: {
    nome: "PayPal",
    descrizione: "Pagamenti con account PayPal",
    campoId: "Client ID",
    haSecret: true,
  },
  stripe: {
    nome: "Carta",
    descrizione: "Carte di credito e debito (Stripe)",
    campoId: "Publishable Key",
    haSecret: true,
  },
  bonifico: {
    nome: "Bonifico bancario",
    descrizione: "Pagamento manuale tramite bonifico",
    campoId: "",
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

  async function handleSave() {
    setSaving(true);
    setErrore(null);
    setSalvato(false);

    const pagamenti = Object.entries(form.providers).map(([provider, p]) => {
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

      {errore && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errore}
        </div>
      )}
      {salvato && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Configurazione salvata.
        </div>
      )}

      <div className="space-y-6">
        {/* ── Provider ─────────────────────────────────────────────────── */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Provider di pagamento
          </p>
          <div className="space-y-3">
            {Object.entries(PROVIDER_INFO).map(([key, info]) => {
              const p = form.providers[key];
              if (!p) return null;
              return (
                <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900">{info.nome}</p>
                        {p.has_secret ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
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
                    <div className="flex items-center gap-4">
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
                            <div>
                              <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-500">
                                Modalità
                              </label>
                              <select
                                value={p.test_mode ? "test" : "live"}
                                onChange={(e) => setProvider(key, { test_mode: e.target.value === "test" })}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                              >
                                <option value="test">Test (sandbox)</option>
                                <option value="live">Live (produzione)</option>
                              </select>
                            </div>
                          </div>

                          {info.haSecret && (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-500">
                                  <Lock className="h-3 w-3 text-slate-400" /> Secret
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
                                  placeholder={p.has_secret ? "•••••••• (non modificare)" : "Inserisci il secret"}
                                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                />
                              </div>
                              <div>
                                <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-500">
                                  <Lock className="h-3 w-3 text-slate-400" /> Webhook secret
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
                                  placeholder={p.has_secret ? "•••••••• (non modificare)" : "Inserisci il webhook secret"}
                                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                />
                              </div>
                            </div>
                          )}

                          {/* FASE F1 — webhook Stripe: URL unico da impostare
                              nel pannello Stripe (Developer → Webhooks). */}
                          {key === "stripe" && (
                            <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                              <p className="text-[11px] font-semibold text-slate-600">
                                Webhook da configurare in Stripe
                              </p>
                              <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
                                {typeof window !== "undefined"
                                  ? `${window.location.origin}/api/webhook/pagamenti/stripe`
                                  : "/api/webhook/pagamenti/stripe"}
                              </p>
                              <p className="mt-1 text-[10px] leading-4 text-slate-400">
                                Imposta questo URL come endpoint webhook (Dashboard → Developers →
                                Webhooks) e incolla il signing secret nel campo "Webhook secret".
                                Eventi necessari: checkout.session.completed, checkout.session.expired,
                                charge.refunded. Il pagamento con carta è attivo per i clienti SOLO
                                dopo questa configurazione.
                              </p>
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
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Metodi mostrati al checkout
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
            I metodi attivi vengono mostrati nel checkout dei clienti. Il metodo
            "Carta" diventa visibile SOLO quando Stripe è configurato e attivo;
            "Bonifico" solo quando IBAN/intestatario sono valorizzati.
          </p>
        </div>

        <SaveBar saving={saving} onSave={handleSave} dirty={dirty} />
      </div>
    </ModuleShell>
  );
}
