type ProdottoImmagineInput = {
  immagine_principale?: string | null;
  categoria?: string | null;
};

const pexelsProduct = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600&dpr=2`;

const placeholderFiles = new Set([
  "auto.png", "auto.svg", "beauty.png", "beauty.svg", "bimbi.png", "bimbi.svg",
  "casa.png", "casa.svg", "elettronica.svg", "pet.png", "pet.svg", "salute.png",
  "salute.svg", "sport.png", "sport.svg", "tech.png",
]);

const immaginiPerCategoria: { match: string[]; url: string }[] = [
  { match: ["arredamento", "mobili", "divano", "tavolo", "sedia", "casa"], url: pexelsProduct(5486110) },
  { match: ["illuminazione", "lampada", "lampade", "luci"], url: pexelsProduct(11158041) },
  { match: ["abbigliamento", "moda", "vestiti", "boutique", "fashion"], url: pexelsProduct(15306470) },
  { match: ["calzature", "scarpe", "sneakers"], url: pexelsProduct(37052027) },
  { match: ["skincare", "beauty", "make-up", "trucco", "viso"], url: pexelsProduct(7750099) },
  { match: ["capelli", "parrucchiere", "barber", "taglio"], url: pexelsProduct(853427) },
  { match: ["smartphone", "cellulare", "telefonia", "phone"], url: pexelsProduct(25809260) },
  { match: ["computer", "pc", "laptop", "tablet"], url: pexelsProduct(18176581) },
  { match: ["palestra", "fitness", "allenamento", "yoga"], url: pexelsProduct(8933584) },
  { match: ["sportivo", "running", "corsa", "training"], url: pexelsProduct(8933584) },
  { match: ["alimentazione", "cibo", "cucina", "ristorante"], url: pexelsProduct(10907746) },
  { match: ["farmacia", "salute", "medicinale", "integratori"], url: pexelsProduct(8657365) },
  { match: ["animali", "cane", "gatto", "pet", "toelettatura"], url: pexelsProduct(12064408) },
  { match: ["auto", "officina", "meccanico", "pneumatici"], url: pexelsProduct(29566871) },
  { match: ["bambini", "giocattolo", "infanzia", "scuola"], url: pexelsProduct(29790215) },
  { match: ["gioielli", "orologio", "accessori"], url: pexelsProduct(29043373) },
  { match: ["libri", "cartoleria", "fogli"], url: pexelsProduct(18176581) },
  { match: ["ferramenta", "utensili", "bricolage"], url: pexelsProduct(19756443) },
  { match: ["fiori", "piante", "giardino"], url: pexelsProduct(32939456) },
];

const fallbackUrl = pexelsProduct(18176581);

function isCustomImage(immagine?: string | null): boolean {
  if (!immagine) return false;
  const value = immagine.trim();
  if (!value) return false;
  if (value.startsWith("http://") || value.startsWith("https://")) return true;
  const normalized = value.split("/").pop()?.toLowerCase() ?? value.toLowerCase();
  if (placeholderFiles.has(normalized) || normalized.endsWith(".svg")) return false;
  return true;
}

function normalizeCustomImage(immagine: string): string {
  if (immagine.startsWith("http://") || immagine.startsWith("https://") || immagine.startsWith("/")) {
    return immagine;
  }
  return `/negozi/${immagine}`;
}

export function getProdottoImmagine({ immagine_principale, categoria }: ProdottoImmagineInput): string {
  if (isCustomImage(immagine_principale)) {
    return normalizeCustomImage(immagine_principale!.trim());
  }

  const categoriaNorm = (categoria ?? "").trim().toLowerCase();
  const match = immaginiPerCategoria.find((item) =>
    item.match.some((t) => categoriaNorm.includes(t))
  );

  return match?.url ?? fallbackUrl;
}
