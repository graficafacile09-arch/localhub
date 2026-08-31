import {
  calcolaPunteggioNegozioConEspansione,
  filtraNegoziPerPertinenzaConEspansione,
  terminiOriginali,
} from "./ranking-negozi";
import { estraiToken, normalizza } from "./text-utils";
import { espandiQueryConSinonimi, espandiQueryConSinonimiBase } from "./ricerca-semantica";
import {
  concettiIntento,
  esclusioniNegazione,
  haQualificatoreEconomico,
} from "./ricerca-intento";
import { estraiCitta } from "./localita";
import { createAdminSupabaseClient } from "./supabase/admin";
import { isNumericId, isUuid, toSlug } from "./slug";
import type { ProdottoRicerca } from "./ricerca-ai";
import {
  patternIlikeTolleranti,
  punteggioFuzzy,
  similaritaLevenshtein,
  terminiSignificativi,
} from "./search-tollerante";
import type { Categoria } from "@/types/negozio";
import { CATEGORIE_NEGOZIO_META } from "./categorie-negozio";

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

// ─── Località (V8) ────────────────────────────────────────────────────────────
// Un negozio "è" in una città se il campo citta O l'indirizzo contengono la
// località normalizzata (stessa semantica del filtro p_citta della RPC).
function negozioMatchaCitta(negozio: Record<string, unknown>, citta: string): boolean {
  const target = normalizza(citta);
  if (!target) return false;
  const cittaCampo = normalizza(String((negozio as { citta?: unknown }).citta ?? ""));
  const indirizzo = normalizza(String((negozio as { indirizzo?: unknown }).indirizzo ?? ""));
  return cittaCampo.includes(target) || indirizzo.includes(target);
}

/** Filtra i prodotti ai soli appartenenti a negozi nella città richiesta
 *  (i prodotti non hanno una città propria: la derivano dal negozio). */
async function filtraProdottiPerCitta(
  db: ReturnType<typeof createAdminSupabaseClient>,
  risultati: Record<string, unknown>[],
  citta: string
): Promise<Record<string, unknown>[]> {
  if (risultati.length === 0) return risultati;
  const ids = Array.from(new Set(risultati.map((p) => p.negozio_id as string).filter(Boolean)));
  if (ids.length === 0) return risultati;
  const { data } = await db.from("negozi").select("id, citta, indirizzo").in("id", ids);
  const inCitta = new Set(
    (data ?? [])
      .filter((n) => negozioMatchaCitta(n as Record<string, unknown>, citta))
      .map((n) => n.id)
  );
  return risultati.filter((p) => inCitta.has(p.negozio_id as string));
}

// Assicura che un record negozio abbia uno slug pubblico valido.
// Se slug è null/vuoto: genera slug=toSlug(nome)+suffix se duplicato,
// salva l'UPDATE sul DB e restituisce lo slug finale.
// Non tocca RLS o altri campi; usa il client admin bypass per scritture.
async function assicuraSlugNegozio(
  db: ReturnType<typeof createAdminSupabaseClient>,
  negozio: Record<string, unknown>,
): Promise<string> {
  const attuale = ((negozio.slug as string) ?? "").trim();
  if (attuale) return attuale;

  const base = toSlug((negozio.nome as string) ?? "negozio") || "negozio";
  let candidato = base;
  let suffix = 1;
  // 10 tentativi di disambiguazione.
  while (suffix <= 100) {
    const { data: esistente } = await db
      .from("negozi")
      .select("id")
      .eq("slug", candidato)
      .neq("id", negozio.id as string)
      .limit(1)
      .maybeSingle();
    if (!esistente) break;
    suffix += 1;
    candidato = `${base}-${suffix}`;
  }

  const id = negozio.id as string;
  await db.from("negozi").update({ slug: candidato, updated_at: new Date().toISOString() }).eq("id", id);
  return candidato;
}


// Espansione semantica (sinonimi base + per profilo attività + normalizzazione)
// implementata in lib/ricerca-semantica.ts — qui solo re-export per compatibilità.
export { espandiQueryConSinonimi } from "./ricerca-semantica";

/** Opzioni aggiuntive per cercaNegozi (filtri semantici). */
export type CercaNegoziOptions = {
  categoria?: string;
  tipo?: string;
  citta?: string;
  limit?: number;
  /** Termini di ricerca espliciti (da intent AI): bypassa l'espansione. */
  termini?: string[];
};

// ─── Negozi ──────────────────────────────────────────────────────────────────

export async function getNegozi() {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("negozi")
    .select("*")
    .eq("attivo", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.log(error);
    return [];
  }

  return data ?? [];
}

export async function getNegozio(id: string) {
  const db = getDb();
  if (!db) return null;

  const { data, error } = await db
    .from("negozi")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error) {
    console.log(error);
    return null;
  }

  return data;
}

export async function getNegozioBySlug(slug: string) {
  const db = getDb();
  if (!db) return null;

  const { data, error } = await db
    .from("negozi")
    .select("*")
    .eq("slug", slug)
    .is("deleted_at", null)
    .single();

  if (error) {
    console.log(error);
    return null;
  }

  return data;
}

export async function getProdottoBySlug(slug: string) {
  const db = getDb();
  if (!db) return null;

  const { data, error } = await db
    .from("prodotti")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) {
    console.log(error);
    return null;
  }

  return data;
}

// ─── Risoluzione URL pubbliche (slug canonico + ponte legacy) ───────────────
// Le URL pubbliche usano SOLO gli slug. Se il parametro è un UUID legacy
// (negozio) o un id numerico legacy (prodotto), queste funzioni lo
// riconoscono e restituiscono slugLegacy: la route farà redirect 301/308
// verso l'URL canonica. Nessuna logica di rendering per gli ID.

// I dati pubblici arrivano dal DB (select *) e non sono tipizzati riga per
// riga: si usano Record<string, any> come per il resto del codice esistente.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecordPubblico = Record<string, any>;

export type RisoluzioneNegozio = {
  negozio: RecordPubblico | null;
  slugLegacy: string | null;
};

export type RisoluzioneProdotto = {
  prodotto: RecordPubblico | null;
  slugLegacy: string | null;
};

export async function risolviNegozioPubblico(param: string): Promise<RisoluzioneNegozio> {
  const db = getDb();

  // 1) Slug canonico: risoluzione diretta.
  const negozio = await getNegozioBySlug(param);
  if (negozio) return { negozio, slugLegacy: null };

  // 2) Ponte legacy: parametro che sembra un UUID → cerca per id.
  if (isUuid(param)) {
    const legacy = await getNegozio(param);
    if (legacy && db) {
      let slug = ((legacy.slug as string) ?? "").trim();
      if (!slug) slug = await assicuraSlugNegozio(db, legacy as Record<string, unknown>);
      if (slug) return { negozio: null, slugLegacy: `/negozio/${slug}` };
    }
  }

  return { negozio: null, slugLegacy: null };
}

export async function risolviProdottoPubblico(param: string): Promise<RisoluzioneProdotto> {
  // 1) Slug canonico: risoluzione diretta.
  const prodotto = await getProdottoBySlug(param);
  if (prodotto) return { prodotto, slugLegacy: null };

  // 2) Ponte legacy: parametro numerico (id bigint legacy) → cerca per id.
  if (isNumericId(param)) {
    const legacy = await getProdotto(param);
    if (legacy) {
      const slug = (legacy.slug as string) ?? "";
      if (slug) return { prodotto: null, slugLegacy: `/prodotto/${slug}` };
    }
  }

  return { prodotto: null, slugLegacy: null };
}

// Negozi in Evidenza: SOLO quelli con in_evidenza=true (attivi, non nel
// Cestino). ESATTAMENTE 2 query SQL, zero N+1:
//   Q1 negozi con flag in_evidenza (con limite opzionale, es. homepage max 8)
//   Q2 conteggio prodotti attivi per i negozi trovati (una sola query)
// Ranking identico alle pagine categoria: in_evidenza → prodotti attivi →
// visite (se esiste) → created_at DESC → nome → id (via ordinaNegoziPerCategoria).
export async function getNegoziInEvidenza(limit?: number) {
  const db = getDb();
  if (!db) return [];

  // Q1 — negozi in evidenza: attivi, non cestino, flag in_evidenza=true.
  let query = db
    .from("negozi")
    .select("*")
    .eq("in_evidenza", true)
    .eq("attivo", true)
    .is("deleted_at", null);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) return [];

  const negozi = data ?? [];
  if (negozi.length === 0) return [];

  // Q2 — conteggio prodotti attivi per i negozi trovati (una sola query,
  // niente N+1): si recuperano solo i negozio_id dei prodotti attivi.
  const conteggioProdotti = new Map<string, number>();
  const { data: prodotti } = await db
    .from("prodotti")
    .select("negozio_id")
    .eq("attivo", true)
    .in(
      "negozio_id",
      negozi.map((n) => n.id as string)
    );
  for (const p of prodotti ?? []) {
    const id = p.negozio_id as string;
    conteggioProdotti.set(id, (conteggioProdotti.get(id) ?? 0) + 1);
  }

  return ordinaNegoziPerCategoria(negozi, conteggioProdotti);
}

