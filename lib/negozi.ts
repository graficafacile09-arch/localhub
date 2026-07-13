import { supabase } from "./supabase";

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

export async function getProdottiNegozio(negozioId: string) {
  const { data, error } = await supabase
    .from("prodotti")
    .select("*")
    .eq("negozio_id", negozioId);

  console.log("PRODOTTI:", data);
  console.log("ERRORE:", error);

  if (error) {
    return [];
  }

  return data;
}

export async function cercaNegozi(ricerca: string) {
  const { data, error } = await supabase
    .from("negozi")
    .select("*")
    .or(
      `nome.ilike.%${ricerca}%,
      categoria.ilike.%${ricerca}%,
      descrizione.ilike.%${ricerca}%,
      servizi.ilike.%${ricerca}%,
      parole_chiave.ilike.%${ricerca}%`
    );

  if (error) {
    console.log(error);
    return [];
  }

  return data;
}