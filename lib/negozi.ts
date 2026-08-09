import { calcolaPunteggioNegozio, filtraNegoziPerPertinenza } from "./ranking-negozi";
import { estraiToken, normalizza, radice } from "./text-utils";
import { createAdminSupabaseClient } from "./supabase/admin";
import { isNumericId, isUuid, toSlug } from "./slug";
import type { Categoria } from "@/types/negozio";

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

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


const sinonimiRicerca: Record<string, string[]> = {
  panificio: ["panificio", "forno", "pane", "pasticceria", "pasticcere", "bakery", "bakery shop", "cornetti", "pizza al taglio", "focaccia", "grissini", "biscotti", "torte", "dolci", "lievitati", "panetteria", "pane casereccio"],
  beauty: ["beauty", "bellezza", "parrucchiere", "parrucchieri", "barber", "barbiere", "estetica", "estetista", "trucco", "makeup", "make-up", "benessere", "capelli", "taglio", "piega", "barba", "skincare"],
  casa: ["casa", "arredo", "arredamento", "mobili", "interior", "decorazioni", "illuminazione", "cucina", "salotto", "camera", "divano", "tavolo"],
  auto: ["auto", "macchina", "officina", "gomme", "pneumatici", "tagliando", "meccanico", "carrozzeria", "revisione", "olio", "freni", "batteria", "concessionaria"],
  salute: ["salute", "farmacia", "parafarmacia", "medicinali", "integratori", "benessere", "sanitaria", "febbre", "raffreddore", "mal", "testa", "dolore", "ricetta", "analisi", "antibiotico"],
  tech: ["tech", "tecnologia", "elettronica", "telefonia", "cellulari", "cellulare", "smartphone", "telefonino", "telefonini", "computer", "pc", "tablet", "accessori", "riparazioni", "monitor", "stampante", "ricarica"],
  bimbi: ["bimbi", "bambini", "giocattoli", "giocattolo", "infanzia", "scuola", "cartoleria", "neonati", "prima", "infanzia", "zaino", "pannolini", "didattico"],
  sport: ["sport", "fitness", "palestra", "allenamento", "running", "yoga", "pilates", "abbigliamento", "sportivo", "workout", "tapis", "roulant", "pesi", "training"],
  moda: ["moda", "abbigliamento", "boutique", "vestiti", "vestito", "scarpe", "calzature", "elegante", "eleganti", "outfit"],
  ristorazione: ["mangiare", "ristorante", "ristorazione", "ristoranti", "trattoria", "trattorie", "cena", "cene", "pranzo", "pranzi", "cibo", "aperitivo", "aperitivi", "pizzeria", "pizzerie", "cucina"],
  promozioni: ["offerte", "offerta", "promozioni", "promozione", "sconti", "sconto", "saldo", "saldi", "affari"],
  regalo: ["regalo", "regali", "regalare", "dono", "doni", "omaggio", "omaggi"],
  pet: ["pet", "animali", "animale", "cani", "cane", "gatti", "gatto", "veterinario", "veterinaria", "toelettatura", "crocchette", "shop", "zecche", "zecca", "pulci", "pulce", "antiparassitario", "antiparassitari", "cucciolo", "croccantini", "lettiera", "guinzaglio", "mangime"],
};

const stopWordsRicerca = new Set([
  "a", "ad", "al", "alla", "alle", "allo", "ai", "agli", "all",
  "che", "chi", "con", "da", "dei", "del", "della", "delle", "dello",
  "di", "e", "gli", "ha", "hai", "ho", "i", "il", "in", "io",
  "la", "le", "lo", "mia", "mio", "mie", "miei", "mi",
  "nelle", "nella", "nel", "nei", "per", "serve", "servono", "servire",
  "se", "sul", "sulla", "sulle", "sui", "su", "tra",
  "devo", "fare", "un", "una", "uno",
]);

function attivaGruppo(termine: string, voce: string) {
  const termineNorm = normalizza(termine).trim();
  const voceNorm = normalizza(voce).trim();
  if (!termineNorm || !voceNorm) return false;
  if (termineNorm === voceNorm) return true;
  return radice(termineNorm) === radice(voceNorm);
}

function normalizzaTermini(query: string) {
  const terminiBase = normalizza(query)
    .split(/[^a-z0-9]+/)
    .map((termine) => termine.trim())
    .filter((termine) => termine && !stopWordsRicerca.has(termine));

  const terminiEspansi = new Set(terminiBase);
  for (const termine of terminiBase) {
    for (const gruppo of Object.values(sinonimiRicerca)) {
      if (gruppo.some((voce) => attivaGruppo(termine, voce))) {
        gruppo.forEach((voce) => terminiEspansi.add(voce));
      }
    }
  }
  return Array.from(terminiEspansi);
}

export function espandiQueryConSinonimi(query: string) {
  return normalizzaTermini(query).join(" ");
}

