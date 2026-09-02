"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive,
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  ExternalLink,
  Inbox,
  Loader2,
  MailOpen,
  X,
} from "lucide-react";
import {
  GRAVITA_NOTIFICA_ADMIN,
  type AdminNotificaRiga,
  type GravitaNotificaAdmin,
} from "@/lib/amministratore/notifiche";
import { EVENTO_AGGIORNA_NOTIFICHE } from "./notifiche-eventi";

const ETICHETTE_TIPO: Record<string, string> = {
  ordine_nuovo: "Ordine",
  segnalazione_nuova: "Segnalazione",
  venditore_registrato: "Venditore",
  negozio_creato: "Negozio",
  prodotto_creato: "Prodotto",
  offerta_creata: "Offerta",
  evento_creato: "Evento",
  payout_da_erogare: "Payout",
};

const ETICHETTE_GRAVITA: Record<string, string> = {
  info: "Info",
  attenzione: "Attenzione",
  urgente: "Urgente",
};

function formattaData(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BadgeGravita({ gravita }: { gravita: GravitaNotificaAdmin }) {
  switch (gravita) {
    case "urgente":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
          <CircleDot className="h-3 w-3 text-rose-500" aria-hidden />
          Urgente
        </span>
      );
    case "attenzione":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2.5 py-1 text-[11px] font-bold text-yellow-700 ring-1 ring-yellow-200">
          Attenzione
        </span>
      );
    case "info":
      return (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
          Info
        </span>
      );
  }
}

