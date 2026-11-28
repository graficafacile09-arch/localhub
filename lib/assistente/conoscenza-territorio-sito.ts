/**
 * LocalHub — Assistente AI: conoscenza dinamica di territori, denominazioni e sito.
 *
 * Legge in tempo reale da Supabase i territori (tabella `territori`) e le
 * denominazioni DOP/IGP/PAT (tabella `radiscan_denominazioni`), così Pino conosce
 * i territori aggiunti di recente senza modifiche al codice. Il risultato è in
 * cache in memoria per 5 minuti: zero carico DB per ogni messaggio.
 *
 * In caso di errore (tabella assente, rete, RLS) restituisce solo le pagine del
 * sito: la risposta resta utile e il fallimento non blocca il chatbot.
 *
 * @module lib/assistente/conoscenza-territorio-sito
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const DURATA_CACHE_MS = 5 * 60 * 1000;

/** Pagine reali del sito che Pino può linkare. */
export const PAGINE_SITO_PINO: ReadonlyArray<{ url: string; descrizione: string }> = [
  { url: "/prodotti", descrizione: "catalogo prodotti, vini e prodotti tipici" },
  { url: "/negozi", descrizione: "attività e negozi del territorio" },
  { url: "/filiere", descrizione: "le 10 filiere agroalimentari calabresi" },
  { url: "/territorio", descrizione: "parchi, aree territoriali e comuni" },
  { url: "/stagionalita", descrizione: "prodotti di stagione" },
  { url: "/radiscan", descrizione: "RadiciScan: verifica delle etichette e delle certificazioni" },
];

export type TerritorioConoscenza = {
  slug: string;
  nome: string;
  gruppo: string | null;
  url: string;
};

export type DenominazioneConoscenza = {
  nome: string;
  schemaQualita: string | null;
  territorio: string | null;
};

export type ContestoTerritorioSito = {
  territori: TerritorioConoscenza[];
  denominazioni: DenominazioneConoscenza[];
  pagine: ReadonlyArray<{ url: string; descrizione: string }>;
};

let cache: { valore: ContestoTerritorioSito; scadeA: number } | null = null;

async function leggiTerritori(): Promise<TerritorioConoscenza[]> {
  try {
    const db = createAdminSupabaseClient();
    const { data, error } = await db
      .from("territori")
      .select("slug, nome, gruppo, ordine")
      .order("ordine", { ascending: true })
      .limit(200);
    if (error || !data) return [];
    return data.map((r: { slug: string; nome: string; gruppo: string | null }) => ({
      slug: r.slug,
      nome: r.nome,
      gruppo: r.gruppo ?? null,
      url: `/territorio/${r.slug}`,
    }));
  } catch (errore) {
    console.warn("[pino-conoscenza] territori non disponibili:", errore);
    return [];
  }
}

async function leggiDenominazioni(): Promise<DenominazioneConoscenza[]> {
  try {
    const db = createAdminSupabaseClient();
    const { data, error } = await db
      .from("radiscan_denominazioni")
      .select("nome_ufficiale, schema_qualita, territorio")
      .order("nome_ufficiale", { ascending: true })
      .limit(200);
    if (error || !data) return [];
    return data.map((r: { nome_ufficiale: string; schema_qualita: string | null; territorio: string | null }) => ({
      nome: r.nome_ufficiale,
      schemaQualita: r.schema_qualita ?? null,
      territorio: r.territorio ?? null,
    }));
  } catch (errore) {
    console.warn("[pino-conoscenza] denominazioni non disponibili:", errore);
    return [];
  }
}

/**
 * Contesto strutturato su territori, denominazioni e pagine del sito.
 * `query` non filtra la lettura: il contesto è piccolo e il modello sceglie i
 * pezzi pertinenti. Resta nel parametro per far evolvere il filtro senza
 * cambiare il chiamante.
 */
export async function recuperaContestoTerritorioESito(
  _query?: string
): Promise<ContestoTerritorioSito> {
  const adesso = Date.now();
  if (cache && cache.scadeA > adesso) return cache.valore;

  const [territori, denominazioni] = await Promise.all([
    leggiTerritori(),
    leggiDenominazioni(),
  ]);
  const valore: ContestoTerritorioSito = {
    territori,
    denominazioni,
    pagine: PAGINE_SITO_PINO,
  };
  cache = { valore, scadeA: adesso + DURATA_CACHE_MS };
  return valore;
}

/** Blocco testuale da passare al prompt come `<contesto_sito_territorio>`. */
export function formattaContestoTerritorioESito(contesto: ContestoTerritorioSito): string {
  const righeTerritori = contesto.territori.length > 0
    ? contesto.territori
        .map((t) => `- ${t.nome}${t.gruppo ? ` (${t.gruppo})` : ""}: ${t.url}`)
        .join("\n")
    : "- (nessun territorio disponibile in questo momento)";
  const righeDenominazioni = contesto.denominazioni.length > 0
    ? contesto.denominazioni
        .map((d) => `- ${d.nome}${d.schemaQualita ? ` [${d.schemaQualita}]` : ""}${d.territorio ? ` — ${d.territorio}` : ""}`)
        .join("\n")
    : "- (nessuna denominazione registrata)";
  const righePagine = contesto.pagine
    .map((p) => `- ${p.url}: ${p.descrizione}`)
    .join("\n");
  return `<contesto_sito_territorio>\nTERRITORI DEL PORTALE (parchi, aree, comuni):\n${righeTerritori}\n\nDENOMINAZIONI DOP/IGP/PAT:\n${righeDenominazioni}\n\nPAGINE DEL SITO:\n${righePagine}\n</contesto_sito_territorio>`;
}
