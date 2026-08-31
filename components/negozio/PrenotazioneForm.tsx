"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
} from "lucide-react";
import type { ConfigPrenotazioni, ServizioStrutturato } from "@/types/negozio";
import {
  linkWhatsAppVerificaPrenotazione,
  type DatiVerificaWhatsAppPrenotazione,
} from "@/lib/prenotazione-verifica-whatsapp";

const TIMEZONE = "Europe/Rome";

type Slot = { oraInizio: string; oraFine: string };

type Props = {
  slug: string;
  /** Servizi attivi e prenotabili del negozio (nome, id, durata_min). */
  servizi: ServizioStrutturato[];
  config: ConfigPrenotazioni;
  /** Servizio già preselezionato (es. dalla card). */
  servizioIniziale?: string;
  /**
   * Numero WhatsApp del negozio corrente (negozi.whatsapp, fallback
   * negozi.telefono). Vuoto → il pulsante "VERIFICA SU WHATSAPP" non compare.
   */
  whatsapp?: string;
};

/** Data civile YYYY-MM-DD in Europe/Rome per un Date assoluto. */
function dataCivileDaDate(data: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(data);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

function aggiungiGiorni(iso: string, giorni: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + giorni);
  return dataCivileDaDate(d);
}

function labelGiorno(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

export default function PrenotazioneForm({
  slug,
  servizi,
  config,
  servizioIniziale,
  whatsapp = "",
}: Props) {
  const oggi = useMemo(() => dataCivileDaDate(new Date()), []);
  // min: oggi + anticipo_min_ore (arrotondato al giorno successivo se >0)
  const giorniMin = config.anticipo_min_ore > 0 ? Math.ceil(config.anticipo_min_ore / 24) : 0;
  const minDate = aggiungiGiorni(oggi, Math.max(1, giorniMin));
  const maxDate = aggiungiGiorni(oggi, Math.max(1, Math.round(config.anticipo_max_giorni) || 30));

  const [servizioId, setServizioId] = useState<string>(() => {
    // Se non c'è preselezione ma c'è un solo servizio, selezionalo di default
    const preselezionato =
      servizioIniziale && servizi.some((s) => s.id === servizioIniziale)
        ? servizioIniziale
        : "";
    return preselezionato || (servizi.length === 1 && servizi[0]?.id ? servizi[0].id : "");
  });
  const [giorno, setGiorno] = useState("");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [slotList, setSlotList] = useState<Slot[]>([]);
  const [loadingSlot, setLoadingSlot] = useState(false);
  const [slotErrore, setSlotErrore] = useState("");

  // Dati cliente
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  // Honeypot (come API Fase 6d)
  const [website, setWebsite] = useState("");
  const [company, setCompany] = useState("");
  const [fax, setFax] = useState("");

  const [inviando, setInviando] = useState(false);
  const [fatto, setFatto] = useState<{
    numero: string;
    servizioNome: string;
    giorno: string;
    ora: string;
    cliente: string;
  } | null>(null);
  const [errore, setErrore] = useState("");
  const [slotOccupato, setSlotOccupato] = useState(false);

  const servizio = servizi.find((s) => s.id === servizioId) ?? null;
  const puòProcedereDati = !!slug && !!servizioId && !!giorno && !!slot;

  // Carica la disponibilità quando cambia giorno O servizio
  useEffect(() => {
    if (!servizioId || !giorno) {
      setSlotList([]);
      setSlot(null);
      setSlotErrore("");
      return;
    }
    let attivo = true;
    setLoadingSlot(true);
    setSlotErrore("");
    setSlot(null);
    setSlotList([]);
    fetch(
      `/api/negozi/${slug}/prenotazioni/disponibilita?servizioId=${encodeURIComponent(
        servizioId
      )}&giorno=${giorno}`
    )
      .then((r) => r.json())
      .then((json) => {
        if (!attivo) return;
        setLoadingSlot(false);
        if (!json.success) {
          setSlotErrore(
            json?.error?.message ?? "Impossibile caricare gli orari disponibili."
          );
          return;
        }
        setSlotList((json.data?.slot ?? []) as Slot[]);
        if ((json.data?.slot ?? []).length === 0) {
          setSlotErrore(
            "In questo giorno non ci sono orari disponibili per questo servizio."
          );
        }
      })
      .catch(() => {
        if (!attivo) return;
        setLoadingSlot(false);
        setSlotErrore("Errore di rete durante il caricamento degli orari.");
      });
    return () => {
      attivo = false;
    };
  }, [servizioId, giorno, slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrore("");
    setSlotOccupato(false);

    // Validazione client (migliora UX; il server resta autoritativo)
    if (!servizio || !giorno || !slot) {
      setErrore("Seleziona servizio, giorno e orario per continuare.");
      return;
    }
    if (!nome.trim() || !cognome.trim()) {
      setErrore("Inserisci nome e cognome.");
      return;
    }
    if (!telefono.trim() && !email.trim()) {
      setErrore("Inserisci almeno un recapito (telefono o email).");
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrore("L'email inserita non è valida.");
      return;
    }

    setInviando(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(`/api/negozi/${slug}/prenotazioni`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          servizioId,
          giorno,
          oraInizio: slot.oraInizio,
          nome: nome.trim(),
          cognome: cognome.trim(),
          telefono: telefono.trim() || null,
          email: email.trim() ? email.trim().toLowerCase() : null,
          note: note.trim() ? note.trim() : null,
          website,
          company,
          fax,
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        const codice = json?.error?.code;
        if (codice === "SLOT_OCCUPATO") {
          setSlotOccupato(true);
          // ricarica disponibilità e azzera la selezione
          setSlot(null);
          if (giorno) {
            const r2 = await fetch(
              `/api/negozi/${slug}/prenotazioni/disponibilita?servizioId=${encodeURIComponent(
                servizioId
              )}&giorno=${giorno}`
            );
            const j2 = await r2.json().catch(() => null);
            if (j2?.success) {
              setSlotList((j2.data?.slot ?? []) as Slot[]);
            }
          }
          return;
        }
        setErrore(
          json?.error?.message ??
            "Non è stato possibile completare la prenotazione. Riprova tra poco."
        );
        return;
      }

      // success / giaEsistente (idempotente)
      const p = json.data?.prenotazione;
      setFatto({
        numero: String(p?.numero ?? p?.id ?? ""),
        servizioNome: String(p?.servizioNome ?? servizio.nome),
        giorno: String(p?.giorno ?? giorno),
        ora: String(p?.oraInizio ?? slot.oraInizio).slice(0, 5),
        cliente: `${nome.trim()} ${cognome.trim()}`,
      });
    } catch {
      setErrore("Errore di connessione. Riprova tra poco.");
    } finally {
      setInviando(false);
    }
  }

  // ── Schermata di conferma ──────────────────────────────────────────────
  if (fatto) {
    // Link di verifica via WhatsApp SOLO se il negozio corrente ha un numero.
    const datiVerifica: DatiVerificaWhatsAppPrenotazione = {
      numero: fatto.numero,
      servizio: fatto.servizioNome,
      giorno: fatto.giorno,
      ora: fatto.ora,
    };
    const whatsappUrl = linkWhatsAppVerificaPrenotazione(whatsapp, datiVerifica);

    return (
      <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
        <CheckCircle2 className="h-11 w-11 text-emerald-500" />
        <p className="text-sm font-black text-slate-900">Prenotazione confermata</p>
        <div className="w-full space-y-1 rounded-xl bg-slate-50 p-3 text-left text-xs leading-5 text-slate-600">
          {fatto.numero && (
            <p>
              <span className="font-bold text-slate-800">Numero: </span>
              {fatto.numero}
            </p>
          )}
          <p>
            <span className="font-bold text-slate-800">Servizio: </span>
            {fatto.servizioNome}
          </p>
          <p>
            <span className="font-bold text-slate-800">Giorno: </span>
            {labelGiorno(fatto.giorno)}
          </p>
          <p>
            <span className="font-bold text-slate-800">Ora: </span>
            {fatto.ora}
          </p>
          <p>
            <span className="font-bold text-slate-800">Cliente: </span>
            {fatto.cliente}
          </p>
        </div>
        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-whatsapp px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-whatsapp-dark hover:shadow-md"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            VERIFICA SU WHATSAPP
          </a>
        )}
        <p className="text-[11px] leading-4 text-slate-400">
          Il negozio ti ricontatterà per confermare i dettagli.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4" noValidate>
      {/* Honeypot nascosto (come API Fase 6d) */}
      <div className="hidden" aria-hidden="true">
        <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
        <input type="text" tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} name="company" />
        <input type="text" tabIndex={-1} autoComplete="off" value={fax} onChange={(e) => setFax(e.target.value)} name="fax" />
      </div>

      {/* STEP 1 — Servizio */}
      {servizi.length > 1 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-slate-500">1 · Servizio</p>
          <div className="space-y-1.5">
            {servizi.map((s) => (
              <label
                key={s.id ?? s.nome}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  servizioId === s.id
                    ? "border-blue-400 bg-blue-50 text-blue-800"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-200"
                }`}
              >
                <input
                  type="radio"
                  name="servizio"
                  value={s.id}
                  checked={servizioId === s.id}
                  onChange={() => {
                    setServizioId(s.id ?? "");
                    setSlot(null);
                    setSlotList([]);
                  }}
                  className="h-3.5 w-3.5 shrink-0 accent-blue-600"
                />
                <span className="min-w-0 flex-1">{s.nome}</span>
                {s.durata_min ? (
                  <span className="shrink-0 text-[11px] font-bold text-slate-400">
                    {s.durata_min} min
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        </div>
      )}
      {servizi.length === 1 && servizi[0] && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
          <p className="text-sm font-bold text-slate-900">
            {servizi[0].nome}
            {servizi[0].durata_min ? ` · ${servizi[0].durata_min} min` : ""}
          </p>
        </div>
      )}

      {/* STEP 2 — Giorno */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-slate-500">2 · Giorno</p>
        <input
          type="date"
          value={giorno}
          min={minDate}
          max={maxDate}
          onChange={(e) => {
            setGiorno(e.target.value);
            setSlot(null);
          }}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <p className="mt-1 text-[10px] leading-4 text-slate-400">
          Puoi prenotare tra {labelGiorno(minDate)} e {labelGiorno(maxDate)}.
        </p>
      </div>

      {/* STEP 3 — Orario */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-slate-500">3 · Orario</p>
        {loadingSlot ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-100 bg-slate-50 py-6 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Caricamento orari...
          </div>
        ) : slotList.length > 0 ? (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {slotList.map((s) => (
              <button
                key={s.oraInizio}
                type="button"
                onClick={() => setSlot(s)}
                className={`rounded-xl border px-2 py-2 text-xs font-bold transition ${
                  slot?.oraInizio === s.oraInizio
                    ? "border-yellow-400 bg-yellow-400 text-blue-900"
                    : "border-slate-200 bg-white text-slate-700 hover:border-yellow-300 hover:bg-yellow-50"
                }`}
              >
                {s.oraInizio.slice(0, 5)}
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">
            {slotErrore || "Scegli un giorno per vedere gli orari disponibili."}
          </p>
        )}
      </div>

      {/* STEP 4 — Dati cliente */}
      <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
        <p className="text-[11px] font-semibold text-slate-500">4 · I tuoi dati</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pren-nome" className="mb-1 block text-[11px] font-semibold text-slate-500">
              Nome <span className="text-blue-400">*</span>
            </label>
            <input
              id="pren-nome"
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={80}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label htmlFor="pren-cognome" className="mb-1 block text-[11px] font-semibold text-slate-500">
              Cognome <span className="text-blue-400">*</span>
            </label>
            <input
              id="pren-cognome"
              type="text"
              value={cognome}
              onChange={(e) => setCognome(e.target.value)}
              maxLength={80}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pren-email" className="mb-1 block text-[11px] font-semibold text-slate-500">
              Email
            </label>
            <input
              id="pren-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={200}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label htmlFor="pren-telefono" className="mb-1 block text-[11px] font-semibold text-slate-500">
              Telefono
            </label>
            <input
              id="pren-telefono"
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              maxLength={30}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
        <p className="text-[10px] leading-4 text-slate-400">
          Inserisci almeno un recapito (telefono o email).
        </p>
        <div>
          <label htmlFor="pren-note" className="mb-1 block text-[11px] font-semibold text-slate-500">
            Note (opzionale)
          </label>
          <textarea
            id="pren-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {slotOccupato && (
        <p className="flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-4 text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Questo orario è già occupato. Scegli un altro orario.
        </p>
      )}
      {errore && !slotOccupato && (
        <p className="flex items-start gap-1.5 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {errore}
        </p>
      )}

      <button
        type="submit"
        disabled={inviando || !puòProcedereDati}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 px-6 py-3 text-xs font-bold text-blue-900 transition hover:bg-yellow-300 disabled:opacity-50"
      >
        {inviando ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Invio in corso...
          </>
        ) : (
          "Conferma prenotazione"
        )}
      </button>
      <p className="text-center text-[10px] leading-4 text-slate-400">
        <CalendarClock className="mr-1 inline h-3 w-3" />
        La disponibilità mostrata è indicativa. La prenotazione sarà
        effettiva solo dopo la conferma.
      </p>
    </form>
  );
}