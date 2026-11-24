import { calcolaTitoloFonteHash, normalizzaTitolo } from "@/lib/notizie/dedup";
import {
  assegnaCategoria,
  isCategoriaNotizia,
  isPertinenteAgricoltura,
} from "@/lib/notizie/filtro";
import { classificaTipoContenuto, estraiEvento } from "@/lib/notizie/editoriale";
import type { CategoriaNotizia, TipoContenuto } from "@/lib/notizie/types";
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
 * mai contenuti integrali (non ne conserviamo). Tipologia, data e luogo
 * dell'evento sono calcolati in lettura da titolo ed estratto: nessun campo
 * aggiuntivo nel database, così l'archivio esistente resta valido.
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
  /** Tipologia editoriale calcolata (notizia, evento, fiera, …). */
  tipo: TipoContenuto;
  /** Data di inizio evento in formato ISO (YYYY-MM-DD), se dichiarata. */
  eventoDataInizio: string | null;
  eventoDataFine: string | null;
  eventoLuogo: string | null;
};

/** Quante righe leggere al massimo per costruire una pagina dell'archivio. */
const MAX_RIGHE = 800;

/** Elementi per pagina nella sezione pubblica. */
export const NOTIZIE_PER_PAGINA = 12;

/** Eventi futuri mostrati nel riquadro "Prossimi appuntamenti". */
const MAX_PROSSIMI_EVENTI = 4;