// ─── Categorie ──────────────────────────────────────────────────────────────

export async function getCategorie() {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("categorie")
    .select("*")
    .eq("attivo", true)
    .order("ordine", { ascending: true });

  if (error) {
    return [];
  }

  return (data as Categoria[]) ?? [];
}

export type CategoriaConNegozi = {
  categoria: Categoria;
  count: number;
};

// Categorie della navigazione pubblica (homepage + pagina /categorie).
// FONTE UNICA: le 71 categorie dell'editor (lib/categorie-negozio.ts),
// già ordinate alfabeticamente (A → Z, collazione italiana). Vengono sempre
// mostrate TUTTE, anche quelle senza negozi (count = 0), a differenza della
// vecchia logica che elencava solo le categorie realmente usate.
// Il DB (public.categorie) arricchisce ogni voce con id/descrizione/sinonimi
// e i conteggi reali; le categorie legacy presenti solo in DB restano intatte
// ma non compaiono in questa lista (0 extra). ESATTAMENTE 2 query, zero N+1.
export async function getCategorieConNegozi(): Promise<CategoriaConNegozi[]> {
  const db = getDb();

  const dbCategorie = await getCategorie();
  const conteggi = dbCategorie.length
    ? await getConteggiNegoziPerCategoria(dbCategorie)
    : new Map<string, number>();

  // Mappa slug → categoria DB (per id/descrizione/sinonimi e conteggi reali).
  const perSlug = new Map(dbCategorie.map((c) => [c.slug, c]));

  return CATEGORIE_NEGOZIO_META.map(({ nome, slug }) => {
    const dbCat = perSlug.get(slug);
    const categoria: Categoria = dbCat ?? {
      id: slug,
      nome,
      slug,
      descrizione: null,
      icona: null,
      immagine: null,
      sinonimi: [],
      ordine: 0,
      attivo: true,
    };
    const count = dbCat ? (conteggi.get(dbCat.id) ?? 0) : 0;
    return { categoria, count };
  });
}

export async function getCategoriaBySlug(slug: string) {
  const db = getDb();
  if (!db) return null;

  const { data, error } = await db
    .from("categorie")
    .select("*")
    .eq("slug", slug)
    .eq("attivo", true)
    .single();

  if (error) {
    try { console.error("[negozi] getCategoriaBySlug:", { slug, code: error?.code, message: error?.message }); } catch {}
    return null;
  }

  return (data as Categoria) ?? null;
}

// Termini di matching di una categoria: nome + sinonimi, normalizzati (lowercase, trim).
function getTerminiCategoria(categoria: Categoria): string[] {
  return [categoria.nome, ...(categoria.sinonimi ?? [])]
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

// Matching TOKEN-BASED tra un valore negozi.categoria e i termini di una
// categoria. Usa lo STESSO criterio in ogni punto (conteggi, showcase,
// ricerca):
//   1. se termini include direttamente il valore lowercase → match rapido
//   2. altrimenti estrae TOKEN normalizzati (NFD + split [^a-z0-9]+) da
//      entrambi e verifica che l'intersezione NON sia vuota.
// Così anche nomi categoria con " & " (es. "Tech & Elettronica" vs token
// singolo "elettronica") o con accenti matchano correttamente.
function valoreCategoriaMatcha(valore: string, termini: readonly string[]): boolean {
  const v = valore.trim().toLowerCase();
  if (!v) return false;
  if (termini.includes(v)) return true;

  const tokenValore = estraiToken(v);
  if (tokenValore.length === 0) return false;

  for (const termine of termini) {
    const t = termine.trim();
    if (!t) continue;
    if (tokenValore.includes(normalizza(t).trim())) return true;
    const tokenTermine = estraiToken(t);
    if (tokenTermine.some((tk) => tokenValore.includes(tk))) return true;
  }
  return false;
}

// Conta i negozi ATTIVI (attivo=true e non nel Cestino) per ogni categoria.
// Una sola query sul DB (seleziona solo la colonna categoria) e aggregazione in
// memoria: nessuna query per singola categoria (niente N+1). Il matching usa
// lo STESSO criterio di cercaNegoziPerCategoria (uguaglianza esatta
// case-insensitive su nome + sinonimi), così conteggio e negozi mostrati
// coincidono sempre esattamente.
export async function getConteggiNegoziPerCategoria(categorie: Categoria[]) {
  const db = getDb();
  if (!db) return new Map<string, number>();

  const { data, error } = await db
    .from("negozi")
    .select("categoria")
    .eq("attivo", true)
    .is("deleted_at", null);

  if (error) return new Map<string, number>();

  const conteggiPerValore = new Map<string, number>();
  for (const row of data ?? []) {
    const valore = ((row.categoria as string) ?? "").trim();
    if (!valore) continue;
    conteggiPerValore.set(valore, (conteggiPerValore.get(valore) ?? 0) + 1);
  }

  const conteggi = new Map<string, number>();
  for (const cat of categorie) {
    const termini = getTerminiCategoria(cat);
    let totale = 0;
    for (const [valore, count] of conteggiPerValore) {
      if (valoreCategoriaMatcha(valore, termini)) totale += count;
    }
    conteggi.set(cat.id, totale);
  }
  return conteggi;
}

// Ranking condiviso delle pagine categoria — stabile e deterministico
// (nessun ordinamento casuale):
//   1. in evidenza (in_evidenza = true) per primi
//   2. maggior numero di prodotti attivi
//   3. maggior numero di visite (campo facoltativo: se la colonna non esiste
//      viene letto come 0 e ignorato senza rompere il ranking)
//   4. più recenti (created_at DESC)
//   5. ordine alfabetico del nome (ultimo criterio)
//   Tie-break finale sull'id per garantire il determinismo totale.
function ordinaNegoziPerCategoria<T extends Record<string, unknown>>(
  negozi: T[],
  conteggioProdotti: Map<string, number>
): T[] {
  return negozi
    .slice()
    .sort((a, b) => {
      const aEvidenza = a.in_evidenza ? 1 : 0;
      const bEvidenza = b.in_evidenza ? 1 : 0;
      if (aEvidenza !== bEvidenza) return bEvidenza - aEvidenza;

      const aProdotti = conteggioProdotti.get(a.id as string) ?? 0;
      const bProdotti = conteggioProdotti.get(b.id as string) ?? 0;
      if (aProdotti !== bProdotti) return bProdotti - aProdotti;

      const aVisite = Number(a.visite ?? 0);
      const bVisite = Number(b.visite ?? 0);
      if (aVisite !== bVisite) return bVisite - aVisite;

      const aTime = new Date(a.created_at as string).getTime();
      const bTime = new Date(b.created_at as string).getTime();
      if (aTime !== bTime) return bTime - aTime;

      const nomeDiff = String(a.nome).localeCompare(String(b.nome), "it");
      if (nomeDiff !== 0) return nomeDiff;

      return String(a.id).localeCompare(String(b.id));
    });
}

export async function cercaNegoziPerCategoria(categoria: Categoria) {
  const db = getDb();
  if (!db) return [];

  // 1) Una sola query: valori distinti di categoria dei negozi attivi.
  const { data: valoriRows, error: errValori } = await db
    .from("negozi")
    .select("categoria")
    .eq("attivo", true)
    .is("deleted_at", null);

  if (errValori) return [];

  // 2) Risolvi quali valori appartengono ESATTAMENTE alla categoria:
  //    uguaglianza case-insensitive su nome + sinonimi (nessun LIKE, nessuna
  //    ricerca testuale). Copre i dati storici ("elettronica", "Elettronica")
  //    e quelli allineati al catalogo ("Tech & Elettronica").
  const termini = getTerminiCategoria(categoria);
  if (termini.length === 0) return [];

  const valoriUnici = Array.from(
    new Set(
      (valoriRows ?? [])
        .map((row) => ((row.categoria as string) ?? "").trim())
        .filter(Boolean)
    )
  );
  const matching = valoriUnici.filter((valore) => valoreCategoriaMatcha(valore, termini));

  if (matching.length === 0) return [];

  // 3) Filtro reale sul database: categoria IN (valori esatti).
  const { data, error } = await db
    .from("negozi")
    .select("*")
    .eq("attivo", true)
    .is("deleted_at", null)
    .in("categoria", matching);

  if (error) {
    return [];
  }

  const negozi = data ?? [];

  // 4) Una sola query aggregata per il conteggio dei prodotti ATTIVI per
  //    negozio (niente N+1): si recuperano solo i negozio_id dei prodotti
  //    attivi e si conta in memoria.
  const conteggioProdotti = new Map<string, number>();
  if (negozi.length > 0) {
    const { data: prodotti } = await db
      .from("prodotti")
      .select("negozio_id")
      .eq("attivo", true)
      .in(
        "negozio_id",
        negozi.map((n) => n.id as string)
      );
    for (const p of prodotti ?? []) {
      const id = p.negozio_id as string;
      conteggioProdotti.set(id, (conteggioProdotti.get(id) ?? 0) + 1);
    }
  }

  return ordinaNegoziPerCategoria(negozi, conteggioProdotti);
}

export type NegozioCategoria = {
  id: string;
  slug: string | null;
  nome: string;
  categoria: string | null;
  descrizione: string | null;
  logo_url: string | null;
  copertina_url: string | null;
  in_evidenza: boolean;
  visite: number | null;
  created_at: string;
  prodotti_attivi: number;
};

export type CategoriaShowcase = {
  categoria: Categoria | null;
  negozi: NegozioCategoria[];
  totaleNegozi: number;
};

// Vetrina ufficiale di una categoria (pagina /ricerca?categoria=<slug>).
// ESATTAMENTE 3 query SQL, zero N+1, nessuna query per singolo negozio:
//   Q1 categoria per slug
//   Q2 negozi attivi (filtro in-memory sui termini della categoria)
//   Q3 conteggio prodotti attivi per tutti i negozi trovati (una sola query)
// Il ranking riusa ordinaNegoziPerCategoria (identico a cercaNegoziPerCategoria).
export async function getCategoriaShowcase(slug: string): Promise<CategoriaShowcase> {
  const db = getDb();
  if (!db) return { categoria: null, negozi: [], totaleNegozi: 0 };

  // Q1 — categoria tramite slug.
  const categoria = await getCategoriaBySlug(slug);
  if (!categoria) return { categoria: null, negozi: [], totaleNegozi: 0 };

  const termini = getTerminiCategoria(categoria);
  if (termini.length === 0) return { categoria, negozi: [], totaleNegozi: 0 };

  // Q2 — negozi attivi in un'unica query; matching in-memory con lo STESSO
  // criterio di cercaNegoziPerCategoria (uguaglianza case-insensitive su
  // nome + sinonimi, nessun LIKE). Il select usa "*" così eventuali colonne
  // opzionali (es. visite) non rompono la query se assenti.
  const { data: negoziRaw, error: errNegozi } = await db
    .from("negozi")
    .select("*")
    .eq("attivo", true)
    .is("deleted_at", null);

  if (errNegozi) return { categoria, negozi: [], totaleNegozi: 0 };

  const negoziFiltrati = (negoziRaw ?? []).filter((n) => {
    const valore = ((n.categoria as string) ?? "").trim();
    return valore && valoreCategoriaMatcha(valore, termini);
  });

  if (negoziFiltrati.length === 0) {
    return { categoria, negozi: [], totaleNegozi: 0 };
  }

  // Q3 — conteggio prodotti attivi per TUTTI i negozi trovati (una sola
  // query aggregata) e aggregazione in memoria.
  const conteggioProdotti = new Map<string, number>();
  const { data: prodotti } = await db
    .from("prodotti")
    .select("negozio_id")
    .eq("attivo", true)
    .in(
      "negozio_id",
      negoziFiltrati.map((n) => n.id as string)
    );
  for (const p of prodotti ?? []) {
    const id = p.negozio_id as string;
    conteggioProdotti.set(id, (conteggioProdotti.get(id) ?? 0) + 1);
  }

  const ordinati = ordinaNegoziPerCategoria(negoziFiltrati, conteggioProdotti);

  const negozi: NegozioCategoria[] = [];
  for (const n of ordinati) {
    const slug = await assicuraSlugNegozio(db, n as Record<string, unknown>);
    negozi.push({
      id: n.id as string,
      slug,
      nome: n.nome as string,
      categoria: (n.categoria as string) ?? null,
      descrizione: (n.descrizione as string) ?? null,
      logo_url: (n.logo_url as string) ?? null,
      copertina_url: (n.copertina_url as string) ?? null,
      in_evidenza: !!n.in_evidenza,
      visite: n.visite != null ? Number(n.visite) : null,
      created_at: n.created_at as string,
      prodotti_attivi: conteggioProdotti.get(n.id as string) ?? 0,
    });
  }

  return { categoria, negozi, totaleNegozi: negozi.length };
}

export async function getProdotto(id: string) {
  const db = getDb();
  if (!db) return null;

  const { data, error } = await db
    .from("prodotti")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.log(error);
    return null;
  }

  return data;
}