export default function NotificheModule() {
  const [notifiche, setNotifiche] = useState<AdminNotificaRiga[]>([]);
  const [totale, setTotale] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [soloNonLette, setSoloNonLette] = useState(false);
  const [gravita, setGravita] = useState("");
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [azioneInCorso, setAzioneInCorso] = useState<string | null>(null);

  const caricaDati = useCallback(
    async (nuovaPagina = pagina) => {
      setIsLoading(true);
      setErrore(null);
      const params = new URLSearchParams();
      if (soloNonLette) params.set("nonLette", "1");
      if (gravita) params.set("gravita", gravita);
      params.set("page", String(nuovaPagina));
      params.set("pageSize", String(pageSize));

      try {
        const res = await fetch(`/api/amministratore/notifiche?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          data?: {
            notifiche?: AdminNotificaRiga[];
            totale?: number;
            unreadCount?: number;
            hasMore?: boolean;
          };
        };
        const payload = json?.data ?? {};
        setNotifiche(payload.notifiche ?? []);
        setTotale(payload.totale ?? 0);
        setHasMore(Boolean(payload.hasMore));
        const nonLette = payload.unreadCount ?? 0;
        setUnreadCount(nonLette);
        window.dispatchEvent(
          new CustomEvent(EVENTO_AGGIORNA_NOTIFICHE, { detail: nonLette })
        );
      } catch (err) {
        setErrore(err instanceof Error ? err.message : "Errore caricamento notifiche");
      } finally {
        setIsLoading(false);
      }
    },
    [pagina, soloNonLette, gravita, pageSize]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    caricaDati();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloNonLette, gravita, pageSize]);

  const numeroPagine = Math.max(1, Math.ceil(totale / pageSize));
  const paginaEffettiva = Math.min(pagina, numeroPagine);

  const vaiAPagina = (destinazione: number) => {
    const nuova = Math.max(1, Math.min(destinazione, numeroPagine));
    if (nuova === pagina) return;
    setPagina(nuova);
    void caricaDati(nuova);
  };

  const eseguiMutazione = async (
    azione: "segna_letta" | "archivia",
    id: string
  ) => {
    setAzioneInCorso(`${azione}-${id}`);
    setErrore(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/amministratore/notifiche", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione, id }),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { unreadCount?: number };
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Errore durante l'operazione.");
      }
      const nonLette = json?.data?.unreadCount ?? 0;
      setUnreadCount(nonLette);
      window.dispatchEvent(
        new CustomEvent(EVENTO_AGGIORNA_NOTIFICHE, { detail: nonLette })
      );
      setFeedback(
        azione === "archivia"
          ? "Notifica archiviata."
          : "Notifica segnata come letta."
      );
      if (notifiche.length === 1 && pagina > 1) {
        setPagina(Math.max(1, pagina - 1));
        void caricaDati(Math.max(1, pagina - 1));
      } else {
        void caricaDati();
      }
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore sconosciuto.");
    } finally {
      setAzioneInCorso(null);
    }
  };

  const segnaTutteLette = async () => {
    setAzioneInCorso("tutte");
    setErrore(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/amministratore/notifiche", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione: "segna_tutte_lette" }),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { unreadCount?: number };
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Errore durante l'operazione.");
      }
      const nonLette = json?.data?.unreadCount ?? 0;
      setUnreadCount(nonLette);
      window.dispatchEvent(
        new CustomEvent(EVENTO_AGGIORNA_NOTIFICHE, { detail: nonLette })
      );
      setFeedback("Tutte le notifiche sono state segnate come lette.");
      void caricaDati();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore sconosciuto.");
    } finally {
      setAzioneInCorso(null);
    }
  };

  const haFiltri = soloNonLette || gravita !== "";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="card p-6 md:p-8">
        <nav aria-label="Percorso" className="mb-5">
          <button
            type="button"
            onClick={() => (window.location.href = "/amministratore")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition hover:text-blue-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Torna al pannello
          </button>
        </nav>

        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <Bell className="h-7 w-7" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">
              Centro notifiche
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Notifiche
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Eventi amministrativi generati automaticamente dal back office:
              nuovi ordini, segnalazioni, registrazioni e attività dei negozi.
              Le notifiche sono puramente informative e non bloccano mai alcuna
              operazione.
            </p>
          </div>
        </div>

        {unreadCount > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-yellow-400 px-2 text-xs font-black text-yellow-950">
              {unreadCount}
            </span>
            <span>
              {unreadCount === 1
                ? "1 notifica non letta"
                : `${unreadCount} notifiche non lette`}
              {" — "}
              <button
                type="button"
                onClick={() => void segnaTutteLette()}
                disabled={azioneInCorso !== null}
                className="inline-flex items-center gap-1 font-bold text-blue-700 underline-offset-2 transition hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCheck className="h-4 w-4" aria-hidden />
                Segna tutte come lette
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Toolbar filtri */}
      <div className="card p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSoloNonLette(false)}
              className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
                !soloNonLette
                  ? "border-yellow-300 bg-yellow-50 text-yellow-800"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              <Inbox className="h-3.5 w-3.5" aria-hidden />
              Tutte
            </button>
            <button
              type="button"
              onClick={() => setSoloNonLette(true)}
              className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
                soloNonLette
                  ? "border-yellow-300 bg-yellow-50 text-yellow-800"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              <MailOpen className="h-3.5 w-3.5" aria-hidden />
              Non lette
              {unreadCount > 0 && (
                <span className="ml-0.5 rounded-full bg-yellow-400 px-1.5 py-0.5 text-[10px] font-black text-yellow-950">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={gravita}
              onChange={(e) => {
                setGravita(e.target.value);
                setPagina(1);
              }}
              aria-label="Filtra per gravità"
              className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-700 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Tutte le gravità</option>
              {GRAVITA_NOTIFICA_ADMIN.map((g) => (
                <option key={g} value={g}>
                  {ETICHETTE_GRAVITA[g]}
                </option>
              ))}
            </select>

            <select
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPagina(1);
              }}
              aria-label="Notifiche per pagina"
              className="h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-700 transition focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="20">20 per pagina</option>
              <option value="50">50 per pagina</option>
              <option value="100">100 per pagina</option>
            </select>

            <button
              type="button"
              onClick={() => void segnaTutteLette()}
              disabled={azioneInCorso !== null || unreadCount === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              Segna tutte come lette
            </button>
          </div>
        </div>

        {haFiltri && (
          <button
            type="button"
            onClick={() => {
              setSoloNonLette(false);
              setGravita("");
              setPagina(1);
            }}
            className="mt-2 text-xs font-semibold text-blue-600 underline-offset-2 transition hover:underline"
          >
            Azzera filtri
          </button>
        )}
      </div>

      {errore && (
        <div className="flex items-start gap-3 rounded-3xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
          <p className="leading-6">{errore}</p>
          <button
            type="button"
            onClick={() => setErrore(null)}
            className="ml-auto rounded p-0.5 hover:bg-blue-100"
            aria-label="Chiudi messaggio"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {feedback && (
        <div className="flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
          <CheckCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="leading-6">{feedback}</p>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="ml-auto rounded p-0.5 hover:bg-emerald-100"
            aria-label="Chiudi messaggio"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center rounded-[2rem] border border-white/70 bg-white p-12 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
        </div>
      ) : notifiche.length === 0 ? (
        <div className="rounded-[2rem] border border-slate-100 bg-white px-6 py-16 text-center shadow-sm">
          <Bell className="mx-auto h-10 w-10 text-slate-200" aria-hidden />
          <p className="mt-4 text-lg font-bold text-slate-600">
            Nessuna notifica trovata
          </p>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            {haFiltri
              ? "Prova a modificare i filtri selezionati."
              : "Non sono presenti notifiche. Le nuove attività amministrative compariranno qui automaticamente."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-black text-slate-700">
              {totale} {totale === 1 ? "notifica" : "notifiche"}
              {soloNonLette && " non lette"}
            </p>
          </div>

          <div className="grid gap-3">
            {notifiche.map((n) => {
              const nonLetta = n.letta_at === null;
              return (
                <article
                  key={n.id}
                  className={`card p-5 transition ${
                    nonLetta
                      ? "border-yellow-300 bg-yellow-50/40 shadow-sm"
                      : "border-slate-100"
                  }`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {nonLetta && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-yellow-950">
                            <CircleDot className="h-3 w-3" aria-hidden />
                            Nuova
                          </span>
                        )}
                        <BadgeGravita gravita={n.gravita} />
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                          {ETICHETTE_TIPO[n.tipo] ?? n.tipo}
                        </span>
                      </div>

                      <h2
                        className={`text-base tracking-tight text-slate-900 ${
                          nonLetta ? "font-black" : "font-bold"
                        }`}
                      >
                        {n.titolo}
                      </h2>

                      <p
                        className={`max-w-2xl text-sm leading-relaxed ${
                          nonLetta ? "text-slate-700" : "text-slate-500"
                        }`}
                      >
                        {n.corpo}
                      </p>

                      <p className="text-[11px] text-slate-400">
                        {formattaData(n.created_at)}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2 self-end md:self-center">
                      {n.href && (
                        <Link
                          href={n.href}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          Apri
                        </Link>
                      )}
                      {nonLetta && (
                        <button
                          type="button"
                          disabled={azioneInCorso !== null}
                          onClick={() => void eseguiMutazione("segna_letta", n.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {azioneInCorso === `segna_letta-${n.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Segna come letta
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={azioneInCorso !== null}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Archiviare questa notifica? Non sarà più visibile nell'elenco."
                            )
                          ) {
                            void eseguiMutazione("archivia", n.id);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {azioneInCorso === `archivia-${n.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Archive className="h-3.5 w-3.5" aria-hidden />
                        )}
                        Archivia
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Paginazione */}
          {numeroPagine > 1 && (
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p>
                Pagina {paginaEffettiva} di {numeroPagine}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => vaiAPagina(paginaEffettiva - 1)}
                  disabled={paginaEffettiva <= 1 || isLoading}
                  aria-label="Pagina precedente"
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  Precedente
                </button>
                <button
                  type="button"
                  onClick={() => vaiAPagina(paginaEffettiva + 1)}
                  disabled={!hasMore || paginaEffettiva >= numeroPagine || isLoading}
                  aria-label="Pagina successiva"
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Successiva
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}