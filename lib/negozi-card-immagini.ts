type NegozioCardImmagineInput = {
  logo_url?: string | null;
  immagine?: string | null; // backward compat
  categoria?: string | null;
};

const pexelsImage = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1200&h=675&dpr=2`;

const placeholderFiles = new Set([
  "auto.png",
  "auto.svg",
  "beauty.png",
  "beauty.svg",
  "bimbi.png",
  "bimbi.svg",
  "casa.png",
  "casa.svg",
  "elettronica.png",
  "elettronica.svg",
  "fashion.png",
  "pet.png",
  "pet.svg",
  "salute.png",
  "salute.svg",
  "sport.png",
  "sport.svg",
  "tech.png",
]);

const immaginiPerCategoria: { match: string[]; url: string }[] = [
  {
    match: ["panificio", "bakery", "forno", "pane", "pasticceria", "panetteria"],
    url: pexelsImage(2147491),
  },
  {
    match: ["alimentari", "supermercato", "grocery", "market"],
    url: pexelsImage(10907746),
  },
  {
    match: ["ristorante", "trattoria", "osteria", "restaurant"],
    url: pexelsImage(30754469),
  },
  {
    match: ["pizzeria", "pizza"],
    url: pexelsImage(29807154),
  },
  {
    match: ["bar", "caffetteria", "cafe", "coffee"],
    url: pexelsImage(19748170),
  },
  {
    match: ["gelateria", "gelato", "ice cream"],
    url: pexelsImage(36583362),
  },
  {
    match: ["abbigliamento", "boutique", "moda", "fashion", "clothing"],
    url: pexelsImage(15306470),
  },
  {
    match: ["calzature", "scarpe", "shoe", "footwear", "sneakers"],
    url: pexelsImage(37052027),
  },
  {
    match: ["gioielleria", "gioielli", "jewel", "jewelry", "oro"],
    url: pexelsImage(29043373),
  },
  {
    match: ["ottica", "occhiali", "eyewear", "optical", "optomet"],
    url: pexelsImage(5201991),
  },
  {
    match: ["libreria", "libri", "bookstore", "bookshop", "books"],
    url: pexelsImage(18176581),
  },
  {
    match: ["ferramenta", "utensili", "hardware", "bricolage", "fai da te"],
    url: pexelsImage(19756443),
  },
  {
    match: ["farmacia", "parafarmacia", "salute", "pharmacy"],
    url: pexelsImage(8657365),
  },
  {
    match: ["parrucchiere", "barber", "hair", "salone"],
    url: pexelsImage(853427),
  },
  {
    match: ["estetista", "beauty", "skincare", "make-up", "makeup", "benessere"],
    url: pexelsImage(7750099),
  },
  {
    match: ["palestra", "fitness", "gym", "sport", "training"],
    url: pexelsImage(8933584),
  },
  {
    match: ["elettronica", "tech", "tecnologia", "telefonia", "computer", "tablet", "smartphone"],
    url: pexelsImage(25809260),
  },
  {
    match: ["arredamento", "mobili", "furniture", "showroom", "casa", "interior"],
    url: pexelsImage(5486110),
  },
  {
    match: ["fiori", "fioraio", "florist", "flower"],
    url: pexelsImage(32939456),
  },
  {
    match: ["animali", "pet", "pet shop", "veterinario", "toelettatura"],
    url: pexelsImage(12064408),
  },
  {
    match: ["auto", "concessionaria", "officina", "carrozzeria", "gomme", "meccanico"],
    url: pexelsImage(29566871),
  },
  {
    match: ["bimbi", "bambini", "giocattoli", "toys", "infanzia"],
    url: pexelsImage(29790215),
  },
];

const fallbackUrl = pexelsImage(33407840);

function isCustomImage(immagine?: string | null) {
  if (!immagine) {
    return false;
  }

  const value = immagine.trim();

  if (!value) {
    return false;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return true;
  }

  const normalized = value.split("/").pop()?.toLowerCase() ?? value.toLowerCase();

  if (placeholderFiles.has(normalized) || normalized.endsWith(".svg")) {
    return false;
  }

  return true;
}

function normalizeCustomImage(immagine: string) {
  if (immagine.startsWith("http://") || immagine.startsWith("https://") || immagine.startsWith("/")) {
    return immagine;
  }

  return `/negozi/${immagine}`;
}

export function getNegozioCardImmagine({ logo_url, immagine, categoria }: NegozioCardImmagineInput) {
  immagine = logo_url ?? immagine;
  if (isCustomImage(immagine)) {
    return normalizeCustomImage(immagine!.trim());
  }

  const categoriaNorm = (categoria ?? "").trim().toLowerCase();

  const match = immaginiPerCategoria.find((item) =>
    item.match.some((termine) => categoriaNorm.includes(termine))
  );

  return match?.url ?? fallbackUrl;
}
