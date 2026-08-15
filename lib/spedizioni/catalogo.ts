/**
 * SPEDIZIONI — CATALOGO CORRIERI/SERVIZI + TARIFFE DI RIFERIMENTO.
 *
 * File STATICO PURO (nessun accesso al DB, nessun secret): importabile sia
 * lato server sia lato client. È la fonte della NOMENCLATURA (chi esiste) e
 * delle TARIFFE UFFICIALI DI RIFERIMENTO usate:
 *
 *   - come FIXTURE dei test tariffari (niente DB nei test);
 *   - come FALLBACK quando le tabelle tariffarie del DB non sono ancora
 *     presenti (migrazione 20260831 non applicata).
 *
 * ⚠️ La FONTE AUTORITATIVA in produzione è il DATABASE (tabelle
 * `shipping_carriers` / `shipping_services` / `shipping_tariffs` /
 * `shipping_tariff_versions`, migrate 20260831_tariffe_spedizione.sql): il
 * motore legge i prezzi dal DB, così i listini si aggiornano SENZA toccare il
 * codice del checkout. Le costanti qui sotto devono restare ALLINEATE al seed
 * della migrazione (sono gli stessi valori, duplicati solo per test/fallback).
 *
 * PREZZO DETERMINATO DA INCITTÀ: il venditore NON inserisce mai una tariffa
 * Poste/BRT. L'unica eccezione è il CORRIERE LOCALE, il cui prezzo è
 * configurato dal venditore PER SINGOLO PRODOTTO (prodotti.costo_spedizione_locale).
 *
 * MODELLO CORRIERI/SERVIZI (definitivo):
 *   - POSTE ITALIANE → servizi "standard" e "express" (tariffa automatica);
 *   - BRT            → servizio "online" (tariffa automatica, 24/48h);
 *   - CORRIERE LOCALE→ modalità distinta, prezzo dal prodotto (MAX in carrello).
 */

// ═══════════════════════════════════════════════════════════════════
// Tipi
// ═══════════════════════════════════════════════════════════════════

/** Codice corriere (coerente con shipping_carriers.codice). */
export type CarrierCodice = "poste_italiane" | "brt" | "locale";

/** Codice servizio (coerente con shipping_services.codice + "locale"). */
export type ServizioCodice = "standard" | "express" | "online" | "locale";

/** Raggruppamento UI della selezione spedizione (tipo marketplace). */
export type TierSpedizione = "standard" | "express" | "locale";

/** Voce del catalogo corrieri/servizi (ordine di visualizzazione canonico). */
export type VoceCatalogoSpedizione = {
  carrier: CarrierCodice;
  servizio: ServizioCodice;
  tier: TierSpedizione;
  /** Nome del corriere mostrato al cliente (es. "Poste Italiane"). */
  carrierNome: string;
  /** Nome del servizio (es. "Standard"). */
  servizioNome: string;
  /** Etichetta completa (es. "Poste Italiane Standard"). */
  etichetta: string;
  /** Tempo di consegna stimato (null se non dichiarato dal corriere). */
  tempoConsegna: string | null;
  /** "tariffa" = prezzo calcolato da InCittà; "locale" = prezzo del prodotto. */
  fonte: "tariffa" | "locale";
};

/** Fascia di peso tariffaria (peso in GRAMMI, prezzo in euro IVA inclusa). */
export type FasciaTariffaria = {
  /** Limite inferiore ESCLUSIVO (0 = nessun minimo). */
  pesoMinG: number;
  /** Limite superiore INCLUSIVO. */
  pesoMaxG: number;
  prezzo: number;
};

/**
 * Un'opzione di spedizione restituita dal preventivo server-side: il catalogo
 * completo, ognuna con il proprio prezzo calcolato e il flag `disponibile`
 * reale. Un metodo supportato ma non disponibile (peso mancante, tariffa
 * locale assente) resta VISIBILE ma non selezionabile — mai rimosso, mai con
 * un prezzo inventato.
 */
