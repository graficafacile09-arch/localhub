import { cercaNegoziDemo, espandiQueryConSinonimi } from "./negozi-demo";
import { calcolaPunteggioNegozio, filtraNegoziPerPertinenza } from "./ranking-negozi";
import { supabase } from "./supabase";

// ─── Negozi ──────────────────────────────────────────────────────────────────

export async function getNegozi() {
  const { data, error } = await supabase
    .from("negozi")
    .select("*")
    .eq("attivo", true);

  if (error) {
    console.log(error);
    return [];
  }

  return data;
}

export async function getNegozio(id: string) {
  const { data, error } = await supabase
    .from("negozi")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.log(error);
    return null;
  }

  return data;
}

export async function getNegoziInEvidenza(limit = 6) {
  const { data, error } = await supabase
    .from("negozi")
    .select("*")
    .eq("attivo", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return data ?? [];
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
  const { data, error } = await supabase
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
  const { data, error } = await supabase
    .from("prodotti")
    .select("*, negozi!inner(nome)")
    .eq("attivo", true)
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
  const { data, error } = await supabase
    .from("prodotti")
    .select("*, negozi!inner(nome)")
    .eq("attivo", true)
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
      ];
    })
    .join(",");

  const { data, error } = await supabase
    .from("prodotti")
    .select("*, negozi!inner(id, nome)")
    .eq("attivo", true)
    .or(filtri)
    .limit(limit);

  if (error) return [];

  return (data ?? []).map((p: Record<string, unknown>) => ({
    id: p.id as string,
    negozio_id: p.negozio_id as string,
    nome: p.nome as string,
    descrizione: (p.descrizione as string) ?? null,
    categoria: (p.categoria as string) ?? null,
    prezzo: p.prezzo as number,
    immagine_principale: (p.immagine_principale as string) ?? null,
    negozio_nome: (p.negozi as { nome: string })?.nome ?? "",
  }));
}

// ─── Ricerca negozi ──────────────────────────────────────────────────────────

export async function cercaNegozi(ricerca: string) {
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

      if (!pulito) {
        return [];
      }

      return [
        `nome.ilike.%${pulito}%`,
        `categoria.ilike.%${pulito}%`,
        `descrizione.ilike.%${pulito}%`,
        `servizi.ilike.%${pulito}%`,
        `parole_chiave.ilike.%${pulito}%`,
      ];
    })
    .join(",");

  const { data, error } = await supabase
    .from("negozi")
    .select("*")
    .or(filtriRicerca);

  const negoziDemo = cercaNegoziDemo(ricerca);

  if (error) {
    console.log(error);
    return negoziDemo;
  }

  const unici = new Map<string, typeof negoziDemo[number] | (typeof data)[number]>();

  [...negoziDemo, ...(data ?? [])].forEach((negozio) => {
    if (!unici.has(negozio.id)) {
      unici.set(negozio.id, negozio);
    }
  });

  return filtraNegoziPerPertinenza(
    Array.from(unici.values()).filter(
      (negozio) => calcolaPunteggioNegozio(negozio, espandiQueryConSinonimi(ricerca)) > 0
    ),
    espandiQueryConSinonimi(ricerca)
  );
}
