import { calcolaTitoloFonteHash, normalizzaTitolo } from "@/lib/notizie/dedup";
import { isPertinenteCastrovillari } from "@/lib/notizie/filtro";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * NOTIZIE PUBBLICHE — letture server-side per la pagina /notizie.
 *
 * Espone ESCLUSIVAMENTE le notizie con stato = 'published' (filtro nella
 * query, non nella logica della pagina): mai bozze/nascoste. Stesso pattern
 * di lib/contenuti-pubblici.ts (admin client service-role): nessuna
 * modifica a RLS. MAI throw: errori di DB → lista vuota (stato vuoto).
 *
 * Campi esposti: solo metadati/titolo/excerpt/fonte/data/categoria/link —
 * mai contenuti integrali (non ne conserviamo).
 */

export type NotiziaPubblica = {
  id: string;
  title: string;
  excerpt: string | null;
  originalUrl: string;
  sourceName: string;
  publishedAt: string | null;
  category: string;
  imageUrl: string | null;
};

const FINESTRA_STESSO_EVENTO_MS = 30 * 24 * 60 * 60 * 1000;
const PAROLE_GENERICHE = new Set([
  "castrovillari", "castrovillarese", "castrovillaresi", "oggi", "ancora",
  "nuovo", "nuova", "grande", "successo", "arriva", "arrivato", "arrivate",
  "annuncia", "annunciato", "presentata", "presentato", "comunicato", "comunicati",
  "di", "del", "della", "dei", "degli", "delle", "a", "ad", "al", "alla", "alle",
  "in", "nel", "nella", "nelle", "con", "per", "tra", "fra", "e", "ed", "il", "lo",
  "la", "i", "gli", "le", "un", "una", "uno", "che", "è", "e", "si", "sul", "sulla",
]);

function paroleEvento(titolo: string): Set<string> {
  return new Set(
    normalizzaTitolo(titolo)
      .split(" ")
      .filter((parola) => parola.length >= 4 && !PAROLE_GENERICHE.has(parola))
  );
}

function stessoEvento(a: NotiziaPubblica, b: NotiziaPubblica): boolean {
  const dataA = a.publishedAt ? Date.parse(a.publishedAt) : NaN;
  const dataB = b.publishedAt ? Date.parse(b.publishedAt) : NaN;
  if (Number.isFinite(dataA) && Number.isFinite(dataB) && Math.abs(dataA - dataB) > FINESTRA_STESSO_EVENTO_MS) {
    return false;
  }

  const paroleA = paroleEvento(a.title);
  const paroleB = paroleEvento(b.title);
  const comuni = [...paroleA].filter((parola) => paroleB.has(parola));
  const unione = new Set([...paroleA, ...paroleB]);

  // Almeno tre termini distintivi in comune evita di fondere semplici
  // menzioni della città o articoli diversi della stessa categoria.
  return comuni.length >= 3 && comuni.length / unione.size >= 0.35;
}

const PRIORITA_FONTI: ReadonlyMap<string, number> = new Map([
  ["ANSA", 5],
  ["RaiNews", 5],
  ["Gazzetta del Sud", 4],
  ["Corriere della Calabria", 4],
  ["Comune di Castrovillari", 4],
]);

function rappresentanteGruppo(a: NotiziaPubblica, b: NotiziaPubblica): NotiziaPubblica {
  const dataA = a.publishedAt ? Date.parse(a.publishedAt) : 0;
  const dataB = b.publishedAt ? Date.parse(b.publishedAt) : 0;
  if (dataA !== dataB) return dataA > dataB ? a : b;
  const prioritaA = PRIORITA_FONTI.get(a.sourceName) ?? 0;
  const prioritaB = PRIORITA_FONTI.get(b.sourceName) ?? 0;
  if (prioritaA !== prioritaB) return prioritaA > prioritaB ? a : b;
  if (a.title.length !== b.title.length) return a.title.length > b.title.length ? a : b;
  return a;
}

function deduplicaPerEvento(notizie: NotiziaPubblica[]): NotiziaPubblica[] {
  const gruppi: NotiziaPubblica[][] = [];
  for (const notizia of notizie) {
    const gruppo = gruppi.find((candidati) =>
      candidati.some((candidata) => stessoEvento(candidata, notizia))
    );
    if (gruppo) gruppo.push(notizia);
    else gruppi.push([notizia]);
  }

  return gruppi
    .map((gruppo) => gruppo.reduce(rappresentanteGruppo))
    .sort((a, b) => {
      const dataA = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const dataB = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return dataB - dataA;
    });
}

function getDb() {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
}

function assumiNotiziaPubblica(riga: Record<string, unknown>): NotiziaPubblica {
  return {
    id: String(riga.id),
    title: String(riga.title ?? ""),
    excerpt: (riga.excerpt as string | null) ?? null,
    originalUrl: String(riga.original_url ?? ""),
    sourceName: String(riga.source_name ?? ""),
    publishedAt: (riga.published_at as string | null) ?? null,
    category: String(riga.category ?? ""),
    imageUrl: (riga.image_url as string | null) ?? null,
  };
}

/** Margine extra per compensare le notizie fuse per evento. */
const DEDUP_SLACK = 120;

/**
 * Ultime notizie pubblicate, dalla più recente alla più vecchia.
 *
 * La lettura applica due livelli di dedup senza modificare il database:
 * 1. chiave tecnica `source_name + titolo normalizzato`;
 * 2. raggruppamento editoriale cross-fonte per evento, basato sui termini
 *    significativi del titolo e su una finestra temporale di 30 giorni.
 * Per ogni evento viene restituita una sola scheda, scegliendo il record più
 * recente; la fonte affidabile e il titolo più completo sono criteri di parità.
 *
 * Restituisce sempre un array (vuoto se DB non disponibile, errore o
 * nessuna notizia pubblicata).
 */
export async function getNotiziePubbliche(limit = 60): Promise<NotiziaPubblica[]> {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("notizie")
    .select(
      "id, fonte_id, title, excerpt, original_url, source_name, published_at, category, image_url"
    )
    .eq("stato", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit + DEDUP_SLACK);

  if (error || !data) {
    console.error("[notizie-pubbliche] elenco fallito:", error?.message ?? "data null");
    return [];
  }

  const righePertinenti = (data as Record<string, unknown>[]).filter((riga) =>
    isPertinenteCastrovillari({
      fonteId: String(riga.fonte_id ?? ""),
      title: String(riga.title ?? ""),
      excerpt: (riga.excerpt as string | null) ?? null,
    })
  );
  const righe = righePertinenti.map(assumiNotiziaPubblica);

  // Primo livello: dedup tecnica per fonte e titolo.
  const visti = new Set<string>();
  const tecnicamenteUniche: NotiziaPubblica[] = [];
  for (const notizia of righe) {
    const chiave = calcolaTitoloFonteHash(notizia.sourceName, notizia.title);
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    tecnicamenteUniche.push(notizia);
  }

  return deduplicaPerEvento(tecnicamenteUniche).slice(0, limit);
}

/** Formatta la data di pubblicazione in formato italiano leggibile. */
export function formattaDataNotizia(
  value: string | null | undefined
): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}