/**
 * SPEDIZIONI — MOTORE TARIFFARIO (server-side).
 *
 * Calcola il PREVENTIVO di spedizione leggendo SOLO dal database:
 *   - peso reale del prodotto (`prodotti.peso_grammi`, grammi);
 *   - tariffa corriere locale (`prodotti.costo_spedizione_locale`, euro);
 *   - listini ufficiali versionati (`shipping_tariff_versions` + `shipping_tariffs`).
 *
 * IL PREZZO È DETERMINATO DA INCITTÀ: questo modulo è la fonte autorevole del
 * preventivo mostrato al cliente (il checkout non conosce mai un prezzo di
 * spedizione: lo chiede qui). Il prezzo DEFINITIVO dell'ordine viene poi
 * ricalcolato dalla RPC `crea_ordine`/`crea_ordine_carrello` (migrazione
 * 20260831) a partire dalle STESSE tariffe e dal peso del catalogo: qualunque
 * `shipping_price` inviato dal browser viene ignorato.
 *
 * REGOLE DI CALCOLO:
 *   - Poste Italiane (standard/express) e BRT (online): tariffa per fascia di
 *     peso. Il peso complessivo = Σ(peso_grammi × quantità). Se un prodotto
 *     non ha peso (NULL o ≤0) → il corriere NON è disponibile (mai un peso o
 *     un prezzo inventato).
 *   - Corriere locale: prezzo configurato dal venditore PER SINGOLO PRODOTTO.
 *     In un carrello/ordine con più prodotti si applica il prezzo MASSIMO tra
 *     i prodotti dello STESSO negozio (una sola consegna per ordine, mai la
 *     somma cieca); tra negozi diversi i costi si SOMMANO (ogni negozio genera
 *     un ordine separato con la propria consegna).
 *   - Nessun fallback automatico di peso; nessun prezzo fittizio: un metodo
 *     non calcolabile resta visibile con `disponibile = false`.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  CATALOGO_SPEDIZIONE,
  fascePerCorriere,
  trovaFascia,
  type FasciaTariffaria,
  type OpzioneSpedizione,
  type PreventivoSpedizione,
  type ServizioCodice,
  type CarrierCodice,
} from "./catalogo";

/** Riga del preventivo (solo riferimenti, mai prezzi dal client). */
export type RigaPreventivo = {
  prodottoId: string;
  quantita: number;
};

const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

// ═══════════════════════════════════════════════════════════════════
// Caricamento tariffe dal DB (con fallback alle tariffe di riferimento)
// ═══════════════════════════════════════════════════════════════════

/**
 * Legge i listini ATTIVI dal database e li indicizza per "carrier:servizio".
 * Ritorna `null` se le tabelle tariffarie non sono ancora presenti (migrazione
 * non applicata): in quel caso il chiamante usa le tariffe di riferimento.
 */
