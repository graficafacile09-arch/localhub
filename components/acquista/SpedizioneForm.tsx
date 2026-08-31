"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Truck, CreditCard, Banknote, Loader2 } from "lucide-react";
import QuantitySelector from "./QuantitySelector";
import LocalitaFields, {
  type CampoLocalita,
} from "@/components/indirizzo/LocalitaFields";
import { creaOrdineViaApi, nuovaChiaveIdempotenza } from "@/lib/cliente/ordini-client";
import type { MetodoPagamentoCheckout } from "@/lib/pagamenti/metodi-pubblici";
import {
  MESSAGGIO_NESSUNA_SPEDIZIONE,
  type CarrierCodice,
  type OpzioneSpedizione,
  type ServizioCodice,
  type TierSpedizione,
} from "@/lib/spedizioni/catalogo";
import FatturazioneForm, {
  DATI_FATTURAZIONE_VUOTI,
  validaDatiFatturazione,
  type DatiFatturazione,
} from "./FatturazioneForm";

const TIER_LABEL: Record<TierSpedizione, string> = {
  standard: "Standard",
  express: "Express",
  locale: "Corriere locale",
};
const TIER_ORDINE: TierSpedizione[] = ["standard", "express", "locale"];

/**
 * Dati del cliente precompilati dal profilo (server-side, mai dal browser).
 * `autenticato: false` → form vuoto, comportamento attuale.
 */