export type OpzioneSpedizione = {
  carrier: CarrierCodice;
  servizio: ServizioCodice;
  tier: TierSpedizione;
  carrierNome: string;
  servizioNome: string;
  etichetta: string;
  tempoConsegna: string | null;
  /** Prezzo in euro (totale per l'intero checkout) calcolato dal server. */
  prezzo: number | null;
  /** True se realmente selezionabile per questo prodotto/carrello. */
  disponibile: boolean;
  /** Motivo di indisponibilità (es. "Peso non configurato dal negozio"). */
  motivo: string | null;
};

/** Esito del preventivo spedizione (calcolato server-side). */
export type PreventivoSpedizione = {
  ok: boolean;
  opzioni: OpzioneSpedizione[];
  /** Peso totale in grammi usato per il calcolo (null se sconosciuto). */
  pesoGrammi: number | null;
  /** True se almeno un prodotto non ha peso configurato (blocca Poste/BRT). */
  pesoMancante: boolean;
  /** Codice d'errore (solo se ok === false). */
  codice?: string;
  messaggio?: string;
};

// ═══════════════════════════════════════════════════════════════════
// Catalogo corrieri/servizi (ordine di visualizzazione canonico)
// ═══════════════════════════════════════════════════════════════════

export const CATALOGO_SPEDIZIONE: readonly VoceCatalogoSpedizione[] = [
  {
    carrier: "poste_italiane",
    servizio: "standard",
    tier: "standard",
    carrierNome: "Poste Italiane",
    servizioNome: "Standard",
    etichetta: "Poste Italiane Standard",
    tempoConsegna: "3-5 giorni lavorativi",
    fonte: "tariffa",
  },
  {
    carrier: "brt",
    servizio: "online",
    tier: "standard",
    carrierNome: "BRT",
    servizioNome: "Standard",
    etichetta: "BRT",
    tempoConsegna: "24/48 ore",
    fonte: "tariffa",
  },
  {
    carrier: "poste_italiane",
    servizio: "express",
    tier: "express",
    carrierNome: "Poste Italiane",
    servizioNome: "Express",
    etichetta: "Poste Italiane Express",
    tempoConsegna: "1-2 giorni lavorativi",
    fonte: "tariffa",
  },
  {
    carrier: "locale",
    servizio: "locale",
    tier: "locale",
    carrierNome: "Corriere locale",
    servizioNome: "Locale",
    etichetta: "Corriere locale",
    tempoConsegna: null,
    fonte: "locale",
  },
] as const;

// ═══════════════════════════════════════════════════════════════════
// Tariffe ufficiali di riferimento (allineate al seed della migrazione)
// ═══════════════════════════════════════════════════════════════════

/**
 * Poste Italiane — Poste Delivery Web (consumer, Standard).
 * Fonte: listino ufficiale Poste Delivery Web (nazionale). Prezzi in euro.
 */
export const TARIFFE_POSTE_STANDARD: readonly FasciaTariffaria[] = [
  { pesoMinG: 0, pesoMaxG: 1000, prezzo: 5.65 },
  { pesoMinG: 1000, pesoMaxG: 2000, prezzo: 5.9 },
  { pesoMinG: 2000, pesoMaxG: 3000, prezzo: 6.7 },
  { pesoMinG: 3000, pesoMaxG: 5000, prezzo: 7.3 },
  { pesoMinG: 5000, pesoMaxG: 10000, prezzo: 10.4 },
  { pesoMinG: 10000, pesoMaxG: 15000, prezzo: 11.7 },
  { pesoMinG: 15000, pesoMaxG: 20000, prezzo: 12.3 },
  { pesoMinG: 20000, pesoMaxG: 25000, prezzo: 14.8 },
  { pesoMinG: 25000, pesoMaxG: 30000, prezzo: 14.8 },
  { pesoMinG: 30000, pesoMaxG: 40000, prezzo: 28.3 },
  { pesoMinG: 40000, pesoMaxG: 50000, prezzo: 32.3 },
  { pesoMinG: 50000, pesoMaxG: 70000, prezzo: 39.7 },
];