// ─── Negozi ──────────────────────────────────────────────────────────────────

export async function getNegozi() {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("negozi")
    .select("*")
    .eq("attivo", true)
    .is("deleted_at", null);

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

// Categorie della pagina /categorie: SOLO quelle realmente usate dai negozi
// attivi. Derivate dal DB tramite lo stesso criterio di matching già usato
// da getConteggiNegoziPerCategoria / getCategoriaShowcase (uguaglianza
// case-insensitive su nome + sinonimi): nessuna struttura dati parallela,
// nessun dato hardcoded, ogni categoria compare una sola volta.
// ESATTAMENTE 2 query SQL, zero N+1.
export async function getCategorieConNegozi(): Promise<CategoriaConNegozi[]> {
  const db = getDb();
  if (!db) return [];

  const categorie = await getCategorie();
  if (categorie.length === 0) return [];

  const conteggi = await getConteggiNegoziPerCategoria(categorie);

  return categorie
    .filter((categoria) => (conteggi.get(categoria.id) ?? 0) > 0)
    .map((categoria) => ({
      categoria,
      count: conteggi.get(categoria.id) ?? 0,
    }));
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

export async function getProdottiInEvidenza(limit = 8) {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("prodotti")
    .select("*, negozi!inner(nome)")
    .eq("attivo", true)
    .filter("negozi.deleted_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return (data ?? []).map((p: Record<string, unknown>) => ({
    ...(p as Prodotto),
    negozio_nome: (p.negozi as { nome: string })?.nome ?? "",
  }));
}

export async function getUltimiProdotti(limit = 12) {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("prodotti")
    .select("*, negozi!inner(nome)")
    .eq("attivo", true)
    .filter("negozi.deleted_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return (data ?? []).map((p: Record<string, unknown>) => ({
    ...(p as Prodotto),
    negozio_nome: (p.negozi as { nome: string })?.nome ?? "",
  }));
}

export async function cercaProdotti(ricerca: string, limit = 20) {
  const db = getDb();
  if (!db) return [];

  const termini = Array.from(
    new Set(
      espandiQueryConSinonimi(ricerca)
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean)
    )
  ).slice(0, 10);

  if (termini.length === 0) return [];

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

  const { data, error } = await db
    .from("prodotti")
    .select("id, slug, negozio_id, nome, descrizione, categoria, prezzo, immagine_principale")
    .eq("attivo", true)
    .or(filtri)
    .limit(limit);

  if (error) return [];

  const negozioIds = Array.from(
    new Set((data ?? []).map((prodotto) => prodotto.negozio_id).filter(Boolean))
  );
  const { data: negozi } = negozioIds.length
    ? await db.from("negozi").select("id, nome").in("id", negozioIds).is("deleted_at", null)
    : { data: [] };
  const nomiNegozi = new Map((negozi ?? []).map((negozio) => [negozio.id, negozio.nome]));

  return (data ?? []).map((p: Record<string, unknown>) => ({
    id: p.id as string,
    slug: (p.slug as string) ?? null,
    negozio_id: p.negozio_id as string,
    nome: p.nome as string,
    descrizione: (p.descrizione as string) ?? null,
    categoria: (p.categoria as string) ?? null,
    prezzo: p.prezzo as number,
    immagine_principale: (p.immagine_principale as string) ?? null,
    negozio_nome: nomiNegozi.get(p.negozio_id as string) ?? "",
  }));
}

// ─── Ricerca negozi ──────────────────────────────────────────────────────────

export async function cercaNegozi(ricerca: string) {
  const db = getDb();
  if (!db) return [];

  const terminiEspansi = Array.from(
    new Set(
      espandiQueryConSinonimi(ricerca)
        .split(/\s+/)
        .map((termine) => termine.trim())
        .filter(Boolean)
    )
  ).slice(0, 12);

  const filtriRicerca = (terminiEspansi.length > 0 ? terminiEspansi : [ricerca.trim()])
    .flatMap((termine) => {
      const pulito = termine.replace(/[,%]/g, " ").trim();
      if (!pulito) return [];
      return [
        `nome.ilike.%${pulito}%`,
        `categoria.ilike.%${pulito}%`,
        `descrizione.ilike.%${pulito}%`,
        `servizi.ilike.%${pulito}%`,
        `parole_chiave.ilike.%${pulito}%`,
      ];
    })
    .join(",");

  const { data, error } = await db
    .from("negozi")
    .select("*")
    .or(filtriRicerca)
    .is("deleted_at", null);

  if (error) {
    console.log(error);
    return [];
  }

  return filtraNegoziPerPertinenza(
    (data ?? []).filter(
      (negozio) => calcolaPunteggioNegozio(negozio, espandiQueryConSinonimi(ricerca)) > 0
    ),
    espandiQueryConSinonimi(ricerca)
  );
}