// ─── Prodotti ────────────────────────────────────────────────────────────────

export type Prodotto = {
  id: string;
  slug: string | null;
  negozio_id: string;
  nome: string;
  descrizione: string | null;
  categoria: string | null;
  prezzo: number;
  immagine_principale: string | null;
  attivo: boolean;
  created_at: string;
};

export async function getProdottiNegozio(negozioId: string) {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("prodotti")
    .select("*")
    .eq("negozio_id", negozioId)
    .eq("attivo", true)
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  return data ?? [];
}

async function getProdottiPubbliciConNomi(
  db: ReturnType<typeof createAdminSupabaseClient>,
  limit: number
): Promise<Record<string, unknown>[]> {
  // Senza FK prodotti→negozi il join non è possibile: subquery via .in().
  const negoziValidi = await getNegoziPubbliciIds(db);
  if (negoziValidi.length === 0) return [];

  const { data, error } = await db
    .from("prodotti")
    .select("*")
    .eq("attivo", true)
    .in("negozio_id", negoziValidi)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];

  const negozioIds = Array.from(
    new Set(((data ?? []) as Record<string, unknown>[]).map((p) => p.negozio_id).filter(Boolean))
  );
  const { data: negozi } = negozioIds.length
    ? await db.from("negozi").select("id, nome").in("id", negozioIds).is("deleted_at", null)
    : { data: [] };
  const nomiNegozi = new Map((negozi ?? []).map((n) => [n.id, n.nome]));

  return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    ...p,
    negozio_nome: nomiNegozi.get(p.negozio_id as string) ?? "",
  }));
}

export async function getProdottiInEvidenza(limit = 8) {
  const db = getDb();
  if (!db) return [];
  return getProdottiPubbliciConNomi(db, limit);
}

// ─── Prodotti Tipici (vetrina territoriale Castrovillari/Pollino) ─────────
// Stesso identico pattern di getProdottiPubbliciConNomi, ma filtrato sui
// prodotti con flag prodotto_tipico = true (sempre attivi e appartenenti a
// negozi pubblicamente visibili). Il prodotto resta un normalissimo prodotto
// del catalogo: qui ci limitiamo a selezionare quelli in vendita nella
// vetrina territoriale.
export async function getProdottiTipici(limit = 8): Promise<Record<string, unknown>[]> {
  const db = getDb();
  if (!db) return [];

  const negoziValidi = await getNegoziPubbliciIds(db);
  if (negoziValidi.length === 0) return [];

  const { data, error } = await db
    .from("prodotti")
    .select("*")
    .eq("attivo", true)
    .eq("prodotto_tipico", true)
    .in("negozio_id", negoziValidi)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];

  const negozioIds = Array.from(
    new Set(((data ?? []) as Record<string, unknown>[]).map((p) => p.negozio_id).filter(Boolean))
  );
  const { data: negozi } = negozioIds.length
    ? await db.from("negozi").select("id, nome").in("id", negozioIds).is("deleted_at", null)
    : { data: [] };
  const nomiNegozi = new Map((negozi ?? []).map((n) => [n.id, n.nome]));

  return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    ...p,
    negozio_nome: nomiNegozi.get(p.negozio_id as string) ?? "",
  }));
}

