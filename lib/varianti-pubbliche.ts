import { createAdminSupabaseClient } from "./supabase/admin";
import { isUuid } from "./slug";

/**
 * Varianti prodotto — layer PUBBLICO (FASE E4).
 *
 * Fornisce:
 *   - VariantePubblica: forma sicura e tipizzata delle varianti mostrate
 *     sul frontend (nessun campo interno esposto);
 *   - getVariantiPubblicheProdotto: varianti ATTIVE di un prodotto, usata
 *     dalla pagina pubblica /prodotto/[slug];
 *   - richiediVariantePerProdotto: validazione server-side del varianteId
 *     inviato dal checkout (appartenenza al prodotto + attiva), usata dalle
 *     pagine di acquisto e dal servizio ordini. In E4 il varianteId è solo
 *     TRASPORTATO fino all'ordine: prezzo/stock della variante non vengono
 *     ancora usati (sarà E5, che toccherà la RPC crea_ordine).
 *
 * Tutte le query usano il client ADMIN (server-only, mai esposto al
 * browser), coerente con il resto dei servizi pubblici del progetto.
 */

export type VariantePubblica = {
  id: string;
  /** Nome leggibile della variante (es. "Maglia M / Blu"); null se assente. */
  nome: string | null;
  /** Attributi della combinazione (es. { taglia: "M", colore: "Blu" }). */
  attributi: Record<string, string>;
  /** Prezzo proprio: NULL → il prodotto eredita il prezzo padre. */
  prezzo: number | null;
  quantita_disponibile: number;
  quantita_riservata: number;
  /** Immagine propria: NULL → il prodotto usa l'immagine padre. */
  immagine_principale: string | null;
  attivo: boolean;
};

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

function mappaVariantePubblica(riga: Record<string, unknown>): VariantePubblica {
  const attRaw = (riga.attributi ?? {}) as Record<string, unknown> | null;
  const attributi: Record<string, string> = {};
  for (const [chiave, valore] of Object.entries(attRaw ?? {})) {
    attributi[chiave] = String(valore);
  }
  return {
    id: String(riga.id),
    nome: (riga.nome as string | null) ?? null,
    attributi,
    prezzo: riga.prezzo != null ? Number(riga.prezzo) : null,
    quantita_disponibile: Number(riga.quantita_disponibile ?? 0),
    quantita_riservata: Number(riga.quantita_riservata ?? 0),
    immagine_principale: (riga.immagine_principale as string | null) ?? null,
    attivo: riga.attivo !== false,
  };
}

/**
 * Varianti ATTIVE di un prodotto (pagina pubblica). Le varianti inattive
 * vengono escluse a monte: il frontend non può mai selezionarle.
 */
export async function getVariantiPubblicheProdotto(
  prodottoId: string
): Promise<VariantePubblica[]> {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("prodotto_varianti")
    .select("*")
    .eq("prodotto_id", prodottoId)
    .eq("attivo", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[varianti-pubbliche] getVariantiPubblicheProdotto:", error.message);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mappaVariantePubblica);
}

export type EsitoRichiestaVariante =
  /** Prodotto inesistente: la RPC crea_ordine lo gestirà comunque. */
  | { stato: "prodotto_assente" }
  /** Prodotto legacy (senza varianti): varianteId non richiesto. */
  | { stato: "non_necessaria" }
  /** Prodotto con varianti ma varianteId mancante: l'acquisto è bloccato. */
  | { stato: "obbligatoria" }
  /** varianteId fornito ma non valido / di altro prodotto / inattiva. */
  | { stato: "invalida" }
  /** varianteId valido e pertinente. */
  | { stato: "valida"; variante: VariantePubblica };

/**
 * Validazione server-side del varianteId per l'acquisto:
 *   - prodotto legacy → non_necessaria (nessun vincolo, comportamento attuale);
 *   - prodotto con varianti (ha_varianti=true) → varianteId OBBLIGATORIO;
 *   - il varianteId deve esistere, appartenere al prodotto (mai fidarsi di
 *     un prodottoId del client) ed essere attivo.
 */
export async function richiediVariantePerProdotto(
  prodottoId: string,
  varianteId: string | null | undefined
): Promise<EsitoRichiestaVariante> {
  const db = getDb();
  if (!db) return { stato: "non_necessaria" };

  const { data: prodotto, error } = await db
    .from("prodotti")
    .select("id, ha_varianti")
    .eq("id", prodottoId)
    .maybeSingle();

  if (error || !prodotto) return { stato: "prodotto_assente" };

  const haVarianti = prodotto.ha_varianti === true;

  if (!haVarianti) {
    // Prodotto legacy: il varianteId (anche malformato o di altro prodotto)
    // viene IGNORATO del tutto → comportamento identico a oggi.
    return { stato: "non_necessaria" };
  }

  if (!varianteId) return { stato: "obbligatoria" };
  if (!isUuid(varianteId)) return { stato: "invalida" };

  const { data: variante } = await db
    .from("prodotto_varianti")
    .select("*")
    .eq("id", varianteId)
    .eq("prodotto_id", prodottoId)
    .eq("attivo", true)
    .maybeSingle();

  if (!variante) return { stato: "invalida" };

  return { stato: "valida", variante: mappaVariantePubblica(variante) };
}
