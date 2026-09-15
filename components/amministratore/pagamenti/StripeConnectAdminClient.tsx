"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type {
  ElencoStripeConnectAdmin,
  NegozioStripeConnectAdmin,
} from "@/lib/amministratore/pagamenti-stripe";

const ETICHETTE_STATO: Record<string, string> = {
  NON_COLLEGATO: "Non collegato",
  ONBOARDING: "Onboarding",
  RESTRICTED: "Limitato",
  ATTIVO: "Attivo",
};

const ETICHETTE_ONBOARDING: Record<string, string> = {
  not_started: "Non avviato",
  pending: "In corso",
  complete: "Completo",
  restricted: "Limitato",
};

function BadgeStato({ stato }: { stato: string }) {
  const classe =
    stato === "ATTIVO"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      : stato === "ONBOARDING"
        ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
        : stato === "RESTRICTED"
          ? "bg-red-50 text-red-700 ring-1 ring-red-200"
          : "bg-slate-100 text-slate-500 ring-1 ring-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${classe}`}>
      {ETICHETTE_STATO[stato] ?? stato}
    </span>
  );
}

function formattaData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Kpi({ label, valore, colore }: { label: string; valore: string; colore: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/70 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-black tracking-tight ${colore}`}>{valore}</p>
    </div>
  );
}

function Flag({ ok, etichetta }: { ok: boolean; etichetta: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
      {ok ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <AlertTriangle className="h-3 w-3" aria-hidden />}
      {etichetta}: {ok ? "Sì" : "No"}
    </span>
  );
}

export default function StripeConnectAdminClient() {
  const [elenco, setElenco] = useState<ElencoStripeConnectAdmin | null>(null);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [azioni, setAzioni] = useState<Record<string, "verifica" | "onboarding" | undefined>>({});
  const [messaggi, setMessaggi] = useState<Record<string, { tipo: "ok" | "errore"; testo: string } | null>>({});

  const carica = useCallback(async () => {
    setCaricando(true);
    setErrore(null);
    try {
      const res = await fetch("/api/amministratore/pagamenti/stripe");
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        data?: ElencoStripeConnectAdmin | null;
      };
      if (!res.ok) {
        setErrore(json?.error?.message ?? "Impossibile caricare i collegamenti Stripe.");
        setElenco(null);
        return;
      }
      setElenco(json?.data ?? null);
    } catch {
      setErrore("Errore di rete. Riprova.");
      setElenco(null);
    } finally {
      setCaricando(false);
    }
  }, []);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function verifica(negozioId: string) {
    setAzioni((a) => ({ ...a, [negozioId]: "verifica" }));
    setMessaggi((m) => ({ ...m, [negozioId]: null }));
    try {
      const res = await fetch(`/api/amministratore/pagamenti/stripe/${negozioId}/verifica`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        data?: { negozio?: NegozioStripeConnectAdmin } | null;
      };
      if (!res.ok || !json?.data?.negozio) {
        setMessaggi((m) => ({ ...m, [negozioId]: { tipo: "errore", testo: json?.error?.message ?? "Verifica non riuscita." } }));
      } else {
        setElenco((e) =>
          e
            ? {
                ...e,
                negozi: e.negozi.map((n) => (n.id === negozioId ? (json.data!.negozio as NegozioStripeConnectAdmin) : n)),
              }
            : e
        );
        setMessaggi((m) => ({ ...m, [negozioId]: { tipo: "ok", testo: "Stato aggiornato da Stripe." } }));
      }
    } catch {
      setMessaggi((m) => ({ ...m, [negozioId]: { tipo: "errore", testo: "Errore di rete." } }));
    } finally {
      setAzioni((a) => ({ ...a, [negozioId]: undefined }));
    }
  }

  async function onboarding(negozioId: string) {
    setAzioni((a) => ({ ...a, [negozioId]: "onboarding" }));
    setMessaggi((m) => ({ ...m, [negozioId]: null }));
    try {
      const res = await fetch(`/api/amministratore/pagamenti/stripe/${negozioId}/onboarding`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        data?: { url?: string; accountId?: string } | null;
      };
      if (!res.ok || !json?.data?.url) {
        setMessaggi((m) => ({ ...m, [negozioId]: { tipo: "errore", testo: json?.error?.message ?? "Account Link non generato." } }));
        return;
      }
      // Apre il portale hosted Stripe in una nuova scheda: il KYC resta a
      // carico del negoziante (mai sostituito dall'amministratore).
      window.open(json.data.url, "_blank", "noopener,noreferrer");
      setMessaggi((m) => ({ ...m, [negozioId]: { tipo: "ok", testo: "Onboarding aperto nel portale Stripe. Condividi il link con il titolare del negozio." } }));
    } catch {
      setMessaggi((m) => ({ ...m, [negozioId]: { tipo: "errore", testo: "Errore di rete." } }));
    } finally {
      setAzioni((a) => ({ ...a, [negozioId]: undefined }));
    }
  }

  const negozi = elenco?.negozi ?? [];
  const riepilogo = elenco?.riepilogo;

  return (
    <div className="space-y-5">
      {/* Intestazione */}
      <div className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <CreditCard className="h-7 w-7" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Pannello Amministratore
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Stripe Connect
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Supervisione dei connected account Stripe dei negozi: stato di
              onboarding, incassi e payout abilitati, verifica live e riapertura
              del flusso. L&apos;account Stripe della piattaforma (credenziali
              env) resta di proprietà di InCittà; ogni negozio ha il proprio
              connected account e i pagamenti restano direct charge. La verifica
              dei dati (KYC/IBAN) avviene nel portale hosted Stripe da parte del
              negoziante, mai qui.
            </p>
          </div>
        </div>
      </div>

      {/* KPI */}
      {riepilogo && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Kpi label="Negozi" valore={String(riepilogo.totaleNegozi)} colore="text-slate-900" />
          <Kpi label="Collegati" valore={String(riepilogo.collegati)} colore="text-blue-700" />
          <Kpi label="Attivi" valore={String(riepilogo.attivi)} colore="text-emerald-700" />
          <Kpi label="In onboarding" valore={String(riepilogo.onboarding)} colore="text-amber-700" />
          <Kpi label="Limitati" valore={String(riepilogo.restricted)} colore="text-red-600" />
        </div>
      )}

      {/* Avviso modello architetturale */}
      <div className="flex items-start gap-3 rounded-[1.5rem] border border-blue-100 bg-blue-50 px-4 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
        <p className="text-xs leading-5 text-blue-900">
          Il collegamento e la supervisione sono gestiti qui dall&apos;amministrazione;
          la configurazione delle credenziali della piattaforma vive nelle variabili
          d&apos;ambiente server-side e non è mai esposta. L&apos;admin non bypassa il KYC:
          l&apos;Account Link punta al portale hosted Stripe compilato dal titolare del negozio.
        </p>
      </div>

      {/* Stati */}
      {errore && (
        <div className="rounded-[1.75rem] border border-blue-100 bg-blue-50 p-6 text-center">
          <p className="text-sm font-semibold text-blue-700">{errore}</p>
        </div>
      )}

      {!errore && caricando && !elenco && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">Caricamento collegamenti Stripe…</p>
        </div>
      )}

      {!errore && !caricando && negozi.length === 0 && (
        <div className="rounded-[1.75rem] border border-white/70 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-700">Nessun negozio trovato</p>
          <p className="mt-1 text-xs text-slate-500">I negozi compaiono quando vengono creati sulla piattaforma.</p>
        </div>
      )}

      {/* Elenco negozi */}
      {negozi.length > 0 && (
        <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3">Negozio</th>
                  <th className="px-4 py-3">Stato</th>
                  <th className="px-4 py-3">Account collegato</th>
                  <th className="px-4 py-3">Onboarding</th>
                  <th className="px-4 py-3">Abilitazioni</th>
                  <th className="px-4 py-3">Ultimo aggiornamento</th>
                  <th className="px-4 py-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {negozi.map((n) => (
                  <tr key={n.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40">
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-slate-900">{n.nome}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {n.categoria ?? "—"}
                        {!n.attivo && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Inattivo</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <BadgeStato stato={n.statoComplessivo} />
                    </td>
                    <td className="px-4 py-3.5">
                      {n.accountPresente ? (
                        <div>
                          <p className="font-mono text-[11px] text-slate-600">{n.accountId}</p>
                          {n.accountName && <p className="mt-0.5 text-[11px] text-slate-400">{n.accountName}</p>}
                          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            {n.testMode ? "Test" : "Live"}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">Nessun account</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        {ETICHETTE_ONBOARDING[n.onboardingStatus] ?? n.onboardingStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        <Flag ok={n.chargesEnabled} etichetta="Incassi" />
                        <Flag ok={n.payoutsEnabled} etichetta="Payout" />
                        {/* B1 — capability payment methods Stripe (stato reale,
                            active → true; fail-closed). */}
                        <Flag ok={n.klarnaEnabled} etichetta="Klarna" />
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">
                      {formattaData(n.aggiornatoAt)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={!!azioni[n.id] || !n.accountPresente}
                          onClick={() => verifica(n.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800 disabled:opacity-40"
                        >
                          {azioni[n.id] === "verifica" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Verifica
                        </button>
                        <button
                          type="button"
                          disabled={!!azioni[n.id]}
                          onClick={() => onboarding(n.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-yellow-400 px-3 py-2 text-xs font-semibold text-blue-800 transition hover:bg-yellow-300 disabled:opacity-40"
                        >
                          {azioni[n.id] === "onboarding" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          )}
                          {n.accountPresente ? "Riapri onboarding" : "Avvia collegamento"}
                        </button>
                      </div>
                      {messaggi[n.id] && (() => {
                        const m = messaggi[n.id];
                        if (!m) return null;
                        return (
                          <p className={`mt-1.5 text-right text-[11px] font-semibold ${m.tipo === "ok" ? "text-emerald-600" : "text-red-600"}`}>
                            {m.testo}
                          </p>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rendicontazione correlata */}
      <div className="rounded-[1.75rem] border border-white/70 bg-white p-5 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Rendicontazione correlata
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/amministratore/incassi"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800"
          >
            Incassi <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <Link
            href="/amministratore/payout"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800"
          >
            Payout <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <Link
            href="/amministratore/ordini"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-yellow-300 hover:bg-yellow-50 hover:text-yellow-800"
          >
            Ordini e rimborsi <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}