// ─── Prodotti in Offerta (vetrina promozioni) ─────────────────────────────
// Stesso identico pattern di getProdottiTipici, ma filtrato sui prodotti con
// flag prodotto_offerta = true (sempre attivi e appartenenti a negozi
// pubblicamente visibili). Il prodotto resta un normalissimo prodotto del
// catalogo: qui ci limitiamo a selezionare quelli in vendita nella vetrina
// "Offerte".
export async function getProdottiOfferta(limit = 8): Promise<Record<string, unknown>[]> {
  const db = getDb();
  if (!db) return [];

  const negoziValidi = await getNegoziPubbliciIds(db);
  if (negoziValidi.length === 0) return [];

  const { data, error } = await db
    .from("prodotti")
    .select("*")
    .eq("attivo", true)
    .eq("prodotto_offerta", true)
    .in("negozio_id", negoziValidi)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];

  const negozioIds = Array.from(
    new Set(((data ?? []) as Record<string, unknown>[]).map((p) => p.negozio_id).filter(Boolean))
  );
  const { data: negozi } = negozioIds.length
    ? await db.from("negozi").select("id, nome").in("id", negozioIds).is("deleted_at", null)
    : { data: [] };
  const nomiNegozi = new Map((negozi ?? []).map((n) => [n.id, n.nome]));

  return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    ...p,
    negozio_nome: nomiNegozi.get(p.negozio_id as string) ?? "",
  }));
}

export async function getUltimiProdotti(limit = 12) {
  const db = getDb();
  if (!db) return [];
  return getProdottiPubbliciConNomi(db, limit);
}

// ════════════════════════════════════════════════════════════════════════════
// Ricerca prodotti pubblica (Fase C — discovery e filtri)
// ════════════════════════════════════════════════════════════════════════════

export type OrdinamentoProdottiPubblici = "rilevanza" | "prezzo_asc" | "prezzo_desc" | "novita";

/**
 * Opzioni di filtri/ordinamento/paginazione per la ricerca pubblica.
 * Tutti i filtri sono applicati server-side sulle colonne DB esistenti.
 */
export type CercaProdottiOptions = {
  /** Limita la ricerca al catalogo di un singolo negozio. */
  negozioId?: string;
  categoria?: string;
  sottocategoria?: string;
  marca?: string;
  colore?: string;
  prezzoMin?: number;
  prezzoMax?: number;
  soloDisponibili?: boolean;
  filtriCatalogo?: Record<string, string>;
  ordina?: OrdinamentoProdottiPubblici;
  pagina?: number;
  perPagina?: number;
};

export type RisultatoRicercaProdotti = {
  prodotti: ProdottoRicerca[];
  total: number;
};

export function isOrdinamentoProdottiPubblici(value: unknown): value is OrdinamentoProdottiPubblici {
  return value === "rilevanza" || value === "prezzo_asc" || value === "prezzo_desc" || value === "novita";
}

// Select comune della ricerca prodotti.
// quantita_disponibile/quantita_riservata: necessarie per il badge "Esaurito"
// nelle card pubbliche (Fase D).
const SELECT_PRODOTTO_RICERCA =
  "id, slug, negozio_id, nome, descrizione, categoria, sottocategoria, marca, colore, prezzo, immagine_principale, quantita_disponibile, quantita_riservata, ha_varianti";

/**
 * Id dei negozi pubblici (deleted_at non valorizzato).
 * NOTA: non esiste una FK tra prodotti.negozio_id e negozi.id nello schema,
 * quindi NON è possibile il join PostgREST (PGRST200); escludiamo i negozi
 * soft-deleted con una subquery manuale via .in().
 */
async function getNegoziPubbliciIds(
  db: ReturnType<typeof createAdminSupabaseClient>
): Promise<string[]> {
  const { data } = await db
    .from("negozi")
    .select("id")
    .is("deleted_at", null)
    .limit(2000);
  return ((data ?? []) as { id: string }[]).map((n) => n.id).filter(Boolean);
}

// Il query builder PostgREST ha tipi complessi e generici: usiamo un tipo
// locale allentato per gli helper (coerente con lo stile del resto del file).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryProdotti = any;

/** Applica ricerca testuale (or ilike) + filtri addizionali server-side. */
function applicaFiltriRicercaProdotti(
  query: QueryProdotti,
  termini: string[],
  opts: CercaProdottiOptions
): QueryProdotti {
  let q = query;

  if (termini.length > 0) {
    const filtri = termini
      .flatMap((t) => {
        const p = t.replace(/[,%]/g, " ").trim();
        if (!p) return [];
        return [
          `nome.ilike.%${p}%`,
          `descrizione.ilike.%${p}%`,
          `categoria.ilike.%${p}%`,
          `marca.ilike.%${p}%`,
          `sottocategoria.ilike.%${p}%`,
          `colore.ilike.%${p}%`,
          `materiale.ilike.%${p}%`,
        ];
      })
      .join(",");
    if (filtri) q = q.or(filtri);
  }

  if (opts.negozioId) q = q.eq("negozio_id", opts.negozioId);
  if (opts.categoria?.trim()) q = q.eq("categoria", opts.categoria.trim());
  if (opts.sottocategoria?.trim()) q = q.eq("sottocategoria", opts.sottocategoria.trim());
  if (opts.marca?.trim()) q = q.eq("marca", opts.marca.trim());
  if (opts.colore?.trim()) q = q.eq("colore", opts.colore.trim());
  if (opts.prezzoMin !== undefined && opts.prezzoMin > 0) q = q.gte("prezzo", opts.prezzoMin);
  if (opts.prezzoMax !== undefined && opts.prezzoMax > 0) q = q.lte("prezzo", opts.prezzoMax);
  if (opts.soloDisponibili) q = q.gt("quantita_disponibile", 0);
  if (opts.filtriCatalogo && Object.keys(opts.filtriCatalogo).length > 0) {
    q = q.filter("filtri_catalogo", "cs", JSON.stringify(opts.filtriCatalogo));
  }

  return q;
}

// ─── Ranking di rilevanza prodotti ───────────────────────────────────────────
// Pesi per campo: i campi "primari" (nome, categoria, sottocategoria) pesano
// molto più di quelli secondari (descrizione, marca, colore, materiale). Un
// termine ORIGINALE (digitato dall'utente) vale 1x; un sinonimo ESPANSO vale
// di meno. La soglia di pertinenza esclude i prodotti spuri (es. "Anello con
// pietra" che matcha solo "taglio" nella descrizione per la ricerca "pane").
const PESO_CAMPO_PRODOTTO: Record<string, number> = {
  nome: 30,
  categoria: 16,
  sottocategoria: 13,
  marca: 10,
  descrizione: 6,
  colore: 4,
  materiale: 4,
  tag: 8,
};

// Un sinonimo espanso (es. "taglio" da "pizza al taglio") pesa solo una
// frazione di un termine originale ("pane"). Impossibile per un sinonimo in
// un campo secondario superare la soglia di pertinenza.
const FATTORE_SINONIMO_PRODOTTO = 0.45;

/** Punteggio di rilevanza di un prodotto per i termini dati. */
function calcolaPunteggioProdotto(
  prodotto: Record<string, unknown>,
  originali: string[],
  espansi: string[]
): number {
  const setOriginali = new Set(originali.map((t) => normalizza(t).trim()).filter(Boolean));
  let punteggio = 0;

  const campi = [
    "nome",
    "categoria",
    "sottocategoria",
    "marca",
    "descrizione",
    "colore",
    "materiale",
    "tag",
  ];

  for (const campo of campi) {
    const valore = String(prodotto[campo] ?? "");
    if (!valore) continue;
    const norma = normalizza(valore);
    const peso = PESO_CAMPO_PRODOTTO[campo] ?? 4;
    for (const termine of espansi) {
      const tnorm = normalizza(termine).trim();
      if (!tnorm || tnorm.length < 3) continue;
      if (!norma.includes(tnorm)) continue;
      const originale = setOriginali.has(tnorm) || originali.some((o) => norma.includes(o));
      const fattore = originale ? 1 : FATTORE_SINONIMO_PRODOTTO;
      punteggio += peso * fattore;
    }
  }
  return punteggio;
}

