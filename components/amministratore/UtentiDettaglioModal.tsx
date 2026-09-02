"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Ban,
  CalendarClock,
  Check,
  KeyRound,
  Loader2,
  MailX,
  Pencil,
  RotateCcw,
  ShieldAlert,
  Store,
  UserRoundCheck,
  UserRoundX,
  X,
} from "lucide-react";
import type { RuoloUtente, Utente } from "@/lib/amministratore/types";
import { RUOLI_UTENTE, STATO_ACCOUNT } from "@/lib/amministratore/types";

const formatDataOra = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatta(value: string | null | undefined): string {
  if (!value) return "—";
  const data = new Date(value);
  return Number.isNaN(data.getTime()) ? value : formatDataOra.format(data);
}

type StatoRisultato =
  | { tipo: "ok"; messaggio: string }
  | { tipo: "errore"; messaggio: string };

/**
 * Dettaglio account — modulo /amministratore/utenti.
 * Centralizza TUTTE le azioni amministrative sull'account:
 *  - ruoli: aggiungi/rimuovi (multi-ruolo ESPLICITO, mai il ruolo admin);
 *  - stato account: sospendi (motivo + durata giorni) / banna (motivo) /
 *    riattiva;
 *  - reset password (link inviato via email all'utente);
 *  - modifica nome profilo;
 *  - negozi associati con link al dettaglio negozio;
 *  - eliminazione definitiva (mai per l'account protetto).
 * Ogni azione passa dal server (PATCH /api/amministratore/utenti/[id]) e il
 * record aggiornato viene restituito al genitore per il refresh della lista.
 */
