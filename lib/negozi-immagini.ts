type NegozioImmagineInput = {
  immagine?: string | null;
  categoria?: string | null;
};

const fallbackPerCategoria: { match: string[]; file: string }[] = [
  { match: ["panificio", "forno", "bakery", "food", "ristorante", "bar", "pizzeria"], file: "panificio.png" },
  { match: ["moda", "fashion", "boutique", "abbigliamento"], file: "fashion.png" },
  { match: ["tech", "elettronica", "telefonia", "computer"], file: "elettronica.svg" },
  { match: ["beauty", "benessere", "parrucchiere", "barber", "estetica"], file: "beauty.svg" },
  { match: ["casa", "arredo", "arredamento", "decorazioni"], file: "casa.svg" },
  { match: ["auto", "officina", "gomme", "carrozzeria"], file: "auto.svg" },
  { match: ["salute", "farmacia", "parafarmacia", "medico"], file: "salute.svg" },
  { match: ["bimbi", "giocattoli", "infanzia", "scuola"], file: "bimbi.svg" },
  { match: ["sport", "fitness", "palestra", "yoga"], file: "sport.svg" },
  { match: ["pet", "animali", "veterinario", "toelettatura"], file: "pet.svg" },
  { match: ["servizi"], file: "tech.png" },
];

export function getImmagineNegozio({ immagine, categoria }: NegozioImmagineInput) {
  if (immagine && immagine.trim()) {
    return `/negozi/${immagine}`;
  }

  const categoriaNorm = (categoria ?? "").trim().toLowerCase();

  const fallback = fallbackPerCategoria.find((item) =>
    item.match.some((termine) => categoriaNorm.includes(termine))
  );

  return `/negozi/${fallback?.file ?? "tech.png"}`;
}