/** Vero requisito di rilevanza per un prodotto:
 *  1) un termine ORIGINALE in CAMPIONIAMO qualunque campo ⇒ rilevante;
 *  2) un sinonimo ESPANSO vale SOLO in campi STRUTTURATI/di classificazione
 *     (categoria, sottocategoria, marca), NON nel lemma libero nome/descrizione.
 *
 * Evita il falso positivo reale: per "parrucchiere" il sinonimo espanso "taglio"
 * appare solo nel NOME libero di "Pizza Margherita al Taglio" (un anacronismo di
 * food), quindi NON deve bastare a restituire quel prodotto. Un prodotto di una
 * categoria pertinente matcha invece ancora su `categoria`/`sottocategoria`.
 */
function prodottoRilevante(
  prodotto: Record<string, unknown>,
  originali: string[],
  espansi: string[]
): boolean {
  const normaCampo = (c: string) => normalizza(String(prodotto[c] ?? ""));
  const inCampo = (c: string, t: string) => normaCampo(c).includes(t);
  // Campi in cui un sinonimo ESPANSO è una prova reale della classificazione
  // del prodotto. Il nome/descrizione (testo libero) non bastano per un sinonimo.
  const campiStrutturati = ["categoria", "sottocategoria", "marca"];

  // 1) Termine ORIGINALE in qualsiasi campo ⇒ rilevante (query diretta intatta).
  for (const o of originali) {
    const on = normalizza(o).trim();
    if (!on) continue;
    if (Object.keys(PESO_CAMPO_PRODOTTO).some((c) => inCampo(c, on))) return true;
  }

  // 2) Sinonimo ESPANSO in un campo strutturato di classificazione ⇒ rilevante.
  for (const e of espansi) {
    const en = normalizza(e).trim();
    if (!en || en.length < 3) continue;
    if (campiStrutturati.some((c) => inCampo(c, en))) return true;
  }

  return false;
}

// ─── V6-A: esclusione dei risultati per vincolo negativo ─────────────────────
// La negazione è applicata SOLO DOPO il retrieval, mai alla query di ricerca:
// la query originale resta sempre al recupero e la negazione diventa un filtro
// di esclusione finale. Conservativo: si esclude un negozio/prodotto solo se il
// concetto negato corrisponde in modo affidabile ai suoi campi strutturati
// (nome/categoria/sottocategoria/tipo) tramite la stessa matching di rilevanza
// già usata per il positive ranking. Niente invenzione: se il match non è
// affidabile, il record NON viene escluso.

// Un record (negozio o prodotto) è "negato" se il vocabolo negato compare nei
// campi strutturati come token rilevante (radice/prefisso, come in ranking).
function matchNegato(valore: unknown, termineNegato: string): boolean {
  const campo = normalizza(String(valore ?? ""));
  const t = normalizza(termineNegato).trim();
  if (!campo || !t || t.length < 3) return false;
  if (campo.includes(t)) return true;
  return estraiToken(campo).some((token) => {
    const radiceNegato = t.slice(0, 4);
    return token.length >= 3 && token.startsWith(radiceNegato);
  });
}

/** Campi "identità" di un negozio usati per valutare il vincolo negativo. */
function campiNegazioneNegozio(n: Record<string, unknown>): unknown[] {
  const tipo =
    n.tipo_attivita ??
    (n.data as { tipo_attivita?: unknown } | null | undefined)?.tipo_attivita ??
    "";
  return [n.nome, n.categoria, n.sottocategoria, tipo, n.parole_chiave, n.servizi];
}

/** Espande un termine negato nel suo GRUPPO di sinonimi reale (es. "alimentare"
 *  → panificio/forno/pane/gastronomia...). Così la negazione esclude anche le
 *  attività il cui nome/categoria non contiene il vocabolo letterale ma è comunque
 *  del concetto negato. Riusa la tassonomia esistente: nessun dizionario nuovo. */
function terminiNegatiEspansi(negati: string[]): string[] {
  const set = new Set<string>();
  for (const neg of negati) {
    set.add(neg);
    const grp = espandiQueryConSinonimi(neg).split(/\s+/).map((t) => t.trim()).filter(Boolean);
    for (const t of grp) set.add(t);
  }
  return Array.from(set).filter((t) => t.length >= 3);
}

/** Filtra i negozi rimuovendo quelli che matchano in modo affidabile la negazione. */
function escludiNegoziPerNegazione(
  negozi: Record<string, unknown>[],
  negati: string[]
): Record<string, unknown>[] {
  if (!negati || negati.length === 0) return negozi;
  const espansi = terminiNegatiEspansi(negati);
  return negozi.filter(
    (n) => !espansi.some((neg) => campiNegazioneNegozio(n).some((c) => matchNegato(c, neg)))
  );
}

/** Campi "identità" di un prodotto usati per il vincolo negativo. */
function campiNegazioneProdotto(p: Record<string, unknown>): unknown[] {
  return [p.nome, p.categoria, p.sottocategoria, p.marca];
}

/** Filtra i prodotti rimuovendo quelli che matchano in modo affidabile la negazione. */
function escludiProdottiPerNegazione(
  prodotti: Record<string, unknown>[],
  negati: string[]
): Record<string, unknown>[] {
  if (!negati || negati.length === 0) return prodotti;
  const espansi = terminiNegatiEspansi(negati);
  return prodotti.filter(
    (p) => !espansi.some((neg) => campiNegazioneProdotto(p).some((c) => matchNegato(c, neg)))
  );
}

/** Riordina per punteggio, scarta gli spuri, taglia al limite. */
function ordinaFiltraProdottiPerRilevanza(
  risultati: Record<string, unknown>[],
  ricerca: string,
  terminiEspansi: string[],
  limite: number
): Record<string, unknown>[] {
  const originali = terminiSignificativi(ricerca, 10);
  // Termini originali presenti anche espansi gestiti sopra.
  const conPunteggio = risultati
    .map((p) => ({
      p,
      punteggio: calcolaPunteggioProdotto(p, originali, terminiEspansi),
      rilevante: prodottoRilevante(p, originali, terminiEspansi),
    }))
    .filter(({ punteggio, rilevante }) => punteggio > 0 && rilevante);

  // Soglia relativa al miglior risultato (con un minimo assoluto) per escludere
  // i match deboli. Se però esiste un match esatto/forte il top resta sempre.
  if (conPunteggio.length === 0) return [];
  conPunteggio.sort((a, b) => b.punteggio - a.punteggio);
  const topScore = conPunteggio[0].punteggio;
  const soglia = Math.max(8, Math.ceil(topScore * 0.35));
  const filtrati = conPunteggio
    .filter(({ punteggio }) => punteggio >= soglia)
    .map(({ p }) => p);

  return (filtrati.length > 0 ? filtrati : conPunteggio.slice(0, 1).map(({ p }) => p)).slice(0, limite);
}

function haFiltriAddizionali(opts: CercaProdottiOptions): boolean {
  return Boolean(
    opts.negozioId ||
      opts.categoria?.trim() ||
      opts.sottocategoria?.trim() ||
      opts.marca?.trim() ||
      opts.colore?.trim() ||
      (opts.prezzoMin !== undefined && opts.prezzoMin > 0) ||
      (opts.prezzoMax !== undefined && opts.prezzoMax > 0) ||
      opts.soloDisponibili ||
      (opts.filtriCatalogo && Object.keys(opts.filtriCatalogo).length > 0)
  );
}

/**
 * Core condiviso della ricerca prodotti. Ritorna i risultati grezzi e il
 * totale (count exact quando conCount). Gestisce la pagina fuori intervallo
 * (PostgREST 416/PGRST103) restituendo pagina vuota con il total corretto.
 */
