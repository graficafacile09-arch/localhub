import { calcolaPunteggioNegozio, filtraNegoziPerPertinenza } from "./ranking-negozi";
import { normalizza, radice } from "./text-utils";
import { createAdminSupabaseClient } from "./supabase/admin";

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

const sinonimiRicerca: Record<string, string[]> = {
  panificio: ["panificio", "forno", "pane", "pasticceria", "pasticcere", "bakery", "bakery shop", "cornetti", "pizza al taglio", "focaccia", "grissini", "biscotti", "torte", "dolci", "lievitati", "panetteria", "pane casereccio"],
  beauty: ["beauty", "bellezza", "parrucchiere", "parrucchieri", "barber", "barbiere", "estetica", "estetista", "trucco", "makeup", "make-up", "benessere", "capelli", "taglio", "piega", "barba", "skincare"],
  casa: ["casa", "arredo", "arredamento", "mobili", "interior", "decorazioni", "illuminazione", "cucina", "salotto", "camera", "divano", "tavolo"],
  auto: ["auto", "macchina", "officina", "gomme", "pneumatici", "tagliando", "meccanico", "carrozzeria", "revisione", "olio", "freni", "batteria", "concessionaria"],
  salute: ["salute", "farmacia", "parafarmacia", "medicinali", "integratori", "benessere", "sanitaria", "febbre", "raffreddore", "mal", "testa", "dolore", "ricetta", "analisi", "antibiotico"],
  tech: ["tech", "tecnologia", "elettronica", "telefonia", "cellulari", "cellulare", "smartphone", "computer", "pc", "tablet", "accessori", "riparazioni", "monitor", "stampante", "ricarica"],
  bimbi: ["bimbi", "bambini", "giocattoli", "giocattolo", "infanzia", "scuola", "cartoleria", "neonati", "prima", "infanzia", "zaino", "pannolini", "didattico"],
  sport: ["sport", "fitness", "palestra", "allenamento", "running", "yoga", "pilates", "abbigliamento", "sportivo", "workout", "tapis", "roulant", "pesi", "training"],
  moda: ["moda", "abbigliamento", "boutique", "vestiti", "vestito", "scarpe", "calzature", "elegante", "eleganti", "outfit"],
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

export async function getNegoziInEvidenza(limit = 6) {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("negozi")
    .select("*")
    .eq("attivo", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return data ?? [];
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
    .select("id, negozio_id, nome, descrizione, categoria, prezzo, immagine_principale")
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