export default function UtentiDettaglioModal({
  utente: utenteIniziale,
  onAggiornato,
  onEliminato,
  onChiuso,
}: {
  utente: Utente;
  onAggiornato: (utente: Utente) => void;
  onEliminato: (id: string) => void;
  onChiuso: () => void;
}) {
  const [utente, setUtente] = useState(utenteIniziale);
  const [operando, setOperando] = useState<string | null>(null);
  const [risultato, setRisultato] = useState<StatoRisultato | null>(null);
  const [confermaElimina, setConfermaElimina] = useState(false);

  // Form sospendi / banna.
  const [sospendiAperto, setSospendiAperto] = useState(false);
  const [bannaAperto, setBannaAperto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [giorni, setGiorni] = useState(7);

  // Form nome profilo.
  const [modificaNome, setModificaNome] = useState(false);
  const [nomeInput, setNomeInput] = useState(utente.nome);

  const protetto = utente.protetto;

  async function patch(payload: Record<string, unknown>, chiaveOperazione: string) {
    setOperando(chiaveOperazione);
    setRisultato(null);
    try {
      const response = await fetch(`/api/amministratore/utenti/${utente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Operazione non riuscita.");
      }
      const aggiornato = json?.data?.utente as Utente | undefined;
      if (aggiornato) {
        setUtente(aggiornato);
        onAggiornato(aggiornato);
      }
      return true;
    } catch (caught) {
      setRisultato({
        tipo: "errore",
        messaggio: caught instanceof Error ? caught.message : "Errore sconosciuto.",
      });
      return false;
    } finally {
      setOperando(null);
    }
  }

  const ruoliMancanti = useMemo(() => {
    const posseduti = new Set(utente.ruoli);
    // Il ruolo amministratore NON è mai assegnabile dal pannello (il server
    // lo riserva all'email autorizzata, che è anche l'unico account protetto).
    return (["commerciante", "utente"] as RuoloUtente[]).filter(
      (ruolo) => !posseduti.has(ruolo)
    );
  }, [utente.ruoli]);

  async function aggiungiRuolo(ruolo: RuoloUtente) {
    const ok = await patch({ aggiungiRuolo: ruolo }, `aggiungi:${ruolo}`);
    if (ok) {
      setRisultato({
        tipo: "ok",
        messaggio: `Ruolo "${RUOLI_UTENTE[ruolo].label}" aggiunto.`,
      });
    }
  }

  async function rimuoviRuolo(ruolo: RuoloUtente) {
    const ok = await patch({ rimuoviRuolo: ruolo }, `rimuovi:${ruolo}`);
    if (ok) {
      setRisultato({
        tipo: "ok",
        messaggio: `Ruolo "${RUOLI_UTENTE[ruolo].label}" rimosso.`,
      });
    }
  }

  async function sospendi() {
    const ok = await patch(
      { sospendi: { motivo: motivo.trim() || null, giorni } },
      "sospendi"
    );
    if (ok) {
      setSospendiAperto(false);
      setMotivo("");
      setGiorni(7);
      setRisultato({
        tipo: "ok",
        messaggio: `Account sospeso per ${giorni} giorni.`,
      });
    }
  }

  async function banna() {
    const ok = await patch({ banna: { motivo: motivo.trim() || null } }, "banna");
    if (ok) {
      setBannaAperto(false);
      setMotivo("");
      setRisultato({ tipo: "ok", messaggio: "Account bannato permanentemente." });
    }
  }

  async function riattiva() {
    const ok = await patch({ riattiva: true }, "riattiva");
    if (ok) {
      setRisultato({ tipo: "ok", messaggio: "Account riattivato." });
    }
  }

  async function resetPassword() {
    const ok = await patch({ resetPassword: true }, "resetPassword");
    if (ok) {
      setRisultato({
        tipo: "ok",
        messaggio: "Link di reset password inviato via email.",
      });
    }
  }

  async function salvaNome() {
    const nome = nomeInput.trim();
    if (!nome) {
      setRisultato({ tipo: "errore", messaggio: "Il nome non può essere vuoto." });
      return;
    }
    const ok = await patch({ profilo: { nome } }, "profilo");
    if (ok) {
      setModificaNome(false);
      setRisultato({ tipo: "ok", messaggio: "Nome profilo aggiornato." });
    }
  }

  async function eliminaDefinitivamente() {
    setOperando("elimina");
    setRisultato(null);
    try {
      const response = await fetch(`/api/amministratore/utenti/${utente.id}`, {
        method: "DELETE",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(json?.error?.message ?? "Impossibile eliminare l'account.");
      }
      onEliminato(utente.id);
      onChiuso();
    } catch (caught) {
      setRisultato({
        tipo: "errore",
        messaggio: caught instanceof Error ? caught.message : "Errore sconosciuto.",
      });
      setConfermaElimina(false);
    } finally {
      setOperando(null);
    }
  }

  const statoCorrente = STATO_ACCOUNT[utente.stato];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dettaglio-utente-titolo"
        className="my-4 w-full max-w-2xl rounded-[2rem] border border-white/70 bg-white p-6 shadow-2xl md:p-8"
      >
        {/* ── Intestazione ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-black text-white">
              {utente.nome
                .split(" ")
                .map((p) => p.charAt(0))
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                Gestione account
              </p>
              <h2
                id="dettaglio-utente-titolo"
                className="mt-0.5 truncate text-xl font-black text-slate-900"
              >
                {utente.nome}
              </h2>
              <p className="truncate text-sm text-slate-500">{utente.email}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Chiudi dettaglio utente"
            onClick={onChiuso}
            className="rounded-xl border border-blue-200 bg-blue-50 p-2 text-blue-600 transition hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* ── Badge stato/ruoli/verifica ───────────────────────────────── */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${statoCorrente.chip}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statoCorrente.dot}`} aria-hidden />
            Account {statoCorrente.label.toLowerCase()}
          </span>
          {utente.ruoli.map((ruolo) => (
            <span
              key={ruolo}
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${RUOLI_UTENTE[ruolo].chip}`}
            >
              {RUOLI_UTENTE[ruolo].label}
            </span>
          ))}
          {utente.emailVerificata ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
              <BadgeCheck className="h-3 w-3" aria-hidden /> Email verificata
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
              <MailX className="h-3 w-3" aria-hidden /> Email non verificata
            </span>
          )}
          {protetto && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
              <ShieldAlert className="h-3 w-3" aria-hidden /> Account protetto
            </span>
          )}
        </div>

        {risultato && (
          <p
            role={risultato.tipo === "errore" ? "alert" : "status"}
            className={`mt-4 rounded-xl px-3 py-2 text-sm font-semibold ${
              risultato.tipo === "errore"
                ? "bg-red-50 text-red-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {risultato.tipo === "ok" && (
              <Check className="mr-1 inline h-4 w-4" aria-hidden />
            )}
            {risultato.messaggio}
          </p>
        )}

        {/* ── Avviso account protetto ─────────────────────────────────── */}
        {protetto && (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
            <p className="leading-6">
              Questo è l&apos;account amministratore autorizzato della piattaforma:
              ruolo, stato e account non possono essere modificati dal pannello.
            </p>
          </div>
        )}

        {/* ── Informazioni account ────────────────────────────────────── */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Registrato il
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {formatta(utente.registratoIl)}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Ultimo accesso
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {formatta(utente.ultimoAccesso)}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Negozi gestiti
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {utente.numeroNegozi}
            </p>
          </div>
        </div>

        {/* ── Blocco in corso ─────────────────────────────────────────── */}
        {utente.blocco && (
          <div
            className={`mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl px-4 py-3 text-sm ${
              utente.stato === "sospeso"
                ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
                : "bg-red-50 text-red-900 ring-1 ring-red-200"
            }`}
          >
            <span className="inline-flex items-center gap-1.5 font-bold">
              <CalendarClock className="h-4 w-4" aria-hidden />
              {utente.stato === "sospeso"
                ? "Sospensione in corso"
                : "Ban permanente in corso"}
            </span>
            {utente.blocco.motivo && (
              <span className="font-semibold">Motivo: {utente.blocco.motivo}</span>
            )}
            <span className="text-xs font-semibold opacity-80">
              dal {formatta(utente.blocco.iniziatoIl)}
            </span>
            {utente.stato === "sospeso" && utente.blocco.finoAl && (
              <span className="text-xs font-semibold opacity-80">
                fino al {formatta(utente.blocco.finoAl)}
              </span>
            )}
          </div>
        )}

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {/* ── Ruoli (multi-ruolo esplicito) ─────────────────────────── */}
          <section className="rounded-2xl border border-slate-100 p-4">
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-800">
              <UserRoundCheck className="h-4 w-4 text-blue-600" aria-hidden />
              Ruoli
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {utente.ruoli.map((ruolo) => (
                <span
                  key={ruolo}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ${RUOLI_UTENTE[ruolo].chip}`}
                >
                  {RUOLI_UTENTE[ruolo].label}
                  {!protetto && utente.ruoli.length > 1 && (
                    <button
                      type="button"
                      disabled={operando !== null}
                      aria-label={`Rimuovi ruolo ${RUOLI_UTENTE[ruolo].label}`}
                      title={`Rimuovi ruolo ${RUOLI_UTENTE[ruolo].label}`}
                      onClick={() => void rimuoviRuolo(ruolo)}
                      className="rounded-full p-0.5 transition hover:bg-white/70 disabled:opacity-40"
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {!protetto && ruoliMancanti.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Aggiungi ruolo
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {ruoliMancanti.map((ruolo) => (
                    <button
                      key={ruolo}
                      type="button"
                      disabled={operando !== null}
                      onClick={() => void aggiungiRuolo(ruolo)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-blue-300 px-3 py-1 text-xs font-bold text-blue-700 transition hover:border-blue-400 hover:bg-blue-50 disabled:opacity-40"
                    >
                      + {RUOLI_UTENTE[ruolo].label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-4 text-slate-400">
                  Il ruolo amministratore è riservato all&apos;account autorizzato
                  e non è assegnabile dal pannello.
                </p>
              </div>
            )}
          </section>

          {/* ── Stato account ─────────────────────────────────────────── */}
          <section className="rounded-2xl border border-slate-100 p-4">
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-800">
              <UserRoundCheck className="h-4 w-4 text-blue-600" aria-hidden />
              Stato account
            </h3>
            <div className="mt-3 space-y-2">
              {utente.stato === "attivo" && (
                <>
                  <button
                    type="button"
                    disabled={protetto || operando !== null}
                    onClick={() => setSospendiAperto((v) => !v)}
                    className="w-full rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 transition hover:border-amber-400 hover:bg-amber-100 disabled:opacity-40"
                  >
                    Sospendi
                  </button>
                  {sospendiAperto && (
                    <div className="space-y-2 rounded-xl bg-amber-50/60 p-3">
                      <input
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="Motivo (facoltativo)"
                        maxLength={200}
                        aria-label="Motivo sospensione"
                        className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-amber-400"
                      />
                      <label className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                        Durata (giorni)
                        <input
                          type="number"
                          min={1}
                          max={3650}
                          value={giorni}
                          onChange={(e) => setGiorni(Number(e.target.value))}
                          aria-label="Durata sospensione in giorni"
                          className="w-24 rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-amber-400"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={operando !== null}
                        onClick={() => void sospendi()}
                        className="w-full rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
                      >
                        {operando === "sospendi" ? (
                          <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          "Conferma sospensione"
                        )}
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={protetto || operando !== null}
                    onClick={() => setBannaAperto((v) => !v)}
                    className="w-full rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:border-red-400 hover:bg-red-100 disabled:opacity-40"
                  >
                    Banna permanentemente
                  </button>
                  {bannaAperto && (
                    <div className="space-y-2 rounded-xl bg-red-50/60 p-3">
                      <input
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="Motivo (facoltativo)"
                        maxLength={200}
                        aria-label="Motivo ban"
                        className="w-full rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-red-400"
                      />
                      <button
                        type="button"
                        disabled={operando !== null}
                        onClick={() => void banna()}
                        className="w-full rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                      >
                        {operando === "banna" ? (
                          <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          "Conferma ban"
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
              {utente.stato !== "attivo" && (
                <button
                  type="button"
                  disabled={operando !== null}
                  onClick={() => void riattiva()}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-100 disabled:opacity-40"
                >
                  {operando === "riattiva" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Riattiva account
                </button>
              )}
            </div>
          </section>
        </div>

        {/* ── Negozi associati ────────────────────────────────────────── */}
        <section className="mt-5 rounded-2xl border border-slate-100 p-4">
          <h3 className="flex items-center gap-2 text-sm font-black text-slate-800">
            <Store className="h-4 w-4 text-blue-600" aria-hidden />
            Negozi associati
          </h3>
          {utente.negozi.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">
              Nessun negozio associato a questo account.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {utente.negozi.map((negozio) => (
                <li key={negozio.id}>
                  <Link
                    href={`/amministratore/negozi/${negozio.id}`}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-yellow-50 hover:text-yellow-800"
                  >
                    <Store className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
                    <span className="truncate">{negozio.nome}</span>
                    {negozio.attivo ? (
                      <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        Attivo
                      </span>
                    ) : (
                      <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                        Disattivato
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Account: reset password + nome ──────────────────────────── */}
        <section className="mt-5 rounded-2xl border border-slate-100 p-4">
          <h3 className="flex items-center gap-2 text-sm font-black text-slate-800">
            <KeyRound className="h-4 w-4 text-blue-600" aria-hidden />
            Account e sicurezza
          </h3>
          <div className="mt-3 space-y-3">
            {modificaNome ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={nomeInput}
                  onChange={(e) => setNomeInput(e.target.value)}
                  maxLength={120}
                  aria-label="Nuovo nome completo"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
                <button
                  type="button"
                  disabled={operando !== null}
                  onClick={() => void salvaNome()}
                  className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {operando === "profilo" ? "Salvataggio..." : "Salva nome"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModificaNome(false);
                    setNomeInput(utente.nome);
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500"
                >
                  Annulla
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={operando !== null}
                onClick={() => setModificaNome(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Modifica nome profilo
              </button>
            )}
            <button
              type="button"
              disabled={protetto || operando !== null}
              onClick={() => void resetPassword()}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 disabled:opacity-40"
            >
              {operando === "resetPassword" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <KeyRound className="h-3.5 w-3.5" aria-hidden />
              )}
              Invia link di reset password
            </button>
          </div>
        </section>

        {/* ── Eliminazione definitiva ─────────────────────────────────── */}
        {!protetto && (
          <section className="mt-5 rounded-2xl border border-red-100 bg-red-50/40 p-4">
            <h3 className="flex items-center gap-2 text-sm font-black text-red-800">
              <UserRoundX className="h-4 w-4" aria-hidden />
              Zona pericolosa
            </h3>
            <p className="mt-1 text-xs leading-5 text-red-600">
              Elimina definitivamente l&apos;account e tutti i suoi dati (Auth
              Admin API). Azione irreversibile.
            </p>
            {confermaElimina ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold text-red-800">
                  Eliminare definitivamente «{utente.email}»?
                </p>
                <button
                  type="button"
                  disabled={operando !== null}
                  onClick={() => void eliminaDefinitivamente()}
                  className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  {operando === "elimina" ? (
                    <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    "Sì, elimina definitivamente"
                  )}
                </button>
                <button
                  type="button"
                  disabled={operando !== null}
                  onClick={() => setConfermaElimina(false)}
                  className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700"
                >
                  Annulla
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfermaElimina(true)}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-40"
              >
                <Ban className="h-3.5 w-3.5" aria-hidden />
                Elimina definitivamente
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