async function cercaProdottiCore(
  ricerca: string,
  opts: {
    limite: number;
    pagina?: number;
    perPagina?: number;
    conCount: boolean;
    filtri: CercaProdottiOptions;
  }
): Promise<{ risultati: Record<string, unknown>[]; total: number | null }> {
  const db = getDb();
  if (!db) return { risultati: [], total: null };

  // Prodotti: sinonimi di categoria/commercio (NON il vocabolario dei profili
  // attività per evitare falsi positivi es. "dottore" → latte) + concetti
  // d'intento ADDITIVI (es. "ho sete" → bevande/acqua/bar). La query originale
  // resta comunque rappresentata dai token base in espandiQueryConSinonimiBase
  // (i concetti aggiungono, mai restringono).
  const espansaBase = `${concettiIntento(ricerca)} ${espandiQueryConSinonimiBase(ricerca)}`;
  let termini = Array.from(
    new Set(
      espansaBase
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean)
    )
  ).slice(0, 16);

  // V8 — LOCALITÀ: il token città viene rimosso dai termini prodotto (è un
  // vincolo applicato sul negozio proprietario in fondo, non una keyword da
  // far matchare nei nomi prodotto: evita che "Cipolla di Castrovillari" o
  // "Ciotaredda di Castrovillari" rispondano a "pizza a Castrovillari").
  const cittaProdotto = estraiCitta(ricerca);
  if (cittaProdotto) {
    const tokenCittaP = normalizza(cittaProdotto);
    const senzaCitta = termini.filter((t) => normalizza(t) !== tokenCittaP);
    if (senzaCitta.length > 0) termini = senzaCitta;
  }

  const conFiltriExtra = haFiltriAddizionali(opts.filtri);

  // Negozi pubblici (non soft-deleted): senza join FK, filtro via .in().
  const negoziValidi = await getNegoziPubbliciIds(db);
  if (negoziValidi.length === 0) return { risultati: [], total: 0 };

  let query = db
    .from("prodotti")
    .select(SELECT_PRODOTTO_RICERCA, opts.conCount ? { count: "exact" } : undefined)
    .eq("attivo", true)
    .in("negozio_id", negoziValidi);

  query = applicaFiltriRicercaProdotti(query, termini, opts.filtri);

  // Ordinamento (rilevanza = ordine DB naturale, ranking storico invariato).
  switch (opts.filtri.ordina) {
    case "prezzo_asc":
      query = query.order("prezzo", { ascending: true });
      break;
    case "prezzo_desc":
      query = query.order("prezzo", { ascending: false });
      break;
    case "novita":
      query = query.order("created_at", { ascending: false });
      break;
    default:
      break;
  }

  // Paginazione (range inclusivo) oppure limite semplice.
  const { pagina, perPagina } = opts;
  if (opts.conCount && pagina && perPagina) {
    const from = (pagina - 1) * perPagina;
    query = query.range(from, from + perPagina - 1);
  } else {
    query = query.limit(opts.limite);
  }

  const { data, count, error } = await query;
  const total = typeof count === "number" ? count : null;

  // Pagina fuori intervallo → PostgREST 416 (PGRST103): pagina vuota + total.
  if (error && (String((error as { code?: string }).code) === "PGRST103" || /range/i.test(error.message ?? ""))) {
    let countQuery = db
      .from("prodotti")
      .select("id", { head: true, count: "exact" })
      .eq("attivo", true)
      .in("negozio_id", negoziValidi);
    countQuery = applicaFiltriRicercaProdotti(countQuery, termini, opts.filtri);
    const { count: totalCount } = await countQuery;
    return { risultati: [], total: typeof totalCount === "number" ? totalCount : 0 };
  }

  if (error) return { risultati: [], total };

  let risultati = (data ?? []) as Record<string, unknown>[];

  // RANKING di rilevanza prodotti (ricerca libera, senza filtri): un match
  // esatto/nei campi principali vince; quelli SPURI (sinonimo espanso in un
  // campo secondario, es. "taglio" nella descrizione di un anello per la
  // ricerca "pane") vengono scartati alla fonte. I dati vengono riordinati
  // per punteggio e filtrati sotto la soglia di pertinenza.
  if (!conFiltriExtra && ricerca.trim()) {
    risultati = ordinaFiltraProdottiPerRilevanza(
      risultati,
      ricerca,
      termini,
      opts.limite
    );
  }

  // Fallback tollerante (refusi/accenti/plurali): solo senza filtri addizionali
  // e a pagina 1 — identico al comportamento storico di cercaProdotti().
  const paginaCorrente = pagina ?? 1;
  if (!conFiltriExtra && paginaCorrente === 1 && risultati.length < opts.limite) {
    const tolleranti = await cercaProdottiTolleranti(db, ricerca, risultati, opts.limite, negoziValidi);
    if (tolleranti.length > 0) {
      risultati = unisciEsattiETolleranti(risultati, tolleranti, opts.limite);
    }
  }

  // V6-A: vincolo negativo applicato SOLO sui risultati finali (query intatta).
  const negatiProdotti = esclusioniNegazione(ricerca);
  if (negatiProdotti.length > 0) {
    risultati = escludiProdottiPerNegazione(risultati, negatiProdotti);
  }

  // V6-B: qualificatore "economico/conveniente" → segnale REALE di prezzo.
  // Solo prodotti rilevanti già recuperati, senza filtri espliciti di prezzo
  // (chi ha scelto un range non vuole un ulteriore riordino). Prezzo più basso
  // davanti — è un dato realmente presente nel DB, non una categoria inventata.
  if (
    !conFiltriExtra &&
    ricerca.trim() &&
    haQualificatoreEconomico(ricerca) &&
    opts.filtri.prezzoMin === undefined &&
    opts.filtri.prezzoMax === undefined
  ) {
    risultati = [...risultati].sort(
      (a, b) => Number(a.prezzo ?? 0) - Number(b.prezzo ?? 0)
    );
  }

  // V8 — vincolo città sul negozio proprietario dei prodotti (i prodotti non
  // hanno una città propria: la derivano dal negozio, citta OR indirizzo).
  if (cittaProdotto) {
    risultati = await filtraProdottiPerCitta(db, risultati, cittaProdotto);
  }

  return { risultati, total };
}

/** Arricchisce i risultati con il nome del negozio (una sola query). */
async function mappaProdottoRicerca(
  risultati: Record<string, unknown>[]
): Promise<ProdottoRicerca[]> {
  const db = getDb();
  if (!db) return [];

  const negozioIds = Array.from(
    new Set(risultati.map((prodotto) => prodotto.negozio_id).filter(Boolean))
  );
  const { data: negozi } = negozioIds.length
    ? await db.from("negozi").select("id, nome").in("id", negozioIds).is("deleted_at", null)
    : { data: [] };
  const nomiNegozi = new Map((negozi ?? []).map((negozio) => [negozio.id, negozio.nome]));

  return risultati.map((p) => ({
    id: p.id as string,
    slug: (p.slug as string) ?? null,
    negozio_id: p.negozio_id as string,
    nome: p.nome as string,
    descrizione: (p.descrizione as string) ?? null,
    categoria: (p.categoria as string) ?? null,
    prezzo: p.prezzo as number,
    immagine_principale: (p.immagine_principale as string) ?? null,
    quantita_disponibile:
      p.quantita_disponibile != null ? Number(p.quantita_disponibile) : null,
    quantita_riservata:
      p.quantita_riservata != null ? Number(p.quantita_riservata) : null,
    ha_varianti: Boolean(p.ha_varianti),
    negozio_nome: nomiNegozi.get(p.negozio_id as string) ?? "",
  }));
}

/**
 * Ricerca pubblica storica: identica al comportamento precedente (nessun
 * count, limite fisso, fallback tollerante). Backward-compatible.
 */
export async function cercaProdotti(ricerca: string, limit = 20): Promise<ProdottoRicerca[]> {
  const { risultati } = await cercaProdottiCore(ricerca, {
    limite: limit,
    conCount: false,
    filtri: {},
  });
  return mappaProdottoRicerca(risultati);
}

/**
 * Ricerca pubblica con filtri/ordinamento/paginazione (Fase C).
 * Ritorna prodotti + total (count exact).
 */
export async function cercaProdottiConOpzioni(
  ricerca: string,
  opts: CercaProdottiOptions = {}
): Promise<RisultatoRicercaProdotti> {
  const perPagina = opts.perPagina && opts.perPagina > 0 ? Math.min(opts.perPagina, 60) : 12;
  const pagina = opts.pagina && opts.pagina > 0 ? Math.min(opts.pagina, 1000) : 1;

  const { risultati, total } = await cercaProdottiCore(ricerca, {
    limite: perPagina,
    pagina,
    perPagina,
    conCount: true,
    filtri: opts,
  });

  return {
    prodotti: await mappaProdottoRicerca(risultati),
    total: typeof total === "number" ? total : risultati.length,
  };
}

/**
 * Valori distinti per i filtri pubblici (categorie, sottocategorie, marche,
 * colori) dai soli prodotti attivi di negozi non eliminati.
 */
