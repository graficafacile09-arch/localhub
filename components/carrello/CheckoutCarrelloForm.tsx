"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  Package,
  ShoppingBag,
  Store,
  Truck,
  User,
} from "lucide-react";
import { useCarrello } from "@/lib/carrello/CartContext";
import { chiaveDiRiga } from "@/lib/carrello/cart-core";
import QuantitySelector from "@/components/acquista/QuantitySelector";

const formattaEuro = (v: number) =>
  `€${v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Prefill = {
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  indirizzo: string;
  cap: string;
  citta: string;
  provincia: string;
  autenticato: boolean;
};

type OrdineRisposta = {
  ordineId: string;
  numero: string;
  stato: string;
  totale: number;
  paymentStatus: string | null;
  paymentProvider: string | null;
  negozioId: string;
  negozioNome: string;
  giaEsistente: boolean;
  pagamento?: { redirectUrl?: string | null; sessioneId?: string | null } | null;
};

type ErroreNegozioRisposta = { negozioId: string; codice: string; messaggio: string };

type EsitoCheckout = {
  checkoutKey: string;
  ordini: OrdineRisposta[];
  errori: ErroreNegozioRisposta[];
};

type RispostaApi = {
  status: number;
  success?: boolean;
  data?: { checkoutKey?: string; ordini?: OrdineRisposta[]; errori?: ErroreNegozioRisposta[] };
  error?: { code?: string; message?: string };
};

/** Messaggio utente per i codici d'errore del backend (mai tecnici). */
function messaggioErrore(codice?: string, messaggioServer?: string): string {
  if (messaggioServer && codice !== "RATE_LIMITED") return messaggioServer;
  switch (codice) {
    case "VALIDATION_ERROR":
      return "Controlla i dati inseriti: alcuni campi non sono validi.";
    case "RATE_LIMITED":
      return "Troppi tentativi in breve tempo. Riprova tra qualche minuto.";
    case "CARTA_NON_DISPONIBILE":
      return "Il pagamento con carta non è disponibile per tutti i negozi del carrello. Prova con il bonifico.";
    case "KLARNA_NON_DISPONIBILE":
      return "Klarna non è disponibile per tutti i negozi del carrello. Prova con la carta o il bonifico.";
    case "PAYPAL_NON_DISPONIBILE":
      return "PayPal non è disponibile per tutti i negozi del carrello. Prova con la carta o il bonifico.";
    case "SCORTE_INSUFFICIENTI":
      return "Alcuni prodotti non hanno scorte sufficienti. Riduci la quantità o rimuovili.";
    case "PRODOTTO_NON_TROVATO":
    case "PRODOTTO_INATTIVO":
      return "Uno dei prodotti del carrello non è più disponibile.";
    case "VARIANTE_NON_VALIDA":
    case "VARIANTE_OBBLIGATORIA":
      return "Una variante del carrello non è più valida. Verifica il prodotto.";
    case "NEGOZIO_INATTIVO":
      return "Uno dei negozi del carrello non è più attivo.";
    default:
      return messaggioServer ?? "Si è verificato un errore. Riprova.";
  }
}

/**
 * CHECKOUT CARRELLO (FASE F2.5) — client.
 *
 * Trasforma il carrello (F2.4) in N ordini, uno per negozio, chiamando la
 * route F2.2 POST /api/cliente/ordini/carrello. Il payload contiene SOLO
 * riferimenti (prodottoId/varianteId/quantita) + dati cliente e consegna:
 * mai prezzi, totali, stock, negozioId o clienteUserId dal browser (il
 * server è l'unica fonte autorevole, come da report F2).
 *
 * Sicurezza UX:
 *  - carrello vuoto → niente checkout, CTA verso /carrello o /negozi;
 *  - checkoutKey generata UNA volta per visita della pagina (anti doppio
 *    click: un retry della stessa chiave è idempotente);
 *  - il carrello viene svuotato SOLO dopo che il backend ha accettato il
 *    checkout (ordini creati), MAI su errore HTTP; con errori parziali per
 *    negozio vengono rimosse SOLO le righe dei negozi con ordine creato;
 *  - con metodo carta ogni ordine ha la PROPRIA Checkout Session Stripe:
 *    1 sessione → redirect diretto; più sessioni → pagina "Pagamenti da
 *    completare" con un pulsante "Paga ora" per negozio.
 */
export default function CheckoutCarrelloForm({ prefill }: { prefill: Prefill }) {
  const { righe, gruppi, pezzi, totale, rimuovi, svuota } = useCarrello();

  // Chiave di idempotenza: UNA per visita della pagina (doppio click/retry
  // della stessa key → il backend riusa gli ordini esistenti, mai duplicati).
  const checkoutKeyRef = useRef<string>(
    typeof crypto !== "undefined" ? crypto.randomUUID() : `ck-${Date.now()}`
  );

  // ── Dati form (prefill dal profilo per utente autenticato) ───────────────
  const [nome, setNome] = useState(prefill.nome);
  const [cognome, setCognome] = useState(prefill.cognome);
  const [email, setEmail] = useState(prefill.email);
  const [telefono, setTelefono] = useState(prefill.telefono);
  const [modalita, setModalita] = useState<"ritiro" | "spedizione">("spedizione");
  const [dataRitiro, setDataRitiro] = useState("");
  const [fascia, setFascia] = useState("");
  const [indirizzo, setIndirizzo] = useState(prefill.indirizzo);
  const [cap, setCap] = useState(prefill.cap);
  const [citta, setCitta] = useState(prefill.citta);
  const [provincia, setProvincia] = useState(prefill.provincia);
  const [noteConsegna, setNoteConsegna] = useState("");
  const [metodoSpedizione, setMetodoSpedizione] = useState<"standard" | "express">("standard");
  // Default bonifico: sempre disponibile; carta e Klarna sono verificate dal
  // backend (pre-flight F2.2 fail-closed) — nessun controllo autoritativo nel
  // client, né prezzi/totali/credenziali conosciuti qui.
  const [metodoPagamento, setMetodoPagamento] = useState<
    "carta" | "bonifico" | "klarna" | "paypal"
  >("bonifico");
  // Metodi di pagamento realmente disponibili per TUTTI i negozi del carrello
  // (intersezione, stessa fonte del buy-now: getMetodiPagamentoPubblici via
  // /api/cliente/ordini/carrello/metodi). Bonifico è sempre disponibile (metodo
  // base) → valore iniziale sicuro; carta/klarna compaiono SOLO dopo la
  // conferma server-side della disponibilità (fail-closed: senza risposta
  // restano nascosti, mai mostrati "per default").
  const [metodiDisponibili, setMetodiDisponibili] = useState<string[]>(["bonifico"]);
  const [note, setNote] = useState("");

  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<EsitoCheckout | null>(null);

  const oggi = useMemo(() => new Date().toISOString().split("T")[0], []);
  const costoSpedizioneUI = metodoSpedizione === "express" ? 12.9 : 5.9;

  // Carica la disponibilità reale dei metodi per i negozi del carrello (fonte
  // comune server-side). Il carrello è client-side (localStorage), quindi
  // l'elenco negozi si conosce solo qui, dopo l'idratazione.
  useEffect(() => {
    const negozi = gruppi.map((g) => g.negozioId);
    if (negozi.length === 0) {
      setMetodiDisponibili(["bonifico"]);
      return;
    }
    let attivo = true;
    fetch("/api/cliente/ordini/carrello/metodi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ negozi }),
    })
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: { metodi?: Array<{ metodo: string }> } }) => {
        if (!attivo) return;
        const metodi = (json?.data?.metodi ?? []).map((m) => m.metodo);
        if (!metodi.includes("bonifico")) metodi.push("bonifico");
        setMetodiDisponibili(metodi);
      })
      .catch(() => {
        // Fail-closed: senza risposta restano visibili solo bonifico.
        if (attivo) setMetodiDisponibili(["bonifico"]);
      });
    return () => {
      attivo = false;
    };
  }, [gruppi]);

  // ── Carrello vuoto → nessun checkout possibile ───────────────────────────
  if (righe.length === 0 && !esito) {
    return (
      <div className="mx-auto max-w-3xl px-3 py-10 sm:px-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <ShoppingBag className="h-7 w-7 text-blue-600" aria-hidden />
          </div>
          <h1 className="mt-4 text-lg font-black text-slate-900">Il tuo carrello è vuoto</h1>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Aggiungi prodotti dai negozi della tua città prima di procedere al checkout.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              href="/negozi"
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Store className="h-4 w-4" aria-hidden />
              Vai ai negozi
            </Link>
            <Link
              href="/carrello"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Torna al carrello
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Schermata post-invio: ordini creati / pagamenti da completare ────────
  if (esito) {
    return (
      <EsitoCheckoutView
        esito={esito}
        onRiprova={() => {
          setEsito(null);
          setInviando(false);
          setErrore(null);
        }}
      />
    );
  }

  const valida = (): string | null => {
    if (!nome.trim() || !cognome.trim()) return "Inserisci nome e cognome.";
    if (modalita === "spedizione") {
      if (!email.trim()) return "Inserisci l'email per ricevere la conferma dell'ordine.";
      if (!indirizzo.trim() || !cap.trim() || !citta.trim() || !provincia.trim())
        return "Completa l'indirizzo di spedizione.";
      if (!/^\d{5}$/.test(cap.trim())) return "Il CAP deve essere composto da 5 cifre.";
    }
    if (modalita === "ritiro" && dataRitiro && dataRitiro < oggi)
      return "La data di ritiro non può essere nel passato.";
    return null;
  };

  const invia = async () => {
    if (inviando) return; // anti doppio invio
    const problema = valida();
    if (problema) {
      setErrore(problema);
      return;
    }

    setInviando(true);
    setErrore(null);
    try {
      const body: Record<string, unknown> = {
        checkoutKey: checkoutKeyRef.current,
        righe: righe.map((r) => ({
          prodottoId: r.prodottoId,
          varianteId: r.varianteId ?? null,
          quantita: r.quantita,
        })),
        modalita,
        cliente: {
          nome: nome.trim(),
          cognome: cognome.trim(),
          email: modalita === "spedizione" ? email.trim() : null,
          telefono: telefono.trim() || null,
        },
        note: note.trim() || null,
      };
      if (modalita === "ritiro") {
        body.ritiro = { data: dataRitiro || null, fascia: fascia || null };
      } else {
        body.spedizione = {
          indirizzo: indirizzo.trim(),
          cap: cap.trim(),
          citta: citta.trim(),
          provincia: provincia.trim().toUpperCase(),
          note: noteConsegna.trim() || null,
          metodoSpedizione,
          metodoPagamento,
        };
      }

      const res = await fetch("/api/cliente/ordini/carrello", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as RispostaApi | null;

      if (!json) {
        setErrore("Errore di rete. Controlla la connessione e riprova.");
        setInviando(false);
        return;
      }

      // ── 422 / 429 / 5xx: errore leggibile, carrello MAI svuotato ─────────
      if (!res.ok || !json.success) {
        setErrore(messaggioErrore(json.error?.code, json.error?.message));
        setInviando(false);
        return;
      }

      const ordini = json.data?.ordini ?? [];
      const errori = json.data?.errori ?? [];
      if (ordini.length === 0) {
        setErrore(
          errori[0] ? messaggioErrore(errori[0].codice, errori[0].messaggio) : "Impossibile completare il checkout."
        );
        setInviando(false);
        return;
      }

      // ── Checkout ACCETTATO dal backend → pulizia carrello ────────────────
      // Svuota TUTTO se nessun errore per negozio; altrimenti rimuovi solo le
      // righe dei negozi con ordine creato (i falliti restano per correzione).
      const negoziConOrdine = new Set(ordini.map((o) => o.negozioId));
      if (errori.length === 0) {
        svuota();
      } else {
        for (const riga of righe) {
          if (negoziConOrdine.has(riga.negozioId)) {
            rimuovi(chiaveDiRiga(riga));
          }
        }
      }

      setEsito({ checkoutKey: json.data?.checkoutKey ?? checkoutKeyRef.current, ordini, errori });
      setInviando(false);
    } catch {
      setErrore("Errore di rete. Controlla la connessione e riprova.");
      setInviando(false);
    }
  };

  const soloRighe = totale;

  return (
    <div className="mx-auto max-w-5xl px-3 py-5 sm:px-5">
      <div className="flex items-center gap-2">
        <Link
          href="/carrello"
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-blue-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Torna al carrello
        </Link>
      </div>
      <h1 className="mt-2 text-lg font-black tracking-tight text-slate-900">
        Checkout{" "}
        <span className="text-sm font-semibold text-slate-400">
          ({pezzi} {pezzi === 1 ? "articolo" : "articoli"}, {gruppi.length} {gruppi.length === 1 ? "negozio" : "negozi"})
        </span>
      </h1>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* ── Colonna sinistra: form ─────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Dati cliente */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-1.5 text-sm font-black uppercase tracking-wide text-slate-500">
              <User className="h-4 w-4 text-blue-600" aria-hidden />
              Dati del cliente
            </h2>
            {prefill.autenticato && (
              <p className="mt-1 text-[11px] text-slate-400">
                Precompilati dal tuo profilo (puoi modificarli per questo ordine).
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Campo label="Nome *" value={nome} onChange={setNome} id="ck-nome" />
              <Campo label="Cognome *" value={cognome} onChange={setCognome} id="ck-cognome" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Campo
                label={modalita === "spedizione" ? "Email *" : "Email"}
                value={email}
                onChange={setEmail}
                type="email"
                id="ck-email"
              />
              <Campo label="Telefono" value={telefono} onChange={setTelefono} type="tel" id="ck-telefono" />
            </div>
          </section>

          {/* Modalità consegna (unica per l'intero checkout, come da payload F2.2) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-1.5 text-sm font-black uppercase tracking-wide text-slate-500">
              <Package className="h-4 w-4 text-blue-600" aria-hidden />
              Consegna
            </h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <OpzioneModalita
                attiva={modalita === "ritiro"}
                onClick={() => setModalita("ritiro")}
                icona={<Store className="h-5 w-5" />}
                titolo="Ritiro in negozio"
                descrizione="Ritiri presso il punto vendita"
              />
              <OpzioneModalita
                attiva={modalita === "spedizione"}
                onClick={() => setModalita("spedizione")}
                icona={<Truck className="h-5 w-5" />}
                titolo="Spedizione"
                descrizione="Consegna all'indirizzo indicato"
              />
            </div>

            {modalita === "ritiro" ? (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="ck-data" className="block text-xs font-semibold text-slate-700">
                      <Calendar className="mr-1 inline h-3.5 w-3.5 text-blue-500" />
                      Data ritiro
                    </label>
                    <input
                      id="ck-data"
                      type="date"
                      value={dataRitiro}
                      min={oggi}
                      onChange={(e) => setDataRitiro(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label htmlFor="ck-fascia" className="block text-xs font-semibold text-slate-700">
                      <Clock className="mr-1 inline h-3.5 w-3.5 text-blue-500" />
                      Fascia oraria
                    </label>
                    <select
                      id="ck-fascia"
                      value={fascia}
                      onChange={(e) => setFascia(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                    >
                      <option value="">Seleziona fascia</option>
                      <option value="09:00–10:00">09:00 – 10:00</option>
                      <option value="10:00–11:00">10:00 – 11:00</option>
                      <option value="11:00–12:00">11:00 – 12:00</option>
                      <option value="12:00–13:00">12:00 – 13:00</option>
                      <option value="14:00–15:00">14:00 – 15:00</option>
                      <option value="15:00–16:00">15:00 – 16:00</option>
                      <option value="16:00–17:00">16:00 – 17:00</option>
                      <option value="17:00–18:00">17:00 – 18:00</option>
                      <option value="18:00–19:00">18:00 – 19:00</option>
                    </select>
                  </div>
                </div>
                <p className="text-[11px] leading-4 text-slate-400">
                  Il pagamento del ritiro viene concordato direttamente con il negozio.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <Campo label="Indirizzo *" value={indirizzo} onChange={setIndirizzo} id="ck-indirizzo" />
                <div className="grid grid-cols-3 gap-3">
                  <Campo label="CAP *" value={cap} onChange={setCap} id="ck-cap" />
                  <Campo label="Città *" value={citta} onChange={setCitta} id="ck-citta" />
                  <Campo label="Provincia *" value={provincia} onChange={setProvincia} id="ck-provincia" />
                </div>
                <Campo label="Note consegna" value={noteConsegna} onChange={setNoteConsegna} id="ck-note-consegna" />
              </div>
            )}
          </section>

          {/* Metodo spedizione (solo modalità spedizione) */}
          {modalita === "spedizione" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="flex items-center gap-1.5 text-sm font-black uppercase tracking-wide text-slate-500">
                <Truck className="h-4 w-4 text-blue-600" aria-hidden />
                Metodo spedizione
              </h2>
              <div className="mt-3 space-y-2">
                <OpzioneRadio
                  selezionato={metodoSpedizione === "standard"}
                  onClick={() => setMetodoSpedizione("standard")}
                  titolo="Standard"
                  sotto="Consegna in 3-5 giorni lavorativi"
                  prezzo="€5,90"
                />
                <OpzioneRadio
                  selezionato={metodoSpedizione === "express"}
                  onClick={() => setMetodoSpedizione("express")}
                  titolo="Express"
                  sotto="Consegna in 1-2 giorni lavorativi"
                  prezzo="€12,90"
                />
              </div>
            </section>
          )}

          {/* Metodo pagamento (solo modalità spedizione) */}
          {modalita === "spedizione" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="flex items-center gap-1.5 text-sm font-black uppercase tracking-wide text-slate-500">
                <CreditCard className="h-4 w-4 text-blue-600" aria-hidden />
                Metodo pagamento
              </h2>
              <div className="mt-3 space-y-2">
                {metodiDisponibili.includes("carta") && (
                  <OpzioneRadio
                    selezionato={metodoPagamento === "carta"}
                    onClick={() => setMetodoPagamento("carta")}
                    icona={<CreditCard className="h-4 w-4 text-slate-500" />}
                    titolo="Carta di credito/debito"
                    sotto="Pagamento sicuro con Stripe"
                  />
                )}
                {metodiDisponibili.includes("klarna") && (
                  <OpzioneKlarna
                    selezionato={metodoPagamento === "klarna"}
                    onClick={() => setMetodoPagamento("klarna")}
                  />
                )}
                {metodiDisponibili.includes("paypal") && (
                  <OpzionePaypal
                    selezionato={metodoPagamento === "paypal"}
                    onClick={() => setMetodoPagamento("paypal")}
                  />
                )}
                <OpzioneRadio
                  selezionato={metodoPagamento === "bonifico"}
                  onClick={() => setMetodoPagamento("bonifico")}
                  icona={<Banknote className="h-4 w-4 text-slate-500" />}
                  titolo="Bonifico bancario"
                  sotto="Pagamento manuale: ti invieremo le coordinate"
                />
              </div>
              {(metodoPagamento === "carta" ||
                metodoPagamento === "klarna" ||
                metodoPagamento === "paypal") && (
                <p className="mt-2 text-[11px] leading-4 text-slate-400">
                  Con più negozi ogni ordine ha la propria sessione di pagamento: ti mostreremo un pulsante per
                  negozio.
                </p>
              )}
            </section>
          )}

          {/* Note ordine */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Note</h2>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Note per i negozi (facoltative)..."
              className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 placeholder:text-slate-400"
            />
          </section>

          {/* Errore */}
          {errore && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
            >
              {errore}
            </div>
          )}

          <button
            type="button"
            onClick={invia}
            disabled={inviando}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-bold text-white shadow-md shadow-blue-500/25 transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {inviando ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Invio ordine...
              </>
            ) : (
              <>
                Procedi al checkout
                <ArrowRight className="h-5 w-5" aria-hidden />
              </>
            )}
          </button>
        </div>

        {/* ── Colonna destra: riepilogo per negozio (UI, il server è autorevole) ── */}
        <aside className="h-fit space-y-3 lg:sticky lg:top-4">
          {gruppi.map((gruppo) => (
            <section
              key={gruppo.negozioId}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <header className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                  <p className="truncate text-sm font-bold text-slate-900">{gruppo.negozioNome || "Negozio"}</p>
                </div>
                <p className="shrink-0 text-xs font-bold text-slate-500">
                  Subtotale: <span className="text-emerald-700">{formattaEuro(gruppo.subtotale)}</span>
                </p>
              </header>
              <ul className="divide-y divide-slate-100">
                {gruppo.righe.map((riga) => (
                  <li key={chiaveDiRiga(riga)} className="flex items-start justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{riga.nome}</p>
                      {riga.variante && <p className="text-[11px] text-slate-500">Variante: {riga.variante}</p>}
                      <p className="text-[11px] text-slate-400">× {riga.quantita}</p>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-slate-900 tabular-nums">
                      {formattaEuro(riga.prezzo * riga.quantita)}
                    </p>
                  </li>
                ))}
              </ul>
              {modalita === "spedizione" && (
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                  <span>Spedizione</span>
                  <span className="font-semibold text-slate-700">{formattaEuro(costoSpedizioneUI)}</span>
                </div>
              )}
            </section>
          ))}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-slate-900">Totale prodotti</span>
              <span className="text-lg font-black text-emerald-700 tabular-nums">{formattaEuro(soloRighe)}</span>
            </div>
            {modalita === "spedizione" && (
              <p className="mt-1 text-[11px] leading-4 text-slate-400">
                + spedizione calcolata per negozio al momento dell&apos;ordine.
              </p>
            )}
            <p className="mt-2 text-[11px] leading-4 text-slate-400">
              Prezzi, stock e totale vengono verificati dal sistema al momento dell&apos;ordine: i valori mostrati sono
              indicativi.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Vista esito: ordini creati / pagamenti da completare ────────────────────

function EsitoCheckoutView({
  esito,
  onRiprova,
}: {
  esito: EsitoCheckout;
  onRiprova: () => void;
}) {
  const sessioni = esito.ordini.filter((o) => o.pagamento?.redirectUrl);
  const soloRiusciti = esito.ordini.filter((o) => !esito.errori.some((e) => e.negozioId === o.negozioId));
  const primoPagamento = sessioni[0];

  return (
    <div className="mx-auto max-w-3xl px-3 py-10 sm:px-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900">
              {sessioni.length > 0 ? "Ordini creati — pagamenti da completare" : "Ordine completato"}
            </h1>
            <p className="text-sm text-slate-500">
              Il carrello è stato svuotato. {sessioni.length > 0 ? "Completa i pagamenti per finalizzare gli ordini." : ""}
            </p>
          </div>
        </div>

        {/* Ordini creati */}
        <ul className="mt-5 space-y-3">
          {esito.ordini.map((ordine) => {
            const erroreNegozio = esito.errori.find((e) => e.negozioId === ordine.negozioId);
            return (
              <li
                key={ordine.ordineId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">{ordine.negozioNome || "Negozio"}</p>
                  <p className="text-[11px] text-slate-500">
                    Ordine #{ordine.numero} · Stato: {ordine.stato} · Totale: {formattaEuro(ordine.totale)}
                  </p>
                  {erroreNegozio && (
                    <p className="mt-1 text-[11px] font-semibold text-red-600">{erroreNegozio.messaggio}</p>
                  )}
                </div>
                {ordine.pagamento?.redirectUrl ? (
                  <a
                    href={ordine.pagamento.redirectUrl}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
                  >
                    <CreditCard className="h-4 w-4" aria-hidden />
                    Paga ora
                  </a>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      erroreNegozio ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {erroreNegozio ? "Pagamento non avviato" : "Ordine creato"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {esito.errori.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
            Alcuni negozi non hanno completato l&apos;ordine: le relative righe sono ancora nel carrello per essere
            corrette.
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {primoPagamento?.pagamento?.redirectUrl && sessioni.length > 1 && (
            <a
              href={primoPagamento.pagamento.redirectUrl}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              Apri il primo pagamento
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          )}
          <Link
            href={soloRiusciti[0]?.ordineId ? `/ordini/conferma/${soloRiusciti[0].ordineId}` : "/"}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
          >
            Vedi dettaglio ordine
          </Link>
          {esito.errori.length > 0 && (
            <button
              type="button"
              onClick={onRiprova}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
            >
              Correggi e riprova i negozi mancanti
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sotto-componenti riusabili ──────────────────────────────────────────────

function Campo({
  label,
  value,
  onChange,
  id,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  id: string;
  type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
      />
    </div>
  );
}

function OpzioneModalita({
  attiva,
  onClick,
  icona,
  titolo,
  descrizione,
}: {
  attiva: boolean;
  onClick: () => void;
  icona: React.ReactNode;
  titolo: string;
  descrizione: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${
        attiva ? "border-blue-400 bg-blue-50/50" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span className={`shrink-0 ${attiva ? "text-blue-600" : "text-slate-400"}`}>{icona}</span>
      <span>
        <span className="block text-sm font-semibold text-slate-900">{titolo}</span>
        <span className="block text-[11px] text-slate-500">{descrizione}</span>
      </span>
    </button>
  );
}

function OpzioneRadio({
  selezionato,
  onClick,
  titolo,
  sotto,
  prezzo,
  icona,
}: {
  selezionato: boolean;
  onClick: () => void;
  titolo: string;
  sotto: string;
  prezzo?: string;
  icona?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selezionato}
      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
        selezionato ? "border-blue-400 bg-blue-50/50" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      {icona && <span className="shrink-0">{icona}</span>}
      <span className="flex flex-1 items-center justify-between gap-2">
        <span>
          <span className="block text-sm font-semibold text-slate-900">{titolo}</span>
          <span className="block text-[11px] text-slate-500">{sotto}</span>
        </span>
        {prezzo && <span className="shrink-0 text-sm font-bold text-slate-900">{prezzo}</span>}
      </span>
    </button>
  );
}

/**
 * Opzione di pagamento Klarna: mostra il LOGO ufficiale (asset locale) e il
 * messaggio "Paga in 3 rate". Nessun importo delle rate calcolato/mostrato
 * lato frontend (il totale resta esclusivamente server-side). Il metodo
 * inviato al backend resta "klarna".
 */
function OpzioneKlarna({
  selezionato,
  onClick,
}: {
  selezionato: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selezionato}
      className={`w-full rounded-lg border p-3 text-left transition ${
        selezionato ? "border-blue-400 bg-blue-50/50" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        {/* Logo ufficiale Klarna rosa (wordmark ufficiale, asset locale versionato). */}
        <img
          src="/loghi/klarna-pink.svg"
          alt="Klarna"
          width={88}
          height={20}
          className="h-5 w-auto shrink-0 object-contain"
        />
        <span className="inline-flex shrink-0 items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white">
          Paga in 3 rate
        </span>
      </span>
      <span className="mt-2 block text-sm font-semibold text-slate-900">Klarna</span>
      <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
        Dividi il tuo acquisto in 3 rate, se disponibile.
      </span>
      <span className="mt-1 block text-[10px] leading-4 text-slate-400">
        Soggetto ad approvazione e alle condizioni di Klarna.
      </span>
    </button>
  );
}

/**
 * Opzione di pagamento PayPal: mostra il LOGO ufficiale (asset locale). Il
 * metodo inviato al backend resta "paypal". Nessun importo calcolato lato
 * frontend (il totale resta esclusivamente server-side).
 */
function OpzionePaypal({
  selezionato,
  onClick,
}: {
  selezionato: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selezionato}
      className={`w-full rounded-lg border p-3 text-left transition ${
        selezionato ? "border-blue-400 bg-blue-50/50" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        {/* Logo ufficiale PayPal (wordmark, asset locale). */}
        <img
          src="/loghi/paypal.svg"
          alt="PayPal"
          width={88}
          height={24}
          className="h-5 w-auto shrink-0 object-contain"
        />
      </span>
      <span className="mt-2 block text-sm font-semibold text-slate-900">PayPal</span>
      <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
        Paga con il tuo conto PayPal o con una carta.
      </span>
    </button>
  );
}