type PrefillProfilo = {
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

export default function SpedizioneForm({
  nome,
  prezzo,
  imageUrl,
  prodottoId,
  varianteId,
  metodiPagamento = [],
  prefill,
}: {
  nome: string;
  prezzo: number;
  imageUrl: string;
  prodottoId: string;
  /** Variante selezionata (FASE E4): solo trasportata, validata dal server. */
  varianteId?: string | null;
  /**
   * Catalogo dei metodi di pagamento supportati da InCittà, ognuno con il
   * flag `disponibile` reale per questo negozio. La UI mostra SEMPRE l'intero
   * catalogo; i metodi non disponibili restano visibili ma non selezionabili.
   */
  metodiPagamento?: MetodoPagamentoCheckout[];
  /** Precompilazione dal profilo cliente (autenticato). Default: vuoto. */
  prefill?: PrefillProfilo;
}) {
  const router = useRouter();
  const p = prefill ?? {
    nome: "", cognome: "", email: "", telefono: "",
    indirizzo: "", cap: "", citta: "", provincia: "", autenticato: false,
  };
  const [quantita, setQuantita] = useState(1);
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
  // CONTRATTO BUY-NOW: il metodo di pagamento parte SEMPRE da null = NESSUNA
  // scelta. Mai un metodo pre-selezionato (nemmeno quando ne esiste uno solo):
  // "disponibile" NON significa "selezionato". Il submit è bloccato finché
  // l'utente non sceglie esplicitamente un metodo (vedi pulsante disabilitato).
  const [metodoPagamento, setMetodoPagamento] = useState<
    "carta" | "bonifico" | "klarna" | "scalapay" | "paypal" | null
  >(null);
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  // CAP / Città / Provincia collegati (valori sincronizzati dal componente
  // LocalitaFields; il submit li legge dallo stato).
  const [cap, setCap] = useState(p.cap);
  const [citta, setCitta] = useState(p.citta);
  const [provincia, setProvincia] = useState(p.provincia);
  const aggiornaLocalita = (campo: CampoLocalita, valore: string) => {
    if (campo === "cap") setCap(valore);
    else if (campo === "citta") setCitta(valore);
    else setProvincia(valore);
  };
  // DATI CLIENTE precompilati dal profilo (controllati): inizializzati con i
  // valori reali del profilo, mai lasciati vuoti. Il profilo NON viene mai
  // modificato: questi state vivono SOLO nel checkout.
  const [datiCliente, setDatiCliente] = useState({
    nome: p.nome,
    cognome: p.cognome,
    telefono: p.telefono,
    email: p.email,
    indirizzo: p.indirizzo,
  });
  const aggiornaDato = (campo: "nome" | "cognome" | "telefono" | "email" | "indirizzo", valore: string) =>
    setDatiCliente((prev) => ({ ...prev, [campo]: valore }));
  // Indirizzo proveniente dal profilo. All'avvio resta "riepilogo" finché
  // l'utente non clicca "CAMBIA INDIRIZZO", che attiva i campi modificabili
  // per SOLO questo ordine (il profilo resta invariato).
  const [cambiaIndirizzo, setCambiaIndirizzo] = useState(false);
  const indirizzoDaProfilo =
    p.autenticato && (p.indirizzo || "").trim().length > 0;
  const formRef = useRef<HTMLFormElement>(null);
  // Chiave di idempotenza: generata UNA volta per pagina → un doppio click
  // (o retry) non crea mai due ordini.
  const chiaveIdempotenza = useRef<string>(nuovaChiaveIdempotenza());
  // Indirizzo di fatturazione (chiuso per default: si usano i dati spedizione).
  const [fatturazione, setFatturazione] = useState<DatiFatturazione>(DATI_FATTURAZIONE_VUOTI);
  const [erroriFatturazione, setErroriFatturazione] = useState<Record<string, string>>({});

  const opzioneScelta = opzioniSpedizione.find(
    (o) =>
      o.carrier === spedizioneScelta?.carrier && o.servizio === spedizioneScelta?.servizio
  );
  const costoSpedizione = opzioneScelta?.prezzo ?? 0;
  const subtotal = prezzo * quantita;
  const totale = subtotal + costoSpedizione;

  // Preventivo spedizione server-side: ricalcolato quando cambia la quantità.
  useEffect(() => {
    let attivo = true;
    setCaricamentoSpedizione(true);
    fetch("/api/cliente/ordini/spedizione/preventivo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prodottoId, quantita }),
    })
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: { opzioni?: OpzioneSpedizione[]; pesoGrammi?: number | null; nessunServizioAttivo?: boolean } }) => {
        if (!attivo) return;
        const opzioni = json?.data?.opzioni ?? [];
        setOpzioniSpedizione(opzioni);
        setPesoGrammi(json?.data?.pesoGrammi ?? null);
        setNessunServizioAttivo(json?.data?.nessunServizioAttivo ?? false);
        // Se la scelta corrente non è più disponibile la si azzera (mai una
        // selezione su un metodo non selezionabile).
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
  }, [prodottoId, quantita]);

  const procediAlPagamento = async () => {
    if (inviando) return; // anti doppio invio
    // REGOLA ASSOLUTA: nessuna scelta esplicita di metodo di pagamento →
    // submit bloccato, nessuna chiamata a /api/cliente/ordini. Difesa anche
    // se il pulsante venisse attivato da stato/browser precedenti.
    if (metodoPagamento === null) {
      setErrore("Seleziona un metodo di pagamento per continuare.");
      return;
    }
    if (spedizioneScelta === null) {
      setErrore("Seleziona un corriere di spedizione.");
      return;
    }
    const form = formRef.current;
    if (!form) return;

    // Note consegna: campo uncontrolled letta via FormData (le voci cliente
    // autoritative sono gli state reattivi qui sotto).
    const datiForm = new FormData(form);
    const val = (chiave: string) => String(datiForm.get(chiave) ?? "").trim();

    // DATI CLIENTE autoritativi = stato React (precompilato dal profilo o
    // modificato dall'utente). Leggere dallo stato garantisce che l'ordine
    // usi DAVVERO ciò che il cliente ha ora nel form (mai il profilo riletto).
    const nomeC = datiCliente.nome.trim();
    const cognomeC = datiCliente.cognome.trim();
    const indirizzoC = datiCliente.indirizzo.trim();

    if (!nomeC || !cognomeC) {
      setErrore("Inserisci nome e cognome.");
      return;
    }
    if (!indirizzoC || !cap.trim() || !citta.trim() || !provincia.trim()) {
      setErrore("Completa l'indirizzo di spedizione.");
      return;
    }

    // Fatturazione diversa: campi obbligatori, blocco invio se incompleti.
    if (fatturazione.diversa) {
      const errFatt = validaDatiFatturazione(fatturazione);
      if (Object.keys(errFatt).length > 0) {
        setErroriFatturazione(errFatt);
        setErrore("Completa l'indirizzo di fatturazione.");
        return;
      }
    }
    setErroriFatturazione({});

    setInviando(true);
    setErrore(null);
    try {
      const esito = await creaOrdineViaApi({
        idempotencyKey: chiaveIdempotenza.current,
        prodottoId,
        varianteId: varianteId ?? null,
        quantita,
        modalita: "spedizione",
        cliente: {
          nome: nomeC,
          cognome: cognomeC,
          telefono: datiCliente.telefono.trim() || null,
          email: datiCliente.email.trim() || null,
        },
        spedizione: {
          indirizzo: indirizzoC,
          cap: cap.trim(),
          citta: citta.trim(),
          provincia: provincia.trim().toUpperCase(),
          note: val("note") || null,
          carrier: spedizioneScelta.carrier,
          servizio: spedizioneScelta.servizio,
          metodoPagamento,
        },
        fatturazione: fatturazione.diversa
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
          : null,
      });

      if (!esito.ok) {
        setErrore(esito.errore);
        setInviando(false);
        return;
      }

      // Chiusura Assistente AI.
      window.dispatchEvent(new Event("assistant:close"));

      // FASE F1 — metodo "carta": l'API ha creato l'ordine e la sessione
      // Stripe → reindirizza DAVVERO a Stripe (mai alla conferma "finta").
      if (esito.pagamento?.redirectUrl) {
        window.location.href = esito.pagamento.redirectUrl;
        return;
      }

      // Altri metodi (bonifico/manuale): conferma ordine come oggi.
      router.push(`/ordini/conferma/${esito.ordineId}`);
    } catch {
      setErrore("Si è verificato un errore. Riprova.");
      setInviando(false);
    }
  };

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {/* Colonna sinistra: prodotto */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl">
          <div className="relative aspect-square max-h-[300px] overflow-hidden bg-slate-100">
            <div
              role="img"
              aria-label={nome}
              className="h-full w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${imageUrl})` }}
            />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-black text-slate-900">{nome}</h2>
          <p className="text-2xl font-black text-emerald-700">
            €{prezzo.toFixed(2)}
          </p>
        </div>

        {/* Quantità */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">Quantità</h3>
          <div className="mt-3">
            <QuantitySelector value={quantita} onChange={setQuantita} />
          </div>
        </div>
      </div>

      {/* Colonna destra: form */}
      <form ref={formRef} className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        {/* Indirizzo di spedizione */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">
            <Truck className="mr-1.5 inline-block h-4 w-4 text-blue-500" />
            Indirizzo di spedizione
          </h3>
          {!p.autenticato && (
            <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
              Stai acquistando come ospite: compila i tuoi dati qui sotto. Non è richiesta la
              registrazione.
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <CampoProfilo
              label="Nome"
              id="nome"
              value={datiCliente.nome}
              onChange={(v) => aggiornaDato("nome", v)}
              required
            />
            <CampoProfilo
              label="Cognome"
              id="cognome"
              value={datiCliente.cognome}
              onChange={(v) => aggiornaDato("cognome", v)}
              required
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <CampoProfilo
              label="Telefono"
              id="telefono"
              type="tel"
              value={datiCliente.telefono}
              onChange={(v) => aggiornaDato("telefono", v)}
              required
            />
            <CampoProfilo
              label="Email"
              id="email"
              type="email"
              value={datiCliente.email}
              onChange={(v) => aggiornaDato("email", v)}
              required
            />
          </div>
          {p.autenticato && (
            <p className="mt-2 text-[11px] text-slate-400">
              Precompilati dal tuo profilo (puoi modificarli per questo ordine).
            </p>
          )}
          {/* Riepilogo indirizzo dal profilo → CAMBIA INDIRIZZO */}
          {indirizzoDaProfilo && !cambiaIndirizzo ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    Indirizzo di consegna (dal tuo profilo)
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{datiCliente.indirizzo}</p>
                  <p className="text-sm text-slate-700">
                    {citta}
                    {cap ? `, ${cap}` : ""}
                    {provincia ? ` (${provincia})` : ""}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">
                    Puoi cambiarlo solo per questo ordine senza modificare il profilo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCambiaIndirizzo(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-yellow-200 bg-white px-3 py-2 text-xs font-bold text-yellow-800 shadow-sm transition hover:border-yellow-400 hover:bg-yellow-50"
                >
                  <Truck className="h-3.5 w-3.5" aria-hidden />
                  CAMBIA INDIRIZZO
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <CampoProfilo
                label="Indirizzo"
                id="indirizzo"
                value={datiCliente.indirizzo}
                onChange={(v) => aggiornaDato("indirizzo", v)}
                required
              />
              <LocalitaFields
                cap={cap}
                citta={citta}
                provincia={provincia}
                onChange={aggiornaLocalita}
                required
              />
            </div>
          )}
          <div className="mt-3">
            <FormField label="Note consegna" id="note" />
          </div>
        </div>

        {/* Indirizzo di fatturazione (chiuso per default) */}
        <FatturazioneForm
          value={fatturazione}
          onChange={setFatturazione}
          errori={erroriFatturazione}
        />

        {/* Spedizione — catalogo corrieri, prezzo calcolato da InCittà */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">
            <Package className="mr-1.5 inline-block h-4 w-4 text-blue-500" />
            Spedizione
          </h3>
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
                                ? "border-yellow-400 bg-yellow-50"
                                : opzione.disponibile
                                ? "cursor-pointer border-slate-200 bg-white hover:border-yellow-300"
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
        </div>

        {/* Metodo pagamento: SEMPRE l'intero catalogo supportato da InCittà.
            Ogni metodo mostra se è realmente disponibile per questo negozio;
            i non disponibili restano visibili ma non selezionabili. */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">
            <CreditCard className="mr-1.5 inline-block h-4 w-4 text-blue-500" />
            Metodo pagamento
          </h3>
          <div className="mt-3 space-y-2">
            {metodiPagamento.map((metodo) => {
              const selezionato = metodoPagamento === metodo.metodo;
              const selezionabile = metodo.disponibile;
              return (
                <label
                  key={metodo.metodo}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition ${
                    selezionato
                      ? "border-yellow-400 bg-yellow-50"
                      : selezionabile
                      ? "cursor-pointer border-slate-200 bg-white hover:border-yellow-300"
                      : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70"
                  }`}
                >
                  <input
                    type="radio"
                    name="pagamento"
                    value={metodo.metodo}
                    checked={selezionato}
                    disabled={!selezionabile}
                    onChange={() => setMetodoPagamento(metodo.metodo)}
                    className="h-4 w-4 accent-blue-600"
                  />
                  <div className="flex flex-1 items-center gap-2">
                    {metodo.metodo === "klarna" ? (
                      // Klarna: logo ufficiale locale (wordmark rosa) — nessun
                      // importo delle rate calcolato lato frontend (il totale
                      // resta esclusivamente server-side).
                      <img
                        src="/loghi/klarna-pink.svg"
                        alt="Klarna"
                        width={64}
                        height={14}
                        className="h-3.5 w-auto shrink-0 object-contain"
                      />
                    ) : metodo.metodo === "paypal" ? (
                      // PayPal: logo ufficiale locale (wordmark).
                      <img
                        src="/loghi/paypal.svg"
                        alt="PayPal"
                        width={64}
                        height={16}
                        className="h-3.5 w-auto shrink-0 object-contain"
                      />
                    ) : metodo.metodo === "scalapay" ? (
                      <span className="inline-flex shrink-0 items-center rounded bg-slate-900 px-1.5 py-0.5 text-[9px] font-black tracking-wide text-white">
                        Scalapay
                      </span>
                    ) : metodo.metodo === "carta" ? (
                      <CreditCard className="h-4 w-4 shrink-0 text-slate-500" />
                    ) : (
                      <Banknote className="h-4 w-4 shrink-0 text-slate-500" />
                    )}
                    <div className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                        {metodo.etichetta}
                        {(metodo.metodo === "klarna" || metodo.metodo === "scalapay") && selezionabile && (
                          <span className="inline-flex shrink-0 items-center rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">
                            Paga in 3 rate
                          </span>
                        )}
                        {!selezionabile && (
                          <span className="inline-flex shrink-0 items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                            Non disponibile
                          </span>
                        )}
                      </span>
                      <p className="text-[11px] text-slate-500">{metodo.descrizione}</p>
                      {metodo.metodo === "klarna" && selezionabile && (
                        <p className="mt-0.5 text-[10px] leading-4 text-slate-400">
                          Soggetto ad approvazione e alle condizioni di Klarna.
                        </p>
                      )}
                      {!selezionabile && (
                        <p className="mt-0.5 text-[10px] leading-4 text-slate-400">
                          {metodo.nomeBreve} non disponibile per questo negozio.
                        </p>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          {metodiPagamento.some((m) => !m.disponibile) && (
            <p className="mt-3 text-[11px] leading-4 text-slate-500">
              Metodi disponibili per questo negozio:{" "}
              <span className="font-semibold text-slate-700">
                {metodiPagamento
                  .filter((m) => m.disponibile)
                  .map((m) => m.nomeBreve)
                  .join(", ")}
              </span>
            </p>
          )}
        </div>

        {/* Riepilogo ordine */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold text-slate-900">Riepilogo ordine</h3>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex-1 text-slate-700">
                {nome} × {quantita}
              </span>
              <span className="font-semibold text-slate-900">
                €{subtotal.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Spedizione</span>
              <span className="text-slate-700">€{costoSpedizione.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-1 font-bold">
              <span className="text-slate-900">Totale</span>
              <span className="text-lg font-black text-slate-900">
                €{totale.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Errore di invio */}
        {errore && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errore}
          </div>
        )}

        {/* Procedi al pagamento: disabilitato finché non c'è una SCELTA
            ESPLICITA di metodo di pagamento (metodoPagamento !== null). */}
        <button
          type="button"
          onClick={procediAlPagamento}
          disabled={inviando || metodoPagamento === null || spedizioneScelta === null}
          className="btn-cta w-full py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {inviando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Invio ordine...
            </>
          ) : (
            "Procedi al pagamento"
          )}
        </button>
      </form>
    </div>
  );
}

function FormField({
  label,
  id,
  type = "text",
  required = false,
}: {
  label: string;
  id: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-slate-700"
      >
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={type}
        id={id}
        name={id}
        required={required}
        className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-100"
      />
    </div>
  );
}

/**
 * Campo CONTROLLED del checkout buy-now: lo stato React (precompilato dal
 * profilo o modificato dall'utente) è autorevole. Mantiene `name`/`id` così
 * che il FormData (note ecc.) continui a funzionare insieme ai valori.
 */
function CampoProfilo({
  label,
  id,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-slate-700"
      >
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={type}
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-100"
      />
    </div>
  );
}