export async function getFiltriDisponibiliProdotti(): Promise<{
  categorie: string[];
  sottocategorie: string[];
  marche: string[];
  colori: string[];
}> {
  const db = getDb();
  if (!db) return { categorie: [], sottocategorie: [], marche: [], colori: [] };

  const negoziValidi = await getNegoziPubbliciIds(db);
  if (negoziValidi.length === 0) {
    return { categorie: [], sottocategorie: [], marche: [], colori: [] };
  }

  const { data } = await db
    .from("prodotti")
    .select("categoria, sottocategoria, marca, colore")
    .eq("attivo", true)
    .in("negozio_id", negoziValidi)
    .limit(500);

  const categorie = new Set<string>();
  const sottocategorie = new Set<string>();
  const marche = new Set<string>();
  const colori = new Set<string>();

  const aggiungi = (set: Set<string>, valore: unknown) => {
    const s = String(valore ?? "").trim();
    if (s) set.add(s);
  };

  for (const r of (data ?? []) as Record<string, unknown>[]) {
    aggiungi(categorie, r.categoria);
    aggiungi(sottocategorie, r.sottocategoria);
    aggiungi(marche, r.marca);
    aggiungi(colori, r.colore);
  }

  const ordina = (set: Set<string>) => Array.from(set).sort((a, b) => a.localeCompare(b, "it"));
  return {
    categorie: ordina(categorie),
    sottocategorie: ordina(sottocategorie),
    marche: ordina(marche),
    colori: ordina(colori),
  };
}

// ─── Ricerca tollerante (fallback) ───────────────────────────────────────────

// Unisce risultati esatti e tolleranti, deduplicando per id e rispettando il
// limite: prima gli esatti (ranking invariato), poi i tolleranti ordinati per
// punteggio fuzzy. Non rimescola mai l'ordine degli esatti.
function unisciEsattiETolleranti<T extends Record<string, unknown>>(
  esatti: T[],
  tolleranti: T[],
  limit: number
): T[] {
  const visti = new Set(esatti.map((r) => String(r.id)));
  const aggiunti: T[] = [];
  for (const r of tolleranti) {
    const chiave = String(r.id);
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    aggiunti.push(r);
    if (esatti.length + aggiunti.length >= limit) break;
  }
  return [...esatti, ...aggiunti].slice(0, limit);
}

// Vero requisito di rilevanza per il fallback fuzzy: almeno un termine
// significativo deve comparire come SOTTOSTRINGA in uno dei campi (soglia di
// precisione). Impedisce che il fallback restituisca risultati spazzatura
// quando la similarità Levenshtein è solo debole (es. "problemi alle orecchie"
// → cipolla/cornetto).
// ─── Predicato di rilevanza del fallback fuzzy ───────────────────────────────
// Un risultato tollerante è accettabile SOLO se c'è un vero appiglio al
// termine significativo: una sottostringa (anche con accenti) OPPURE un token
// molto vicino per edit-distance (refuso, plurale). Esclude i falsi positivi
// del wildcard `_` (es. "problemi alle orecchie" → cipolla/cornetto).

// Sottostringa accent-insensitive (usa normalizza = NFD + lowercase).
function haSottostringaSignificativa(termini: string[], campi: unknown[]): boolean {
  for (const termine of termini) {
    if (!termine) continue;
    const t = normalizza(termine);
    for (const campo of campi) {
      if (campo == null) continue;
      if (normalizza(String(campo)).includes(t)) return true;
    }
  }
  return false;
}

// Token vicino per distanza di edit (refuso ragionevole): similarità più alta
// sui termini CORTI per evitare match semantici lontani ("pizza" → "pinza").
// Esempi mantenuti: "panifcio" ≈ "panificio" (sim ~0.89), "pizeria" ≈
// "pizzeria" (~0.88). Ridotti manualmente i falsi come "pizza"→"pinza" (~0.8).
function haTermineVicino(termini: string[], campi: unknown[]): boolean {
  for (const termine of termini) {
    if (!termine || termine.length < 4) continue;
    const soglia = termine.length <= 6 ? 0.85 : 0.8;
    for (const campo of campi) {
      if (campo == null) continue;
      for (const tok of normalizza(String(campo)).split(/[^a-z0-9]+/)) {
        if (tok.length >= 4 && similaritaLevenshtein(tok, termine) >= soglia) return true;
      }
    }
  }
  return false;
}

function rilevanteFallback(termini: string[], campi: unknown[]): boolean {
  return haSottostringaSignificativa(termini, campi) || haTermineVicino(termini, campi);
}

// Query tollerante sui prodotti: pattern con varianti accentate e wildcard di
// tolleranza sui termini significativi, poi punteggio fuzzy in memoria.
async function cercaProdottiTolleranti(
  db: ReturnType<typeof createAdminSupabaseClient>,
  ricerca: string,
  giaTrovati: Record<string, unknown>[],
  limit: number,
  negoziValidi: string[]
): Promise<Record<string, unknown>[]> {
  const termini = terminiSignificativi(ricerca, 3);
  if (termini.length === 0) return [];

  // Pattern per ogni termine: esatto + rimozione/sostituzione/inserzione
  // (1 errore) + accenti. Cap per termine (26) e totale (70): copre anche i
  // refusi da carattere duplicato/mancante ("panifffio"→"panificio") senza
  // esplodere le condizioni di PostgREST.
  const pattern = new Set<string>();
  for (const t of termini) {
    for (const p of patternIlikeTolleranti(t).slice(0, 26)) pattern.add(p);
    if (pattern.size >= 70) break;
  }
  const patternList = Array.from(pattern).slice(0, 70);
  if (patternList.length === 0) return [];

  const filtri = patternList
    .flatMap((pat) => [
      `nome.ilike.${pat}`,
      `descrizione.ilike.${pat}`,
      `categoria.ilike.${pat}`,
      `marca.ilike.${pat}`,
      `sottocategoria.ilike.${pat}`,
    ])
    .join(",");

  const { data, error } = await db
    .from("prodotti")
    .select("id, slug, negozio_id, nome, descrizione, categoria, marca, sottocategoria, prezzo, immagine_principale, quantita_disponibile, quantita_riservata, ha_varianti")
    .eq("attivo", true)
    .in("negozio_id", negoziValidi)
    .or(filtri)
    .limit(50);

  if (error) return [];

  const trovati = new Set(giaTrovati.map((r) => String(r.id)));
  return (data ?? [])
    .filter((r) => !trovati.has(String(r.id)))
    .map((r) => ({
      riga: r as Record<string, unknown>,
      punteggio: punteggioFuzzy([r.nome, r.descrizione, r.categoria, r.marca, r.sottocategoria], termini),
    }))
    // Pertinenza: sottostringa (anche con accenti) o token vicino per edit-
    // distance. Esclude spazzatura dal wildcard `_` ("problemi alle orecchie"
    // → cipolla/cornetto) ma mantiene i refusi ragionevoli ("panifcio").
    .filter((x) =>
      x.punteggio > 0 &&
        rilevanteFallback(termini, [
          x.riga.nome,
          x.riga.descrizione,
          x.riga.categoria,
          x.riga.marca,
          x.riga.sottocategoria,
        ])
    )
    .sort((a, b) => b.punteggio - a.punteggio)
    .slice(0, limit)
    .map((x) => x.riga);
}

// ─── Ricerca negozi ──────────────────────────────────────────────────────────