/** Poste Italiane — Poste Delivery Web (consumer, Express). */
export const TARIFFE_POSTE_EXPRESS: readonly FasciaTariffaria[] = [
  { pesoMinG: 0, pesoMaxG: 1000, prezzo: 6.65 },
  { pesoMinG: 1000, pesoMaxG: 2000, prezzo: 6.9 },
  { pesoMinG: 2000, pesoMaxG: 3000, prezzo: 7.7 },
  { pesoMinG: 3000, pesoMaxG: 5000, prezzo: 8.3 },
  { pesoMinG: 5000, pesoMaxG: 10000, prezzo: 11.2 },
  { pesoMinG: 10000, pesoMaxG: 15000, prezzo: 12.5 },
  { pesoMinG: 15000, pesoMaxG: 20000, prezzo: 13.1 },
  { pesoMinG: 20000, pesoMaxG: 25000, prezzo: 15.6 },
  { pesoMinG: 25000, pesoMaxG: 30000, prezzo: 15.6 },
  { pesoMinG: 30000, pesoMaxG: 40000, prezzo: 29.9 },
  { pesoMinG: 40000, pesoMaxG: 50000, prezzo: 33.9 },
  { pesoMinG: 50000, pesoMaxG: 70000, prezzo: 41.9 },
];

/**
 * BRT — C2X / Spedire online (HOME-TO-HOME), 24/48h. Prezzi IVA inclusa.
 * BRT NON offre un servizio "Express" distinto nel listino usato: esiste il
 * solo servizio online qui rappresentato (tier "standard").
 */
export const TARIFFE_BRT_ONLINE: readonly FasciaTariffaria[] = [
  { pesoMinG: 0, pesoMaxG: 2000, prezzo: 13.89 },
  { pesoMinG: 2000, pesoMaxG: 5000, prezzo: 15.75 },
  { pesoMinG: 5000, pesoMaxG: 10000, prezzo: 18.35 },
  { pesoMinG: 10000, pesoMaxG: 20000, prezzo: 20.95 },
  { pesoMinG: 20000, pesoMaxG: 31500, prezzo: 25.98 },
];

/**
 * Fasce tariffarie di RIFERIMENTO per un corriere+servizio, o null se il
 * corriere/servizio non è nel catalogo tariffario (es. corriere locale).
 */
export function fascePerCorriere(
  carrier: CarrierCodice,
  servizio: ServizioCodice
): readonly FasciaTariffaria[] | null {
  if (carrier === "poste_italiane" && servizio === "standard") return TARIFFE_POSTE_STANDARD;
  if (carrier === "poste_italiane" && servizio === "express") return TARIFFE_POSTE_EXPRESS;
  if (carrier === "brt" && servizio === "online") return TARIFFE_BRT_ONLINE;
  return null;
}

/**
 * Trova la fascia tariffaria applicabile a un peso in GRAMMI.
 * Regola coerente con la RPC calcola_tariffa_spedizione:
 * `peso > peso_min_g AND peso <= peso_max_g` (prima fascia in ordine).
 * Ritorna null se il peso eccede l'ultima fascia (mai un prezzo inventato).
 */
export function trovaFascia(
  pesoGrammi: number,
  fasce: readonly FasciaTariffaria[]
): FasciaTariffaria | null {
  for (const fascia of fasce) {
    if (pesoGrammi > fascia.pesoMinG && pesoGrammi <= fascia.pesoMaxG) return fascia;
  }
  return null;
}

/** Voce di catalogo per carrier+servizio (undefined se non supportato). */
export function voceCatalogoSpedizione(
  carrier: CarrierCodice,
  servizio: ServizioCodice
): VoceCatalogoSpedizione | undefined {
  return CATALOGO_SPEDIZIONE.find((v) => v.carrier === carrier && v.servizio === servizio);
}

/** True se il valore è un codice corriere supportato (coerente con la RPC). */
export function isCarrierCodice(v: unknown): v is CarrierCodice {
  return v === "poste_italiane" || v === "brt" || v === "locale";
}

/**
 * True se il servizio è valido PER quel corriere (coerente con la RPC):
 *   poste_italiane → standard | express;
 *   brt            → online (BRT non offre un servizio "express" distinto);
 *   locale         → locale.
 */
export function isServizioValidoPerCarrier(
  carrier: CarrierCodice,
  servizio: unknown
): servizio is ServizioCodice {
  if (carrier === "poste_italiane") return servizio === "standard" || servizio === "express";
  if (carrier === "brt") return servizio === "online";
  if (carrier === "locale") return servizio === "locale";
  return false;
}