const FINESTRA_STESSO_EVENTO_MS = 30 * 24 * 60 * 60 * 1000;
const PAROLE_GENERICHE = new Set([
  "calabria", "calabrese", "calabresi", "oggi", "ancora",
  "nuovo", "nuova", "grande", "successo", "arriva", "arrivato", "arrivate",
  "annuncia", "annunciato", "presentata", "presentato", "comunicato", "comunicati",
  "di", "del", "della", "dei", "degli", "delle", "a", "ad", "al", "alla", "alle",
  "in", "nel", "nella", "nelle", "con", "per", "tra", "fra", "e", "ed", "il", "lo",
  "la", "i", "gli", "le", "un", "una", "uno", "che", "è", "si", "sul", "sulla",
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
  if (
    Number.isFinite(dataA) &&
    Number.isFinite(dataB) &&
    Math.abs(dataA - dataB) > FINESTRA_STESSO_EVENTO_MS
  ) {
    return false;
  }

  const paroleA = paroleEvento(a.title);
  const paroleB = paroleEvento(b.title);
  const comuni = [...paroleA].filter((parola) => paroleB.has(parola));
  const unione = new Set([...paroleA, ...paroleB]);

  // Almeno tre termini distintivi in comune evita di fondere articoli diversi
  // della stessa categoria (es. due notizie diverse sull'olio calabrese).
  return comuni.length >= 3 && comuni.length / unione.size >= 0.35;
}

const PRIORITA_FONTI: ReadonlyMap<string, number> = new Map([
  ["ANSA", 5],
  ["RaiNews", 5],
  ["ARSAC Servizi in Agricoltura Calabria", 5],
  ["Regione Calabria", 5],
  ["Gazzetta del Sud", 4],
  ["Corriere della Calabria", 4],
  ["Il Sole 24 Ore", 4],
  ["Calabria Diretta News", 3],
]);

function rappresentanteGruppo(
  a: NotiziaPubblica,
  b: NotiziaPubblica
): NotiziaPubblica {
  const dataA = a.publishedAt ? Date.parse(a.publishedAt) : 0;
  const dataB = b.publishedAt ? Date.parse(b.publishedAt) : 0;
  if (dataA !== dataB) return dataA > dataB ? a : b;
  const prioritaA = PRIORITA_FONTI.get(a.sourceName) ?? 0;
  const prioritaB = PRIORITA_FONTI.get(b.sourceName) ?? 0;
  if (prioritaA !== prioritaB) return prioritaA > prioritaB ? a : b;
  if (a.title.length !== b.title.length) {
    return a.title.length > b.title.length ? a : b;
  }
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
  const title = String(riga.title ?? "");
  const excerpt = (riga.excerpt as string | null) ?? null;
  // Le righe importate prima del cambio di linea editoriale hanno categorie
  // fuori elenco ("Comune", "Cultura", "Istituzioni"…): vengono riallineate
  // alle categorie della sezione, così il totale di "Tutte" coincide con la
  // somma dei chip e nessun contenuto resta senza categoria.
  const categoriaDb = String(riga.category ?? "");
  const category = isCategoriaNotizia(categoriaDb)
    ? categoriaDb
    : assegnaCategoria(title, excerpt, "Agricoltura");
  const tipo = classificaTipoContenuto(title, excerpt);
  const isEvento = tipo === "evento" || tipo === "fiera";
  const evento = isEvento
    ? estraiEvento(title, excerpt)
    : { dataInizio: null, dataFine: null, luogo: null };

  return {
    id: String(riga.id),
    title,
    excerpt,
    originalUrl: String(riga.original_url ?? ""),
    sourceName: String(riga.source_name ?? ""),
    publishedAt: (riga.published_at as string | null) ?? null,
    category,
    imageUrl: (riga.image_url as string | null) ?? null,
    tipo,
    eventoDataInizio: evento.dataInizio,
    eventoDataFine: evento.dataFine,
    eventoLuogo: evento.luogo,
  };
}

/**
 * Carica l'archivio pubblicato, già filtrato sulla linea editoriale e
 * deduplicato. `categoria` filtra in database; pertinenza e tipologia sono
 * applicate in memoria (la tipologia non è una colonna del database).
 */
async function caricaArchivio(
  categoria: CategoriaNotizia | null
): Promise<NotiziaPubblica[]> {
  const db = getDb();
  if (!db) return [];

  let query = db
    .from("notizie")
    .select(
      "id, fonte_id, title, excerpt, original_url, source_name, published_at, category, image_url"
    )
    .eq("stato", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(MAX_RIGHE);

  if (categoria) query = query.eq("category", categoria);

  const { data, error } = await query;
  if (error || !data) {
    console.error(
      "[notizie-pubbliche] elenco fallito:",
      error?.message ?? "data null"
    );
    return [];
  }

  // Difesa in profondità: le righe storiche di cronaca locale non passano il
  // filtro agricolo, anche se sono ancora pubblicate nel database.
  const righePertinenti = (data as Record<string, unknown>[]).filter((riga) =>
    isPertinenteAgricoltura({
      fonteId: String(riga.fonte_id ?? ""),
      title: String(riga.title ?? ""),
      excerpt: (riga.excerpt as string | null) ?? null,
    })
  );

  // Primo livello: dedup tecnica per fonte e titolo.
  const visti = new Set<string>();
  const tecnicamenteUniche: NotiziaPubblica[] = [];
  for (const notizia of righePertinenti.map(assumiNotiziaPubblica)) {
    const chiave = calcolaTitoloFonteHash(notizia.sourceName, notizia.title);
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    tecnicamenteUniche.push(notizia);
  }

  // Secondo livello: raggruppamento editoriale cross-fonte per evento.
  return deduplicaPerEvento(tecnicamenteUniche);
}

/**
 * Ultime notizie pubblicate, dalla più recente alla più vecchia.
 *
 * Mantiene la firma storica usata dall'assistente Pino: restituisce sempre un
 * array (vuoto se DB non disponibile, errore o nessuna notizia pertinente).
 */
export async function getNotiziePubbliche(
  limit = 60
): Promise<NotiziaPubblica[]> {
  const archivio = await caricaArchivio(null);
  return archivio.slice(0, limit);
}

export type EsitoArchivioNotizie = {
  notizie: NotiziaPubblica[];
  /** Contenuti pertinenti totali nell'archivio (dopo dedup). */
  totale: number;
  pagina: number;
  pagine: number;
  /** Prossimi appuntamenti (solo senza filtro di categoria). */
  prossimiEventi: NotiziaPubblica[];
  /** Conteggio dei contenuti per categoria editoriale. */
  conteggi: Record<string, number>;
  /** Totale dei contenuti in archivio, tutte le categorie. */
  totaleArchivio: number;
};

/**
 * Una pagina dell'archivio, con l'eventuale filtro di categoria e il
 * riquadro dei prossimi appuntamenti (eventi con data futura dichiarata).
 */
export async function cercaNotiziePubbliche(options: {
  categoria?: CategoriaNotizia | null;
  pagina?: number;
  perPagina?: number;
}): Promise<EsitoArchivioNotizie> {
  const perPagina = Math.max(1, options.perPagina ?? NOTIZIE_PER_PAGINA);
  const categoria = options.categoria ?? null;
  const archivio = await caricaArchivio(null);
  // Conteggi per categoria: l'archivio è già filtrato e deduplicato, quindi
  // un solo passaggio alimenta i numeri dei chip senza query aggiuntive.
  const conteggi: Record<string, number> = {};
  for (const notizia of archivio) {
    conteggi[notizia.category] = (conteggi[notizia.category] ?? 0) + 1;
  }
  const selezionati = categoria
    ? archivio.filter((notizia) => notizia.category === categoria)
    : archivio;

  const pagine = Math.max(1, Math.ceil(selezionati.length / perPagina));
  const pagina = Math.min(
    Math.max(1, Math.trunc(options.pagina ?? 1) || 1),
    pagine
  );
  const inizio = (pagina - 1) * perPagina;

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const prossimiEventi = categoria
    ? []
    : archivio
        .filter(
          (n) =>
            (n.tipo === "evento" || n.tipo === "fiera") &&
            n.eventoDataInizio !== null &&
            Date.parse(`${n.eventoDataInizio}T00:00:00`) >= oggi.getTime()
        )
        .sort(
          (a, b) =>
            Date.parse(a.eventoDataInizio as string) -
            Date.parse(b.eventoDataInizio as string)
        )
        .slice(0, MAX_PROSSIMI_EVENTI);

  return {
    notizie: selezionati.slice(inizio, inizio + perPagina),
    totale: selezionati.length,
    pagina,
    pagine,
    prossimiEventi,
    conteggi,
    totaleArchivio: archivio.length,
  };
}

/** Formatta la data di pubblicazione in formato italiano leggibile. */
export function formattaDataNotizia(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
