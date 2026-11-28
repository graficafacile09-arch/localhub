/**
 * LocalHub — Assistente AI: conoscenza dinamica di territori, denominazioni e sito.
 *
 * Legge in tempo reale da Supabase i territori (tabella `territori`), le
 * denominazioni DOP/IGP/PAT (tabella `radiscan_denominazioni`) e gli
 * approfondimenti editoriali pubblicati (tabella `contenuti`, solo
 * stato='pubblicato'), così Pino conosce ciò che è stato aggiunto di recente
 * senza modifiche al codice. Aggiunge la stagionalità del mese corrente dal
 * calendario unico del sito (`lib/stagionalita/calendario`): nessuna tabella,
 * una sola fonte da aggiornare. Il risultato è in cache in memoria per 5
 * minuti: zero carico DB per ogni messaggio.
 *
 * In caso di errore (tabella assente, rete, RLS) restituisce solo le pagine del
 * sito: la risposta resta utile e il fallimento non blocca il chatbot.
 *
 * @module lib/assistente/conoscenza-territorio-sito
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getContenutiPubblici } from "@/lib/contenuti-pubblici";
import { NOMI_MESI, VOCI, meseCorrente, periodoDiMese } from "@/lib/stagionalita/calendario";

const DURATA_CACHE_MS = 5 * 60 * 1000;
/** Tetto degli approfondimenti passati al prompt: bastano i più recenti. */
const MAX_CONTENUTI = 12;
/** Il riassunto editoriale può essere lungo: nel prompt ne basta l'incipit. */
const MAX_RIASSUNTO = 180;

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

export type ContenutoConoscenza = {
  titolo: string;
  slug: string;
  riassunto: string | null;
  url: string;
};

export type StagionalitaConoscenza = {
  mese: string;
  periodo: string;
  voci: Array<{ nome: string; attivita: string; zone: string | null }>;
};

export type ContestoTerritorioSito = {
  territori: TerritorioConoscenza[];
  denominazioni: DenominazioneConoscenza[];
  contenuti: ContenutoConoscenza[];
  stagionalita: StagionalitaConoscenza;
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

/** Approfondimenti pubblicati, con link alla pagina /contenuti/[slug]. */
async function leggiContenuti(): Promise<ContenutoConoscenza[]> {
  try {
    const contenuti = await getContenutiPubblici(MAX_CONTENUTI * 2);
    return contenuti
      .filter((contenuto) => contenuto.slug && contenuto.titolo)
      .slice(0, MAX_CONTENUTI)
      .map((contenuto) => {
        const riassunto = contenuto.riassunto?.trim().replace(/\s+/g, " ") ?? "";
        return {
          titolo: contenuto.titolo.trim(),
          slug: contenuto.slug,
          riassunto: riassunto
            ? riassunto.length > MAX_RIASSUNTO
              ? `${riassunto.slice(0, MAX_RIASSUNTO).trimEnd()}…`
              : riassunto
            : null,
          url: `/contenuti/${contenuto.slug}`,
        };
      });
  } catch (errore) {
    console.warn("[pino-conoscenza] contenuti non disponibili:", errore);
    return [];
  }
}

/**
 * Stagionalità del mese corrente dal calendario unico del sito: cosa si
 * raccoglie, si lavora o si stagiona adesso, con le zone indicate. Serve a
 * rispondere «cosa compro in questo periodo» senza inventare il calendario.
 */
function leggiStagionalita(adesso: Date = new Date()): StagionalitaConoscenza {
  const mese = meseCorrente(adesso);
  return {
    mese: NOMI_MESI[mese - 1],
    periodo: periodoDiMese(mese).titolo,
    voci: VOCI.filter((voce) => voce.mesi.includes(mese)).map((voce) => ({
      nome: voce.nome,
      attivita: voce.sintesi,
      zone: voce.zone ?? null,
    })),
  };
}

/**
 * Contesto strutturato su territori, denominazioni, contenuti pubblicati,
 * stagionalità e pagine del sito.
 * `query` non filtra la lettura: il contesto è piccolo e il modello sceglie i
 * pezzi pertinenti. Resta nel parametro per far evolvere il filtro senza
 * cambiare il chiamante.
 */
export async function recuperaContestoTerritorioESito(
  _query?: string
): Promise<ContestoTerritorioSito> {
  const adesso = Date.now();
  if (cache && cache.scadeA > adesso) return cache.valore;

  const [territori, denominazioni, contenuti] = await Promise.all([
    leggiTerritori(),
    leggiDenominazioni(),
    leggiContenuti(),
  ]);
  const valore: ContestoTerritorioSito = {
    territori,
    denominazioni,
    contenuti,
    stagionalita: leggiStagionalita(),
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
  const righeContenuti = contesto.contenuti.length > 0
    ? contesto.contenuti
        .map((c) => `- ${c.titolo}${c.riassunto ? ` — ${c.riassunto}` : ""}: ${c.url}`)
        .join("\n")
    : "- (nessun approfondimento pubblicato in questo momento)";
  const righeStagionalita = contesto.stagionalita.voci.length > 0
    ? contesto.stagionalita.voci
        .map((v) => `- ${v.nome}: ${v.attivita}${v.zone ? ` (${v.zone})` : ""}`)
        .join("\n")
    : "- (nessuna attività registrata per questo mese)";
  const righePagine = contesto.pagine
    .map((p) => `- ${p.url}: ${p.descrizione}`)
    .join("\n");
  return `<contesto_sito_territorio>\nTERRITORI DEL PORTALE (parchi, aree, comuni):\n${righeTerritori}\n\nDENOMINAZIONI DOP/IGP/PAT:\n${righeDenominazioni}\n\nCONTENUTI EDITORIALI PUBBLICATI:\n${righeContenuti}\n\nSTAGIONALITÀ — ${contesto.stagionalita.mese} (periodo ${contesto.stagionalita.periodo}), ciò che si raccoglie, si lavora o si stagiona adesso:\n${righeStagionalita}\n\nPAGINE DEL SITO:\n${righePagine}\n</contesto_sito_territorio>`;
}
