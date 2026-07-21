import { cercaNegoziDemo, espandiQueryConSinonimi } from "./negozi-demo";
import { calcolaPunteggioNegozio, filtraNegoziPerPertinenza } from "./ranking-negozi";
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