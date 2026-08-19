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
import LocalitaFields, {
  type CampoLocalita,
} from "@/components/indirizzo/LocalitaFields";
import FatturazioneForm, {
  DATI_FATTURAZIONE_VUOTI,
  validaDatiFatturazione,
  type DatiFatturazione,
} from "@/components/acquista/FatturazioneForm";
import { CATALOGO_METODI_PAGAMENTO } from "@/lib/pagamenti/catalogo";
import type { MetodoPagamentoCheckout } from "@/lib/pagamenti/metodi-pubblici";
import {
  MESSAGGIO_NESSUNA_SPEDIZIONE,
  type CarrierCodice,
  type OpzioneSpedizione,
  type ServizioCodice,
  type TierSpedizione,
} from "@/lib/spedizioni/catalogo";

const formattaEuro = (v: number) =>
  `€${v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TIER_LABEL: Record<TierSpedizione, string> = {
  standard: "Standard",
  express: "Express",
  locale: "Corriere locale",
};
const TIER_ORDINE: TierSpedizione[] = ["standard", "express", "locale"];

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

/**
 * Catalogo statico di fallback (fail-closed): ogni metodo del catalogo con
 * `disponibile` true SOLO per i metodi senza gateway (bonifico). Usato come
 * stato iniziale e quando la fonte server non risponde: mostra comunque
 * l'intero catalogo, con i metodi online non selezionabili.
 */
const CATALOGO_DEFAULT: MetodoPagamentoCheckout[] = CATALOGO_METODI_PAGAMENTO.map((v) => ({
  metodo: v.metodo,
  etichetta: v.etichetta,
  nomeBreve: v.nomeBreve,
  descrizione: v.descrizione,
  disponibile: !v.richiedeGateway,
  iban: null,
  payeeEmail: null,
}));

/** Messaggio di indisponibilità per un metodo non configurato dal negozio. */
function messaggioNonDisponibile(nomeBreve: string): string {
  return `${nomeBreve} non disponibile per questo negozio.`;
}

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
  // MOTORE TARIFFARIO — il prezzo della spedizione è calcolato da InCittà
  // (server-side): qui si mostra SOLO il preventivo ricevuto e si trasporta la
  // scelta corriere+servizio. Nessun prezzo inventato, nessun campo modificabile.
  const [opzioniSpedizione, setOpzioniSpedizione] = useState<OpzioneSpedizione[]>([]);
  const [pesoGrammi, setPesoGrammi] = useState<number | null>(null);
  const [nessunServizioAttivo, setNessunServizioAttivo] = useState(false);
  const [caricamentoSpedizione, setCaricamentoSpedizione] = useState(true);
  const [spedizioneScelta, setSpedizioneScelta] = useState<{
    carrier: CarrierCodice;
    servizio: ServizioCodice;
  } | null>(null);
  // Default bonifico: sempre disponibile; carta e Klarna sono verificate dal
  // backend (pre-flight F2.2 fail-closed) — nessun controllo autoritativo nel
  // client, né prezzi/totali/credenziali conosciuti qui.
  const [metodoPagamento, setMetodoPagamento] = useState<
    "carta" | "bonifico" | "klarna" | "scalapay" | "paypal"
  >("bonifico");
  // Catalogo dei metodi di pagamento supportati da InCittà (STESSA fonte del
  // buy-now: CATALOGO_METODI_PAGAMENTO + disponibilità via
  // /api/cliente/ordini/carrello/metodi). Mostriamo SEMPRE l'intero catalogo,
  // ognuno con il flag `disponibile` reale (intersezione multi-negozio); i
  // metodi online non disponibili restano visibili ma non selezionabili.
  // Bonifico è sempre disponibile (metodo base) → default selezionato sicuro.
  const [catalogoMetodi, setCatalogoMetodi] = useState<MetodoPagamentoCheckout[]>(CATALOGO_DEFAULT);
  const [note, setNote] = useState("");

  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<EsitoCheckout | null>(null);
  // Errori per campo (ritiro: data e fascia oraria obbligatorie).
  const [erroriRitiro, setErroriRitiro] = useState<{ data?: string; fascia?: string }>({});
  // Indirizzo di fatturazione (chiuso per default: si usano i dati spedizione).
  const [fatturazione, setFatturazione] = useState<DatiFatturazione>(DATI_FATTURAZIONE_VUOTI);
  const [erroriFatturazione, setErroriFatturazione] = useState<Record<string, string>>({});

  const oggi = useMemo(() => new Date().toISOString().split("T")[0], []);
  const opzioneScelta = opzioniSpedizione.find(
    (o) =>
      o.carrier === spedizioneScelta?.carrier && o.servizio === spedizioneScelta?.servizio
  );
  const costoSpedizioneUI = opzioneScelta?.prezzo ?? 0;

  // Carica la disponibilità reale dei metodi per i negozi del carrello (fonte
  // comune server-side). Il carrello è client-side (localStorage), quindi
  // l'elenco negozi si conosce solo qui, dopo l'idratazione.
  useEffect(() => {
    const negozi = gruppi.map((g) => g.negozioId);
    if (negozi.length === 0) {
      setCatalogoMetodi(CATALOGO_DEFAULT);
      return;
    }
    let attivo = true;
    fetch("/api/cliente/ordini/carrello/metodi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ negozi }),
    })
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: { metodi?: MetodoPagamentoCheckout[] } }) => {
        if (!attivo) return;
        const metodi = json?.data?.metodi ?? [];
        // Il server restituisce SEMPRE l'intero catalogo (ogni metodo con il
        // proprio `disponibile` = intersezione per tutti i negozi del carrello).
        // Se la risposta è vuota (errore), manteniamo il catalogo fail-closed.
        setCatalogoMetodi(metodi.length > 0 ? metodi : CATALOGO_DEFAULT);
      })
      .catch(() => {
        // Fail-closed: senza risposta restano selezionabili solo i metodi senza gateway.
        if (attivo) setCatalogoMetodi(CATALOGO_DEFAULT);
      });
    return () => {
      attivo = false;
    };
  }, [gruppi]);

  // Preventivo spedizione server-side (prezzo = SOMMA dei costi per negozio,
  // ognuno genera un ordine/consegna separato). Ricalcolato al cambio carrello.
  useEffect(() => {
    if (modalita !== "spedizione" || righe.length === 0) {
      setOpzioniSpedizione([]);
      setSpedizioneScelta(null);
      setNessunServizioAttivo(false);
      setCaricamentoSpedizione(false);
      return;
    }
    let attivo = true;
    setCaricamentoSpedizione(true);
    fetch("/api/cliente/ordini/carrello/spedizione/preventivo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        righe: righe.map((r) => ({ prodottoId: r.prodottoId, quantita: r.quantita })),
      }),
    })
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: { opzioni?: OpzioneSpedizione[]; pesoGrammi?: number | null; nessunServizioAttivo?: boolean } }) => {
        if (!attivo) return;
        const opzioni = json?.data?.opzioni ?? [];
        setOpzioniSpedizione(opzioni);
        setPesoGrammi(json?.data?.pesoGrammi ?? null);
        setNessunServizioAttivo(json?.data?.nessunServizioAttivo ?? false);
        setSpedizioneScelta((prev) => {
          if (!prev) return null;
          const ancora = opzioni.some(
            (o) => o.carrier === prev.carrier && o.servizio === prev.servizio && o.disponibile
          );
          return ancora ? prev : null;
        });
      })
      .catch(() => {
        if (attivo) setOpzioniSpedizione([]);
      })
      .finally(() => {
        if (attivo) setCaricamentoSpedizione(false);
      });
    return () => {
      attivo = false;
    };
  }, [modalita, righe]);

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
      if (!spedizioneScelta) return "Seleziona un corriere di spedizione.";
      // Fatturazione diversa: campi obbligatori, blocco invio se incompleti.
      if (fatturazione.diversa) {
        const errFatt = validaDatiFatturazione(fatturazione);
        if (Object.keys(errFatt).length > 0) {
          setErroriFatturazione(errFatt);
          return "Completa l'indirizzo di fatturazione.";
        }
      }
      setErroriFatturazione({});
      return null;
    }
    // modalita === "ritiro": data e fascia oraria OBBLIGATORIE (come nome/cognome).
    const nuoviErrori: { data?: string; fascia?: string } = {};
    if (!dataRitiro) nuoviErrori.data = "Seleziona la data del ritiro.";
    else if (dataRitiro < oggi) nuoviErrori.data = "La data di ritiro non può essere nel passato.";
    if (!fascia) nuoviErrori.fascia = "Seleziona la fascia oraria.";
    setErroriRitiro(nuoviErrori);
    if (nuoviErrori.data) return nuoviErrori.data;
    if (nuoviErrori.fascia) return nuoviErrori.fascia;
    return null;
  };

  // Ritiro confermabile SOLO con nome, cognome, data e fascia compilati.
  // (La spedizione non è toccata: nessun vincolo aggiuntivo.)
  const ritiroIncompleto =
    modalita === "ritiro" &&
    (!nome.trim() || !cognome.trim() || !dataRitiro || !fascia);

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
          carrier: spedizioneScelta!.carrier,
          servizio: spedizioneScelta!.servizio,
          metodoPagamento,
        };
        body.fatturazione = fatturazione.diversa
          ? {
              diversa: true,
              nome: fatturazione.nome.trim() || null,
              cognome: fatturazione.cognome.trim() || null,
              indirizzo: fatturazione.indirizzo.trim() || null,
              numeroCivico: fatturazione.numeroCivico.trim() || null,
              cap: fatturazione.cap.trim() || null,
              comune: fatturazione.comune.trim() || null,
              provincia: fatturazione.provincia.trim() || null,
              nazione: fatturazione.nazione.trim() || null,
            }
          : null;
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
                      Data ritiro *
                    </label>
                    <input
                      id="ck-data"
                      type="date"
                      value={dataRitiro}
                      min={oggi}
                      required
                      aria-required="true"
                      aria-invalid={!!erroriRitiro.data}
                      onChange={(e) => {
                        setDataRitiro(e.target.value);
                        setErroriRitiro((p) => ({ ...p, data: undefined }));
                      }}
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                    />
                    {erroriRitiro.data && (
                      <p className="mt-1 text-[11px] font-semibold text-red-600">{erroriRitiro.data}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="ck-fascia" className="block text-xs font-semibold text-slate-700">
                      <Clock className="mr-1 inline h-3.5 w-3.5 text-blue-500" />
                      Fascia oraria *
                    </label>
                    <select
                      id="ck-fascia"
                      value={fascia}
                      required
                      aria-required="true"
                      aria-invalid={!!erroriRitiro.fascia}
                      onChange={(e) => {
                        setFascia(e.target.value);
                        setErroriRitiro((p) => ({ ...p, fascia: undefined }));
                      }}
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
                    {erroriRitiro.fascia && (
                      <p className="mt-1 text-[11px] font-semibold text-red-600">{erroriRitiro.fascia}</p>
                    )}
                  </div>
                </div>
                <p className="text-[11px] leading-4 text-slate-400">
                  Il pagamento del ritiro viene concordato direttamente con il negozio.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <Campo label="Indirizzo *" value={indirizzo} onChange={setIndirizzo} id="ck-indirizzo" />
                <LocalitaFields
                  cap={cap}
                  citta={citta}
                  provincia={provincia}
                  onChange={(campo: CampoLocalita, valore: string) => {
                    if (campo === "cap") setCap(valore);
                    else if (campo === "citta") setCitta(valore);
                    else setProvincia(valore);
                  }}
                  idPrefix="ck"
                  required
                />
                <Campo label="Note consegna" value={noteConsegna} onChange={setNoteConsegna} id="ck-note-consegna" />
                <FatturazioneForm
                  value={fatturazione}
                  onChange={setFatturazione}
                  errori={erroriFatturazione}
                />
              </div>
            )}
          </section>

          {/* Spedizione — catalogo corrieri, prezzo calcolato da InCittà */}
          {modalita === "spedizione" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="flex items-center gap-1.5 text-sm font-black uppercase tracking-wide text-slate-500">
                <Truck className="h-4 w-4 text-blue-600" aria-hidden />
                Spedizione
              </h2>
              {caricamentoSpedizione ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calcolo tariffe...
                </p>
              ) : opzioniSpedizione.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">Nessuna opzione di spedizione disponibile.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {nessunServizioAttivo && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                      {MESSAGGIO_NESSUNA_SPEDIZIONE}
                    </p>
                  )}
                  {TIER_ORDINE.map((tier) => {
                    const delTier = opzioniSpedizione.filter((o) => o.tier === tier);
                    if (delTier.length === 0) return null;
                    return (
                      <div key={tier}>
                        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                          {TIER_LABEL[tier]}
                        </p>
                        <div className="space-y-2">
                          {delTier.map((opzione) => {
                            const selezionata =
                              spedizioneScelta?.carrier === opzione.carrier &&
                              spedizioneScelta?.servizio === opzione.servizio;
                            return (
                              <label
                                key={`${opzione.carrier}:${opzione.servizio}`}
                                className={`flex items-center gap-3 rounded-lg border p-3 transition ${
                                  selezionata
                                    ? "border-blue-400 bg-blue-50/50"
                                    : opzione.disponibile
                                    ? "cursor-pointer border-slate-200 bg-white hover:border-slate-300"
                                    : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="spedizione"
                                  checked={selezionata}
                                  disabled={!opzione.disponibile}
                                  onChange={() =>
                                    setSpedizioneScelta({
                                      carrier: opzione.carrier,
                                      servizio: opzione.servizio,
                                    })
                                  }
                                  className="h-4 w-4 accent-blue-600"
                                />
                                <div className="flex flex-1 items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                                      {opzione.carrierNome}
                                      {opzione.servizioNome ? (
                                        <span className="font-normal text-slate-500">{opzione.servizioNome}</span>
                                      ) : null}
                                      {!opzione.disponibile && (
                                        <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                                          Non disponibile
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                      {opzione.descrizione ?? opzione.tempoConsegna ?? "Consegna concordata con il negozio"}
                                    </p>
                                    {!opzione.disponibile && opzione.motivo && (
                                      <p className="mt-0.5 text-[10px] leading-4 text-slate-400">{opzione.motivo}</p>
                                    )}
                                  </div>
                                  <span className="shrink-0 text-sm font-bold text-slate-900">
                                    {opzione.disponibile && opzione.gratuita
                                      ? "Spedizione gratuita"
                                      : opzione.disponibile && opzione.prezzo !== null
                                        ? `€${opzione.prezzo.toFixed(2)}`
                                        : "—"}
                                  </span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-[10px] leading-4 text-slate-400">
                    {pesoGrammi && pesoGrammi > 0
                      ? `Pacco: ${(pesoGrammi / 1000).toLocaleString("it-IT", { maximumFractionDigits: 2 })} kg · `
                      : ""}
                    Tariffa di spedizione calcolata automaticamente da InCittà in base al corriere e alle
                    caratteristiche della spedizione.
                  </p>
                </div>
              )}
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
                {catalogoMetodi.map((m) => {
                  if (m.metodo === "carta") {
                    return (
                      <OpzioneRadio
                        key="carta"
                        selezionato={metodoPagamento === "carta"}
                        onClick={() => setMetodoPagamento("carta")}
                        icona={<CreditCard className="h-4 w-4 text-slate-500" />}
                        titolo={m.etichetta}
                        sotto={m.descrizione}
                        disponibile={m.disponibile}
                        nonDisponibileMessaggio={!m.disponibile ? messaggioNonDisponibile(m.nomeBreve) : undefined}
                      />
                    );
                  }
                  if (m.metodo === "klarna") {
                    return (
                      <OpzioneKlarna
                        key="klarna"
                        selezionato={metodoPagamento === "klarna"}
                        onClick={() => setMetodoPagamento("klarna")}
                        disponibile={m.disponibile}
                        nonDisponibileMessaggio={!m.disponibile ? messaggioNonDisponibile(m.nomeBreve) : undefined}
                      />
                    );
                  }
                  if (m.metodo === "paypal") {
                    return (
                      <OpzionePaypal
                        key="paypal"
                        selezionato={metodoPagamento === "paypal"}
                        onClick={() => setMetodoPagamento("paypal")}
                        disponibile={m.disponibile}
                        nonDisponibileMessaggio={!m.disponibile ? messaggioNonDisponibile(m.nomeBreve) : undefined}
                      />
                    );
                  }
                  if (m.metodo === "scalapay") {
                    return (
                      <OpzioneRadio
                        key="scalapay"
                        selezionato={metodoPagamento === "scalapay"}
                        onClick={() => setMetodoPagamento("scalapay")}
                        icona={
                          <span className="inline-flex shrink-0 items-center rounded bg-slate-900 px-1.5 py-0.5 text-[9px] font-black tracking-wide text-white">
                            Scalapay
                          </span>
                        }
                        titolo={m.etichetta}
                        sotto={m.descrizione}
                        disponibile={m.disponibile}
                        nonDisponibileMessaggio={!m.disponibile ? messaggioNonDisponibile(m.nomeBreve) : undefined}
                      />
                    );
                  }
                  if (m.metodo === "bonifico") {
                    return (
                      <OpzioneRadio
                        key="bonifico"
                        selezionato={metodoPagamento === "bonifico"}
                        onClick={() => setMetodoPagamento("bonifico")}
                        icona={<Banknote className="h-4 w-4 text-slate-500" />}
                        titolo={m.etichetta}
                        sotto={m.descrizione}
                        disponibile={m.disponibile}
                      />
                    );
                  }
                  return null;
                })}
              </div>
              {catalogoMetodi.some((m) => !m.disponibile) && (
                <p className="mt-2 text-[11px] leading-4 text-slate-500">
                  Metodi disponibili:{" "}
                  <span className="font-semibold text-slate-700">
                    {catalogoMetodi
                      .filter((m) => m.disponibile)
                      .map((m) => m.nomeBreve)
                      .join(", ")}
                  </span>
                </p>
              )}
              {(metodoPagamento === "carta" ||
                metodoPagamento === "klarna" ||
                metodoPagamento === "scalapay" ||
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

          {ritiroIncompleto && (
            <p className="text-[11px] leading-4 text-slate-500">
              Compila nome, cognome, data e fascia oraria per confermare il ritiro.
            </p>
          )}

          <button
            type="button"
            onClick={invia}
            disabled={inviando || ritiroIncompleto}
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
            </section>
          ))}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-slate-900">Totale prodotti</span>
              <span className="text-lg font-black text-emerald-700 tabular-nums">{formattaEuro(soloRighe)}</span>
            </div>
            {modalita === "spedizione" && (
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                <span className="text-xs font-semibold text-slate-500">Spedizione</span>
                <span className="text-sm font-bold text-slate-900 tabular-nums">
                  {caricamentoSpedizione ? "…" : formattaEuro(costoSpedizioneUI)}
                </span>
              </div>
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
  disponibile = true,
  nonDisponibileMessaggio,
}: {
  selezionato: boolean;
  onClick: () => void;
  titolo: string;
  sotto: string;
  prezzo?: string;
  icona?: React.ReactNode;
  disponibile?: boolean;
  nonDisponibileMessaggio?: string;
}) {
  return (
    <button
      type="button"
      onClick={disponibile ? onClick : undefined}
      aria-pressed={selezionato}
      disabled={!disponibile}
      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
        selezionato
          ? "border-blue-400 bg-blue-50/50"
          : disponibile
          ? "border-slate-200 bg-white hover:border-slate-300"
          : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70"
      }`}
    >
      {icona && <span className="shrink-0">{icona}</span>}
      <span className="flex flex-1 items-center justify-between gap-2">
        <span>
          <span className="block text-sm font-semibold text-slate-900">{titolo}</span>
          <span className="block text-[11px] text-slate-500">{sotto}</span>
          {!disponibile && (
            <span className="mt-1 inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">
              Non disponibile
            </span>
          )}
          {!disponibile && nonDisponibileMessaggio && (
            <span className="mt-1 block text-[11px] leading-4 text-slate-500">{nonDisponibileMessaggio}</span>
          )}
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
  disponibile = true,
  nonDisponibileMessaggio,
}: {
  selezionato: boolean;
  onClick: () => void;
  disponibile?: boolean;
  nonDisponibileMessaggio?: string;
}) {
  return (
    <button
      type="button"
      onClick={disponibile ? onClick : undefined}
      aria-pressed={selezionato}
      disabled={!disponibile}
      className={`w-full rounded-lg border p-3 text-left transition ${
        selezionato
          ? "border-blue-400 bg-blue-50/50"
          : disponibile
          ? "border-slate-200 bg-white hover:border-slate-300"
          : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70"
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
      <span className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
        Klarna
        {!disponibile && (
          <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">
            Non disponibile
          </span>
        )}
      </span>
      <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
        Dividi il tuo acquisto in 3 rate, se disponibile.
      </span>
      <span className="mt-1 block text-[10px] leading-4 text-slate-400">
        Soggetto ad approvazione e alle condizioni di Klarna.
      </span>
      {!disponibile && nonDisponibileMessaggio && (
        <span className="mt-1 block text-[11px] leading-4 text-slate-500">{nonDisponibileMessaggio}</span>
      )}
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
  disponibile = true,
  nonDisponibileMessaggio,
}: {
  selezionato: boolean;
  onClick: () => void;
  disponibile?: boolean;
  nonDisponibileMessaggio?: string;
}) {
  return (
    <button
      type="button"
      onClick={disponibile ? onClick : undefined}
      aria-pressed={selezionato}
      disabled={!disponibile}
      className={`w-full rounded-lg border p-3 text-left transition ${
        selezionato
          ? "border-blue-400 bg-blue-50/50"
          : disponibile
          ? "border-slate-200 bg-white hover:border-slate-300"
          : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70"
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
      <span className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
        PayPal
        {!disponibile && (
          <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">
            Non disponibile
          </span>
        )}
      </span>
      <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
        Paga con il tuo conto PayPal o con una carta.
      </span>
      {!disponibile && nonDisponibileMessaggio && (
        <span className="mt-1 block text-[11px] leading-4 text-slate-500">{nonDisponibileMessaggio}</span>
      )}
    </button>
  );
}