async function caricaTariffeDb(): Promise<Map<string, FasciaTariffaria[]> | null> {
  const db = createAdminSupabaseClient();

  const { data: versione, error: errV } = await db
    .from("shipping_tariff_versions")
    .select("id")
    .eq("attiva", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errV || !versione) return null;

  const { data: corrieri, error: errC } = await db
    .from("shipping_carriers")
    .select("id, codice, attivo");
  if (errC || !corrieri) return null;

  const { data: servizi, error: errS } = await db
    .from("shipping_services")
    .select("id, carrier_id, codice, attivo");
  if (errS || !servizi) return null;

  const { data: tariffe, error: errT } = await db
    .from("shipping_tariffs")
    .select("service_id, peso_min_g, peso_max_g, prezzo")
    .eq("version_id", String(versione.id));
  if (errT || !tariffe) return null;

  const carrierById = new Map<string, string>();
  for (const c of (corrieri ?? []) as Record<string, unknown>[]) {
    if (c.attivo === false) continue;
    carrierById.set(String(c.id), String(c.codice));
  }

  const servizioInfo = new Map<string, { carrier: string; servizio: string }>();
  for (const s of (servizi ?? []) as Record<string, unknown>[]) {
    if (s.attivo === false) continue;
    const carrier = carrierById.get(String(s.carrier_id));
    if (carrier) servizioInfo.set(String(s.id), { carrier, servizio: String(s.codice) });
  }

  const map = new Map<string, FasciaTariffaria[]>();
  for (const t of (tariffe ?? []) as Record<string, unknown>[]) {
    const info = servizioInfo.get(String(t.service_id));
    if (!info) continue;
    const key = `${info.carrier}:${info.servizio}`;
    const list = map.get(key) ?? [];
    list.push({
      pesoMinG: Number(t.peso_min_g),
      pesoMaxG: Number(t.peso_max_g),
      prezzo: Number(t.prezzo),
    });
    map.set(key, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.pesoMaxG - b.pesoMaxG);
  return map;
}

/** Fasce per un corriere+servizio: DB se presente, altrimenti riferimento. */
function risolviFasce(
  tariffeDb: Map<string, FasciaTariffaria[]> | null,
  carrier: CarrierCodice,
  servizio: ServizioCodice
): readonly FasciaTariffaria[] | null {
  const dalDb = tariffeDb?.get(`${carrier}:${servizio}`);
  if (dalDb && dalDb.length > 0) return dalDb;
  return fascePerCorriere(carrier, servizio);
}

// ═══════════════════════════════════════════════════════════════════
// Preventivo
// ═══════════════════════════════════════════════════════════════════

/**
 * Calcola il preventivo spedizione per un insieme di righe (1 per il buy-now,
 * N per il carrello). Raggruppa per negozio: ogni negozio genera un ordine
 * separato con la propria consegna → il prezzo totale di un'opzione è la SOMMA
 * dei prezzi per negozio. Un'opzione è selezionabile solo se disponibile per
 * TUTTI i negozi del carrello.
 */
export async function getPreventivoSpedizione(
  righe: RigaPreventivo[]
): Promise<PreventivoSpedizione> {
  if (!Array.isArray(righe) || righe.length === 0 || righe.length > 50) {
    return {
      ok: false,
      opzioni: [],
      pesoGrammi: null,
      pesoMancante: false,
      codice: "VALIDATION_ERROR",
      messaggio: "Nessun prodotto da spedire.",
    };
  }

  for (const r of righe) {
    if (!r || !/^\d+$/.test(String(r.prodottoId))) {
      return {
        ok: false,
        opzioni: [],
        pesoGrammi: null,
        pesoMancante: false,
        codice: "VALIDATION_ERROR",
        messaggio: "Prodotto non valido.",
      };
    }
    if (!Number.isInteger(Number(r.quantita)) || Number(r.quantita) < 1 || Number(r.quantita) > 99) {
      return {
        ok: false,
        opzioni: [],
        pesoGrammi: null,
        pesoMancante: false,
        codice: "VALIDATION_ERROR",
        messaggio: "Quantità non valida.",
      };
    }
  }

  const db = createAdminSupabaseClient();
  const ids = [...new Set(righe.map((r) => String(r.prodottoId)))];

  const { data: prodotti, error } = await db
    .from("prodotti")
    .select("id, negozio_id, peso_grammi, costo_spedizione_locale")
    .in("id", ids.map(Number));

  if (error) {
    return {
      ok: false,
      opzioni: [],
      pesoGrammi: null,
      pesoMancante: false,
      codice: "DB_UNAVAILABLE",
      messaggio: "Impossibile calcolare la spedizione.",
    };
  }

  const mappa = new Map<
    string,
    { negozioId: string; pesoGrammi: number | null; locale: number | null }
  >();
  for (const p of (prodotti ?? []) as Record<string, unknown>[]) {
    mappa.set(String(p.id), {
      negozioId: String(p.negozio_id),
      pesoGrammi: typeof p.peso_grammi === "number" ? (p.peso_grammi as number) : null,
      locale: typeof p.costo_spedizione_locale === "number" ? (p.costo_spedizione_locale as number) : null,
    });
  }

  // ── Raggruppamento per negozio ─────────────────────────────────────────
  type Gruppo = {
    peso: number;
    pesoMancante: boolean;
    localeMax: number | null;
    localeMancante: boolean;
  };
  const perNegozio = new Map<string, Gruppo>();
  let pesoTotale = 0;
  let pesoMancante = false;

  for (const riga of righe) {
    const p = mappa.get(String(riga.prodottoId));
    if (!p) continue;
    const q = Number(riga.quantita);
    const g = perNegozio.get(p.negozioId) ?? {
      peso: 0,
      pesoMancante: false,
      localeMax: null,
      localeMancante: false,
    };
    if (p.pesoGrammi !== null && p.pesoGrammi > 0) {
      g.peso += p.pesoGrammi * q;
      pesoTotale += p.pesoGrammi * q;
    } else {
      g.pesoMancante = true;
      pesoMancante = true;
    }
    if (p.locale !== null && p.locale >= 0) {
      if (g.localeMax === null || p.locale > g.localeMax) g.localeMax = p.locale;
    } else {
      g.localeMancante = true;
    }
    perNegozio.set(p.negozioId, g);
  }

  const tariffeDb = await caricaTariffeDb();

  const opzioni: OpzioneSpedizione[] = CATALOGO_SPEDIZIONE.map((voce) => {
    if (voce.fonte === "locale") {
      let disponibile = perNegozio.size > 0;
      let prezzo = 0;
      for (const g of perNegozio.values()) {
        if (g.localeMancante || g.localeMax === null) {
          disponibile = false;
          break;
        }
        prezzo += g.localeMax;
      }
      return {
        carrier: voce.carrier,
        servizio: voce.servizio,
        tier: voce.tier,
        carrierNome: voce.carrierNome,
        servizioNome: voce.servizioNome,
        etichetta: voce.etichetta,
        tempoConsegna: voce.tempoConsegna,
        prezzo: disponibile ? round2(prezzo) : null,
        disponibile,
        motivo: disponibile
          ? null
          : "Corriere locale non configurato per uno o più prodotti del carrello.",
      };
    }

    // Poste Italiane / BRT: tariffa per fascia di peso.
    let disponibile = perNegozio.size > 0;
    let prezzo = 0;
    for (const g of perNegozio.values()) {
      if (g.pesoMancante || g.peso <= 0) {
        disponibile = false;
        break;
      }
      const fasce = risolviFasce(tariffeDb, voce.carrier, voce.servizio);
      const fascia = fasce ? trovaFascia(g.peso, fasce) : null;
      if (!fascia) {
        disponibile = false;
        break;
      }
      prezzo += fascia.prezzo;
    }
    return {
      carrier: voce.carrier,
      servizio: voce.servizio,
      tier: voce.tier,
      carrierNome: voce.carrierNome,
      servizioNome: voce.servizioNome,
      etichetta: voce.etichetta,
      tempoConsegna: voce.tempoConsegna,
      prezzo: disponibile ? round2(prezzo) : null,
      disponibile,
      motivo: disponibile
        ? null
        : pesoMancante
          ? "Peso non ancora configurato dal negozio per uno o più prodotti."
          : "Nessuna tariffa disponibile per il peso della spedizione.",
    };
  });

  return {
    ok: true,
    opzioni,
    pesoGrammi: pesoTotale > 0 ? pesoTotale : null,
    pesoMancante,
  };
}
