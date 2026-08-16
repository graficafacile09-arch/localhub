/**
 * SPEDIZIONI — MOTORE TARIFFARIO (server-side).
 *
 * Calcola il PREVENTIVO di spedizione leggendo SOLO dal database:
 *   - peso del PACCO configurato dal negozio (`negozi.pacco_peso_grammi`, grammi);
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
 *     peso. V1 = UN PACCO PER ORDINE/NEGOZIO: il peso è `negozi.pacco_peso_grammi`
 *     (mai Σ(peso prodotto × quantità)). Se il negozio non ha configurato il
 *     pacco (NULL o ≤0) → il corriere NON è disponibile (mai un peso o un
 *     prezzo inventato). `prodotti.peso_grammi` resta solo per compatibilità.
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
  MOTIVO_LOCALE_NON_CONFIGURATO,
  MOTIVO_PACCO_NON_CONFIGURATO,
  MOTIVO_SERVIZIO_NON_ATTIVO,
  MOTIVO_TARIFFA_NON_TROVATA,
  chiaveServizio,
  fascePerCorriere,
  nessunServizioAttivo,
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
      nessunServizioAttivo: false,
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
      nessunServizioAttivo: false,
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
      nessunServizioAttivo: false,
      codice: "VALIDATION_ERROR",
      messaggio: "Quantità non valida.",
    };
    }
  }

  const db = createAdminSupabaseClient();
  const ids = [...new Set(righe.map((r) => String(r.prodottoId)))];

  // Prodotti → negozio + tariffa locale per prodotto (corriere locale).
  const { data: prodotti, error } = await db
    .from("prodotti")
    .select("id, negozio_id, costo_spedizione_locale")
    .in("id", ids.map(Number));

  if (error) {
    return {
      ok: false,
      opzioni: [],
      pesoGrammi: null,
      pesoMancante: false,
      nessunServizioAttivo: false,
      codice: "DB_UNAVAILABLE",
      messaggio: "Impossibile calcolare la spedizione.",
    };
  }

  const mappa = new Map<string, { negozioId: string; locale: number | null }>();
  for (const p of (prodotti ?? []) as Record<string, unknown>[]) {
    mappa.set(String(p.id), {
      negozioId: String(p.negozio_id),
      locale: typeof p.costo_spedizione_locale === "number" ? (p.costo_spedizione_locale as number) : null,
    });
  }

  // Pacchi configurati dai negozi (V1: un pacco per negozio, peso in grammi).
  const negozioIds = [...new Set([...mappa.values()].map((x) => x.negozioId))];
  const paccoPerNegozio = new Map<string, number | null>();
  if (negozioIds.length > 0) {
    const { data: negozi, error: errNegozi } = await db
      .from("negozi")
      .select("id, pacco_peso_grammi")
      .in("id", negozioIds);
    if (errNegozi) {
      return {
        ok: false,
        opzioni: [],
        pesoGrammi: null,
        pesoMancante: false,
        nessunServizioAttivo: false,
        codice: "DB_UNAVAILABLE",
        messaggio: "Impossibile calcolare la spedizione.",
      };
    }
    for (const n of (negozi ?? []) as Record<string, unknown>[]) {
      const peso = typeof n.pacco_peso_grammi === "number" ? (n.pacco_peso_grammi as number) : null;
      paccoPerNegozio.set(String(n.id), peso);
    }
  }

  // Servizi di spedizione ATTIVI per negozio (fail-closed: nessuna riga =
  // nessun servizio attivato → nessuna opzione selezionabile).
  const attiviPerNegozio = new Map<string, Set<string>>();
  // Metodi con "spedizione gratuita" attiva (per negozio): quando attiva, il
  // prezzo è 0 senza richiedere pacco/fascia (stessa chiave "carrier:servizio").
  const gratuitaPerNegozio = new Map<string, Set<string>>();
  if (negozioIds.length > 0) {
    let metodi: Record<string, unknown>[] | null = null;
    // Se la colonna spedizione_gratuita non esiste ancora (migration GLS non
    // applicata), rileggiamo senza di essa: fail-safe, tutti i metodi restano
    // a pagamento (nessuna regressione su Poste/BRT).
    const { data: metodiFull, error: errFull } = await db
      .from("negozio_metodi_spedizione")
      .select("negozio_id, carrier, servizio, spedizione_gratuita")
      .eq("attivo", true)
      .in("negozio_id", negozioIds);
    if (errFull) {
      const { data: metodiBase, error: errBase } = await db
        .from("negozio_metodi_spedizione")
        .select("negozio_id, carrier, servizio")
        .eq("attivo", true)
        .in("negozio_id", negozioIds);
      if (errBase) {
        return {
          ok: false,
          opzioni: [],
          pesoGrammi: null,
          pesoMancante: false,
          nessunServizioAttivo: false,
          codice: "DB_UNAVAILABLE",
          messaggio: "Impossibile calcolare la spedizione.",
        };
      }
      metodi = (metodiBase ?? []) as Record<string, unknown>[];
    } else {
      metodi = (metodiFull ?? []) as Record<string, unknown>[];
    }
    for (const m of metodi) {
      const nid = String(m.negozio_id);
      const chiave = chiaveServizio(m.carrier as CarrierCodice, m.servizio as ServizioCodice);
      const set = attiviPerNegozio.get(nid) ?? new Set<string>();
      set.add(chiave);
      attiviPerNegozio.set(nid, set);
      if (m.spedizione_gratuita === true) {
        const gset = gratuitaPerNegozio.get(nid) ?? new Set<string>();
        gset.add(chiave);
        gratuitaPerNegozio.set(nid, gset);
      }
    }
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
    const g = perNegozio.get(p.negozioId) ?? {
      peso: 0,
      pesoMancante: false,
      localeMax: null,
      localeMancante: false,
    };
    if (p.locale !== null && p.locale >= 0) {
      if (g.localeMax === null || p.locale > g.localeMax) g.localeMax = p.locale;
    } else {
      g.localeMancante = true;
    }
    perNegozio.set(p.negozioId, g);
  }

  // Peso pacco (Poste/BRT): V1 unico per negozio, MAI moltiplicato per quantità.
  for (const [negozioId, g] of perNegozio) {
    const paccoPeso = paccoPerNegozio.get(negozioId);
    if (paccoPeso !== null && paccoPeso !== undefined && paccoPeso > 0) {
      g.peso = paccoPeso;
      pesoTotale += paccoPeso;
    } else {
      g.pesoMancante = true;
      pesoMancante = true;
    }
  }

  const tariffeDb = await caricaTariffeDb();

  const opzioni: OpzioneSpedizione[] = CATALOGO_SPEDIZIONE.map((voce) => {
    const chiave = chiaveServizio(voce.carrier, voce.servizio);

    // Servizio ATTIVATO dal negozio? (fail-closed: nel carrello multi-negozio
    // l'opzione è selezionabile solo se TUTTI i negozi l'hanno attivata).
    let attivo = perNegozio.size > 0;
    for (const negozioId of perNegozio.keys()) {
      if (!(attiviPerNegozio.get(negozioId)?.has(chiave) ?? false)) {
        attivo = false;
        break;
      }
    }

    if (voce.fonte === "locale") {
      let calcolabile = perNegozio.size > 0;
      let prezzo = 0;
      for (const g of perNegozio.values()) {
        if (g.localeMancante || g.localeMax === null) {
          calcolabile = false;
          break;
        }
        prezzo += g.localeMax;
      }
      const disponibile = attivo && calcolabile;
      return {
        carrier: voce.carrier,
        servizio: voce.servizio,
        tier: voce.tier,
        carrierNome: voce.carrierNome,
        servizioNome: voce.servizioNome,
        etichetta: voce.etichetta,
        tempoConsegna: voce.tempoConsegna,
        descrizione: voce.descrizione,
        gratuita: false,
        prezzo: disponibile ? round2(prezzo) : null,
        disponibile,
        motivo: !attivo
          ? MOTIVO_SERVIZIO_NON_ATTIVO
          : !calcolabile
            ? MOTIVO_LOCALE_NON_CONFIGURATO
            : null,
      };
    }

    // Poste Italiane / BRT / GLS: tariffa per fascia di peso. Se il negozio
    // ha attivato la "spedizione gratuita" per questo metodo, il costo è 0
    // (senza richiedere pacco/fascia: il prezzo resta comunque 0). In un
    // carrello multi-negozio l'opzione è "gratuita" solo se TUTTI i negozi
    // l'hanno configurata gratuita (altrimenti si sommano le tariffe).
    let calcolabile = perNegozio.size > 0;
    let prezzo = 0;
    let gratuita = perNegozio.size > 0;
    for (const [negozioId, g] of perNegozio) {
      const gratis = gratuitaPerNegozio.get(negozioId)?.has(chiave) ?? false;
      if (gratis) {
        continue;
      }
      gratuita = false;
      if (g.pesoMancante || g.peso <= 0) {
        calcolabile = false;
        break;
      }
      const fasce = risolviFasce(tariffeDb, voce.carrier, voce.servizio);
      const fascia = fasce ? trovaFascia(g.peso, fasce) : null;
      if (!fascia) {
        calcolabile = false;
        break;
      }
      prezzo += fascia.prezzo;
    }
    const disponibile = attivo && calcolabile;
    return {
      carrier: voce.carrier,
      servizio: voce.servizio,
      tier: voce.tier,
      carrierNome: voce.carrierNome,
      servizioNome: voce.servizioNome,
      etichetta: voce.etichetta,
      tempoConsegna: voce.tempoConsegna,
      descrizione: voce.descrizione,
      gratuita: disponibile ? gratuita : false,
      prezzo: disponibile ? round2(prezzo) : null,
      disponibile,
      motivo: !attivo
        ? MOTIVO_SERVIZIO_NON_ATTIVO
        : !calcolabile
          ? (pesoMancante ? MOTIVO_PACCO_NON_CONFIGURATO : MOTIVO_TARIFFA_NON_TROVATA)
          : null,
    };
  });

  const insiemiAttivi = [...perNegozio.keys()].map(
    (id) => attiviPerNegozio.get(id) ?? new Set<string>()
  );

  return {
    ok: true,
    opzioni,
    pesoGrammi: pesoTotale > 0 ? pesoTotale : null,
    pesoMancante,
    nessunServizioAttivo: nessunServizioAttivo(insiemiAttivi),
  };
}
