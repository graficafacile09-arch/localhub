"use client";

import { useState, useEffect, useRef } from "react";
import { CalendarCheck, CalendarClock, ChevronDown, ChevronUp, X } from "lucide-react";
import ModuleShell from "./ModuleShell";
import { Field, Toggle, SaveBar, type StatoSalvataggio } from "./ModuleFields";
import type { ConfigPrenotazioni } from "@/types/negozio";

type Props = { storeId: string };

/** Default v1 della configurazione prenotazioni (Fase 6e). */
const DEFAULT: ConfigPrenotazioni = {
  attiva: false,
  anticipo_min_ore: 1,
  anticipo_max_giorni: 30,
  buffer_min: 0,
  limite_giornaliero: null,
  passo_slot_min: 15,
};

function normalizza(raw: unknown): ConfigPrenotazioni {
  if (!raw || typeof raw !== "object") return { ...DEFAULT };
  const r = raw as Partial<ConfigPrenotazioni>;
  const num = (v: unknown, fb: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fb;
  return {
    attiva: r.attiva === true,
    anticipo_min_ore: num(r.anticipo_min_ore, DEFAULT.anticipo_min_ore),
    anticipo_max_giorni: num(r.anticipo_max_giorni, DEFAULT.anticipo_max_giorni),
    buffer_min: num(r.buffer_min, DEFAULT.buffer_min),
    limite_giornaliero:
      typeof r.limite_giornaliero === "number" && Number.isFinite(r.limite_giornaliero)
        ? r.limite_giornaliero
        : null,
    passo_slot_min: num(r.passo_slot_min, DEFAULT.passo_slot_min),
  };
}

type PrenotazioneRow = {
  id: string;
  numero: string;
  servizio_nome: string;
  durata_min: number;
  giorno: string;
  ora_inizio: string;
  ora_fine: string;
  cliente_nome: string;
  cliente_cognome: string;
  cliente_email: string | null;
  cliente_telefono: string | null;
  note: string | null;
  stato: string;
};

const STATI = ["confermata", "cancellata", "effettuata", "no_show"];
const STATI_LABEL: Record<string, string> = {
  confermata: "Confermata",
  cancellata: "Cancellata",
  effettuata: "Effettuata",
  no_show: "No show",
};
const STATO_COLORE: Record<string, string> = {
  confermata: "bg-emerald-50 text-emerald-700",
  cancellata: "bg-red-50 text-red-700",
  effettuata: "bg-blue-50 text-blue-700",
  no_show: "bg-amber-50 text-amber-700",
};

function oraShort(ora: string): string {
  return String(ora ?? "").slice(0, 5);
}

export default function PrenotazioniModule({ storeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ConfigPrenotazioni>({ ...DEFAULT });
  const [original, setOriginal] = useState(JSON.stringify({ ...DEFAULT }));
  const [messaggio, setMessaggio] = useState<StatoSalvataggio>(null);

  // Elenco prenotazioni (API Fase 6d)
  const [prenotazioni, setPrenotazioni] = useState<PrenotazioneRow[]>([]);
  const [elencoLoading, setElencoLoading] = useState(false);
  const [filtroGiorno, setFiltroGiorno] = useState("");
  const [filtroStato, setFiltroStato] = useState("");
  const [erroreElenco, setErroreElenco] = useState("");
  const [rilassato, setRilassato] = useState<Record<string, boolean>>({});

  /** Come in RichiestaInfoModule/ServiziModule: un fetch asincrono non deve
   *  sovrascrivere le modifiche in corso. */
  const editedRef = useRef(false);

  async function caricaElenco() {
    setElencoLoading(true);
    setErroreElenco("");
    try {
      const params = new URLSearchParams();
      if (filtroGiorno) params.set("giorno", filtroGiorno);
      if (filtroStato) params.set("stato", filtroStato);
      const qs = params.toString();
      const res = await fetch(
        `/api/merchant/stores/${storeId}/prenotazioni${qs ? `?${qs}` : ""}`
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setErroreElenco(json?.error?.message ?? "Impossibile caricare le prenotazioni.");
        setPrenotazioni([]);
        return;
      }
      setPrenotazioni((json.data?.prenotazioni ?? []) as PrenotazioneRow[]);
    } catch {
      setErroreElenco("Errore di rete. Riprova.");
      setPrenotazioni([]);
    } finally {
      setElencoLoading(false);
    }
  }

  useEffect(() => {
    let attivo = true;
    fetch(`/api/merchant/stores/${storeId}/settings`)
      .then((r) => r.json())
      .then((json) => {
        if (!attivo) return;
        setLoading(false);
        if (!json.success) return;
        if (editedRef.current) return;
        const data = (json.data.settings.data ?? {}) as Record<string, unknown>;
        const configNormalizzata = normalizza(data.prenotazioni_config);
        setConfig(configNormalizzata);
        setOriginal(JSON.stringify(configNormalizzata));
      })
      .catch(() => {
        if (attivo) setLoading(false);
      });
    return () => {
      attivo = false;
    };
  }, [storeId]);

  useEffect(() => {
    void caricaElenco();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, filtroGiorno, filtroStato]);

  const dirty = JSON.stringify(config) !== original;

  useEffect(() => {
    if (dirty) setMessaggio(null);
  }, [dirty]);

  function update(patch: Partial<ConfigPrenotazioni>) {
    editedRef.current = true;
    setConfig((prev) => ({ ...prev, ...patch }));
  }

  async function handleSave() {
    setSaving(true);
    setMessaggio(null);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { prenotazioni_config: config } }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setMessaggio({
          tipo: "errore",
          testo: json?.error?.message ?? "Salvataggio non riuscito. Riprova.",
        });
        return;
      }
      setOriginal(JSON.stringify(config));
      setMessaggio({ tipo: "ok", testo: "Modifiche salvate." });
    } catch {
      setMessaggio({ tipo: "errore", testo: "Errore di rete. Riprova." });
    } finally {
      setSaving(false);
    }
  }

  /** Annulla una prenotazione (PUT azione annulla). */
  async function annullaPrenotazione(id: string) {
    const res = await fetch(`/api/merchant/stores/${storeId}/prenotazioni/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ azione: "annulla", motivo: "Annullata dal negozio" }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      window.alert(json?.error?.message ?? "Impossibile annullare la prenotazione.");
      return;
    }
    void caricaElenco();
  }

  /** Sposta una prenotazione (PUT azione sposta) con i nuovi valori inseriti. */
  async function spostaPrenotazione(id: string) {
    const giornoInput = document.getElementById(`sposta-giorno-${id}`) as HTMLInputElement | null;
    const oraInput = document.getElementById(`sposta-ora-${id}`) as HTMLInputElement | null;
    const nuoGiorno = giornoInput?.value ?? "";
    const nuovaOra = oraInput?.value ?? "";
    if (!nuoGiorno || !nuovaOra) {
      window.alert("Seleziona giorno e ora per lo spostamento.");
      return;
    }
    const res = await fetch(`/api/merchant/stores/${storeId}/prenotazioni/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ azione: "sposta", nuovoGiorno: nuoGiorno, nuovaOra: nuovaOra }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      window.alert(json?.error?.message ?? "Impossibile spostare la prenotazione.");
      return;
    }
    setRilassato((r) => ({ ...r, [id]: false }));
    void caricaElenco();
  }

  if (loading) {
    return (
      <ModuleShell
        icon={<CalendarCheck className="h-4 w-4" />}
        title="Agenda"
        subtitle="Ricevi e gestisci gli appuntamenti dei clienti."
        id="prenotazioni"
      >
        <p className="text-sm text-slate-400">Caricamento...</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      icon={<CalendarCheck className="h-4 w-4" />}
      title="Agenda"
      subtitle="Ricevi e gestisci gli appuntamenti dei clienti."
      id="prenotazioni"
    >
      <div className="space-y-4">
        <Toggle
          icon={<CalendarCheck className="h-4 w-4 text-blue-600" />}
          label="Attiva agenda"
          description="Consenti ai clienti di prenotare i tuoi servizi"
          checked={config.attiva}
          onChange={(v) => update({ attiva: v })}
        />

        {config.attiva && (
          <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Parametri della prenotazione
            </p>

            <Field
              label="Anticipo minimo (ore)"
              type="number"
              value={String(config.anticipo_min_ore)}
              onChange={(v) => update({ anticipo_min_ore: numDaiStringa(v, 0) })}
            />
            <Field
              label="Anticipo massimo (giorni)"
              type="number"
              value={String(config.anticipo_max_giorni)}
              onChange={(v) => update({ anticipo_max_giorni: numDaiStringa(v, 1) })}
            />
            <Field
              label="Buffer (minuti)"
              type="number"
              value={String(config.buffer_min)}
              onChange={(v) => update({ buffer_min: numDaiStringa(v, 0) })}
            />
            <Field
              label="Passo slot (minuti)"
              type="number"
              value={String(config.passo_slot_min)}
              onChange={(v) => update({ passo_slot_min: numDaiStringa(v, 15) })}
            />
            <Field
              label="Limite giornaliero (vuoto = nessun limite)"
              type="number"
              value={config.limite_giornaliero == null ? "" : String(config.limite_giornaliero)}
              onChange={(v) => {
                const t = v.trim();
                update({ limite_giornaliero: t === "" ? null : numDaiStringa(t, 0) });
              }}
              placeholder="es. 20"
            />
            <p className="text-[10px] leading-4 text-slate-400">
              Il limite giornaliero conta solo le prenotazioni confermate. Lascia
              vuoto per nessun limite.
            </p>
          </div>
        )}

        {/* ── Elenco prenotazioni ─────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-blue-600" />
            <p className="text-sm font-bold tracking-tight text-slate-900">
              Appuntamenti
            </p>
          </div>

          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="date"
              value={filtroGiorno}
              onChange={(e) => setFiltroGiorno(e.target.value)}
              aria-label="Filtra per giorno"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-44"
            />
            <select
              value={filtroStato}
              onChange={(e) => setFiltroStato(e.target.value)}
              aria-label="Filtra per stato"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-40"
            >
              <option value="">Tutti gli stati</option>
              {STATI.map((s) => (
                <option key={s} value={s}>{STATI_LABEL[s]}</option>
              ))}
            </select>
            {(filtroGiorno || filtroStato) && (
              <button
                type="button"
                onClick={() => {
                  setFiltroGiorno("");
                  setFiltroStato("");
                }}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" /> Azzera filtri
              </button>
            )}
          </div>

          {erroreElenco && (
            <p className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {erroreElenco}
            </p>
          )}

          {elencoLoading ? (
            <p className="py-4 text-center text-sm text-slate-400">Caricamento...</p>
          ) : prenotazioni.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              Nessuna prenotazione da mostrare.
            </p>
          ) : (
            <ul className="space-y-2">
              {prenotazioni.map((p) => {
                const colore = STATO_COLORE[p.stato] ?? "bg-slate-50 text-slate-700";
                return (
                  <li
                    key={p.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/50 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        {p.cliente_nome} {p.cliente_cognome}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${colore}`}>
                        {STATI_LABEL[p.stato] ?? p.stato}
                      </span>
                      <span className="ml-auto text-xs font-semibold text-slate-500">
                        {p.giorno} · {oraShort(p.ora_inizio)}–{oraShort(p.ora_fine)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {p.servizio_nome}
                      {p.durata_min ? ` · ${p.durata_min} min` : ""}
                      {p.cliente_email ? ` · ${p.cliente_email}` : ""}
                      {p.cliente_telefono ? ` · ${p.cliente_telefono}` : ""}
                    </p>

                    {p.stato === "confermata" && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Annullare questa prenotazione?")) {
                              void annullaPrenotazione(p.id);
                            }
                          }}
                          className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-[11px] font-bold text-red-700 transition hover:bg-red-50"
                        >
                          Annulla
                        </button>
                        <button
                          type="button"
                          onClick={() => setRilassato((r) => ({ ...r, [p.id]: !r[p.id] }))}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
                        >
                          Sposta
                          {rilassato[p.id] ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    )}

                    {rilassato[p.id] && p.stato === "confermata" && (
                      <div className="mt-2 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-end">
                        <label className="flex-1">
                          <span className="mb-1 block text-[10px] font-semibold text-slate-500">Nuovo giorno</span>
                          <input
                            id={`sposta-giorno-${p.id}`}
                            type="date"
                            defaultValue={p.giorno}
                            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
                        </label>
                        <label className="flex-1">
                          <span className="mb-1 block text-[10px] font-semibold text-slate-500">Nuova ora</span>
                          <input
                            id={`sposta-ora-${p.id}`}
                            type="time"
                            defaultValue={oraShort(p.ora_inizio)}
                            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void spostaPrenotazione(p.id)}
                          className="h-10 shrink-0 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white transition hover:bg-blue-700"
                        >
                          Conferma spostamento
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <SaveBar saving={saving} onSave={handleSave} dirty={dirty} messaggio={messaggio} />
    </ModuleShell>
  );
}

function numDaiStringa(v: string, fb: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}