export async function cercaNegozi(
  ricerca: string,
  opts: CercaNegoziOptions = {}
) {
  const db = getDb();
  if (!db) return [];

  // Espansione ADDITIVA: sinonimi esistenti + concetti d'intento (es. "ho sete" →
  // bevande/bar/caffetteria). I termini ORIGINALI significativi sono già dentro
  // espandiQueryConSinonimi (che mantiene i token base), quindi la query non va
  // persa; i concetti si aggiungono (OR), mai come filtro AND restrittivo.
  const espansa = opts.termini && opts.termini.length > 0
    ? `${opts.termini.join(" ")} ${concettiIntento(ricerca)}`
    : `${concettiIntento(ricerca)} ${espandiQueryConSinonimi(ricerca)}`;
  const terminiEspansi = Array.from(
    new Set(
      espansa
        .split(/\s+/)
        .map((termine) => termine.trim())
        .filter(Boolean)
    )
  ).slice(0, 24);

  let termini = (terminiEspansi.length > 0 ? terminiEspansi : [normalizza(ricerca).trim()])
    .filter(Boolean);

  const categoria = opts.categoria?.trim() || null;
  const tipo = opts.tipo?.trim() || null;
  // V8 — LOCALITÀ: la città diventa un VINCOLO reale (p_citta sulla RPC), non
  // una keyword. Se opts.citta non viene passato, la riconosciamo nel testo.
  const citta = opts.citta?.trim() || estraiCitta(ricerca) || null;
  const tokenCitta = citta ? normalizza(citta) : "";

  // Rimuoviamo il token città dai termini di recall (sarebbe una keyword a
  // basso peso) e dal ranking. Se dopo la rimozione non resta nulla (query di
  // sola città), la città resta come unico termine e la RPC filtra per p_citta.
  const terminiSenzaCitta = termini.filter((t) => normalizza(t) !== tokenCitta);
  if (terminiSenzaCitta.length > 0) termini = terminiSenzaCitta;
  if (termini.length === 0) return [];

  // Termini ORIGINALI digitati dall'utente: dominano il ranking (vedi ranking-negozi).
  // Il token città è escluso per non far dominare un negozio che ha la città
  // nel nome (es. "Sapori di Castrovillari" per "pizza a Castrovillari").
  let terminiOriginaliNegozi = terminiOriginali(ricerca);
  if (tokenCitta) terminiOriginaliNegozi = terminiOriginaliNegozi.filter((t) => t !== tokenCitta);
  let terminiEspansiRanking = terminiEspansi;
  if (tokenCitta) terminiEspansiRanking = terminiEspansi.filter((t) => normalizza(t) !== tokenCitta);

  let righe: any[] = [];

  // RECALL via RPC PostgreSQL (multi-campo, incluso data.tipo_attivita e
  // servizi_strutturati). Se la RPC non è ancora installata (migration non
  // applicata) oppure fallisce, ripiegamento sicuro sulla ricerca ilike storica.
  try {
    const { data, error } = await db.rpc("cerca_negozi_semantico", {
      p_termini: termini,
      p_categoria: categoria,
      p_tipo: tipo,
      p_citta: citta,
      p_limit: opts.limit ?? 40,
      p_min_score: 6,
    });
    if (error) throw error;
    righe = (data ?? []);

  } catch (err) {
    console.warn(
      "[cercaNegozi] RPC non disponibile, fallback ilike:",
      (err as { message?: string })?.message ?? err
    );
    righe = (await cercaNegoziLegacy(db, espansa, ricerca)) as any[];
  }

  // V6-A: vincolo negativo estratto una sola volta (mai tocca la query di
  // retrieval sopra). Applicato ai CANDIDATI PRIMA del ranking-threshold:
  // così i negozi negati (food) non gonfiano il top-score e non fanno cadere
  // sotto soglia un risultato pertinente (es. Barone Gioielli in "regalo non
  // alimentare"). Esclusione finale anche su tolleranti.
  const negatiNegozi = esclusioniNegazione(ricerca);
  if (negatiNegozi.length > 0) {
    righe = escludiNegoziPerNegazione(righe, negatiNegozi);
  }
  // V8 — vincolo città sui candidati (copre anche il fallback ilike, dove la
  // RPC non applica p_citta).
  if (citta) {
    righe = righe.filter((n) => negozioMatchaCitta(n, citta));
  }

  // Nessun candidato → ricerca tollerante (refusi, accenti, plurali).
  if (righe.length === 0) {
    const tollerantiZero = await cercaNegoziTolleranti(db, ricerca);
    const filtratiZero = citta
      ? tollerantiZero.filter((n) => negozioMatchaCitta(n, citta))
      : tollerantiZero;
    return escludiNegoziPerNegazione(filtratiZero, negatiNegozi);
  }

  // RANKING finale in TypeScript: i termini ORIGINALI dominano, i sinonimi
  // espansi pesano meno. I match generici di profilo (es. "salute" in un
  // negozio "Salute e benessere") non superano mai un negozio che matcha
  // davvero il termine digitato (es. "farmacia" in una farmacia).
  const conPunteggio = righe.filter(
    (negozio) => calcolaPunteggioNegozioConEspansione(negozio, terminiOriginaliNegozi, terminiEspansiRanking) > 0
  );
  const esatti = filtraNegoziPerPertinenzaConEspansione(
    conPunteggio.length > 0 ? conPunteggio : righe,
    terminiOriginaliNegozi,
    terminiEspansiRanking
  );

  if (esatti.length > 0) return esatti;
  const tolleranti = await cercaNegoziTolleranti(db, ricerca);
  const filtratiToll = citta
    ? tolleranti.filter((n) => negozioMatchaCitta(n, citta))
    : tolleranti;
  return escludiNegoziPerNegazione(filtratiToll, negatiNegozi);
}

/**
 * Fallback storico senza RPC: ricerca ilike su nome/categoria/descrizione +
 * array `cs` su servizi/parole_chiave (non copre data.tipo_attivita né
 * servizi_strutturati in jsonb). Serve solo quando la migration non è
 * applicata; il ranking finale (filtraNegoziPerPertinenza) resta identico.
 */
async function cercaNegoziLegacy(
  db: ReturnType<typeof createAdminSupabaseClient>,
  espansa: string,
  ricerca: string
): Promise<unknown[]> {
  const termini = Array.from(new Set(espansa.split(/\s+/).filter(Boolean))).slice(0, 12);
  const elemento = (p: string) =>
    /^[A-Za-z0-9_.\-]+$/.test(p) ? p : `"${p.replace(/"/g, '\\"')}"`;

  const filtriRicerca = (termini.length > 0 ? termini : [ricerca.trim()])
    .flatMap((termine) => {
      const pulito = termine.replace(/[,%]/g, " ").trim();
      if (!pulito) return [];
      return [
        `nome.ilike.%${pulito}%`,
        `categoria.ilike.%${pulito}%`,
        `descrizione.ilike.%${pulito}%`,
        `servizi.cs.{${elemento(pulito)}}`,
        `parole_chiave.cs.{${elemento(pulito)}}`,
        // Matching sul profilo attività (jsonb data.tipo_attivita): consente di
        // trovare gli studi professionali per tipo anche senza la RPC (es.
        // "medico"/"dottore" → data.tipo_attivita = "medico").
        `data->>tipo_attivita.ilike.%${pulito}%`,
        `sottocategoria.ilike.%${pulito}%`,
      ];
    })
    .join(",");

  const { data, error } = await db
    .from("negozi")
    .select("*")
    .eq("attivo", true)
    .or(filtriRicerca)
    .is("deleted_at", null);

  if (error) {
    console.log(error);
    return [];
  }

  const terminiOrig = terminiOriginali(ricerca);
  const espansiArray = Array.from(
    new Set(espansa.split(/\s+/).map((t) => t.trim()).filter(Boolean))
  );
  const esatti = filtraNegoziPerPertinenzaConEspansione(
    (data ?? []).filter(
      (negozio) => calcolaPunteggioNegozioConEspansione(negozio, terminiOrig, espansiArray) > 0
    ),
    terminiOrig,
    espansiArray
  );
  return esatti;
}

// Query tollerante sui negozi: pattern con varianti accentate e wildcard di
// tolleranza sui termini significativi, poi punteggio fuzzy in memoria.
async function cercaNegoziTolleranti(
  db: ReturnType<typeof createAdminSupabaseClient>,
  ricerca: string
): Promise<Record<string, unknown>[]> {
  const termini = terminiSignificativi(ricerca, 3);
  if (termini.length === 0) return [];

  const pattern = new Set<string>();
  for (const t of termini) {
    for (const p of patternIlikeTolleranti(t).slice(0, 26)) pattern.add(p);
    if (pattern.size >= 70) break;
  }
  const patternList = Array.from(pattern).slice(0, 70);
  if (patternList.length === 0) return [];

  const filtri = patternList
    .flatMap((pat) => [`nome.ilike.${pat}`, `categoria.ilike.${pat}`, `descrizione.ilike.${pat}`])
    .join(",");

  const { data, error } = await db
    .from("negozi")
    .select("*")
    .eq("attivo", true)
    .or(filtri)
    .is("deleted_at", null)
    .limit(30);

  if (error) {
    console.log(error);
    return [];
  }

  return (data ?? [])
    .map((n) => ({
      negozio: n as Record<string, unknown>,
      punteggio: punteggioFuzzy([n.nome, n.categoria, n.descrizione], termini),
    }))
    // Pertinenza: sottostringa (anche con accenti) o token vicino per edit-
    // distance. Niente spazzatura dal fallback fuzzy, ma refusi mantenuti.
    .filter((x) =>
      x.punteggio > 0 &&
        rilevanteFallback(termini, [x.negozio.nome, x.negozio.categoria, x.negozio.descrizione])
    )
    .sort((a, b) => b.punteggio - a.punteggio)
    .slice(0, 10)
    .map((x) => x.negozio);
}
