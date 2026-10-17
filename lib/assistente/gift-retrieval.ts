/**
 * Ricerca locale di idee regalo per Pino.
 *
 * Espansione deterministica e senza servizi esterni: una richiesta generica
 * ("un regalo per mia moglie") non è una keyword di catalogo, quindi interroga
 * più categorie di prodotti reali e lascia a searchProducts i suoi gate di
 * pertinenza, prezzi e disponibilità.
 */
export const CATEGORIE_REGALO = [
  "orologio",
  "anello",
  "gioielli",
  "orecchini",
  "collana",
  "bracciale",
  "borsa",
  "portafoglio",
  "profumo",
  "libro",
  "cuffie",
  "accessorio",
] as const;

/**
 * Verifica che un prodotto recuperato dal fan-out appartenga davvero alla
 * categoria interrogata: evita falsi positivi come un libro di cucina tra gli orologi.
 */
export function prodottoCorrispondeCategoriaRegalo(
  prodotto: { nome?: unknown; descrizione?: unknown; categoria?: unknown },
  categoria: string
): boolean {
  const testo = [prodotto.nome, prodotto.descrizione, prodotto.categoria]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const sinonimi: Record<string, string[]> = {
    orologio: ["orologio", "orologi", "watch", "watches"],
    anello: ["anello", "anelli", "ring", "rings"],
    gioielli: ["gioiello", "gioielli", "jewelry", "jewellery"],
    orecchini: ["orecchino", "orecchini", "earring", "earrings"],
    collana: ["collana", "collane", "necklace", "necklaces"],
    bracciale: ["bracciale", "bracciali", "bracelet", "bracelets"],
    borsa: ["borsa", "borse", "bag", "bags", "handbag"],
    portafoglio: ["portafoglio", "portafogli", "wallet", "wallets"],
    profumo: ["profumo", "profumi", "perfume", "fragrance"],
    libro: ["libro", "libri", "book", "books"],
    cuffie: ["cuffia", "cuffie", "headphone", "headphones", "earbuds"],
    accessorio: ["accessorio", "accessori", "accessory", "accessories"],
  };
  const termini = sinonimi[categoria.toLowerCase()] ?? [categoria.toLowerCase()];
  return termini.some((termine) => testo.includes(termine));
}

/** True solo per un intento regalo senza un tipo di prodotto già specificato. */
export function isGenericGiftRequest(query: string): boolean {
  const testo = String(query ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const parlaDiRegalo =
    /\bregal(?:o|i|are|ino|ini|etto|etti)\b|\bidea regalo\b|\bbombonier|\bgifts?\b|\bpresents?\b|\bgift ideas?\b/i.test(testo);
  const prodottoSpecifico =
    /\b(orologio|scarpe|borsa|telefono|libro|cuffie|smartwatch|anello|collana|bracciale|profumo|portafoglio|cintura|occhiali|giocattolo|videogioco|tablet|computer|auricolari|altoparlante|speaker|cassa bluetooth|gioiello|gioielli|orecchini|anelli|collane|bracciali|orologi|watch|watches|clock|clocks|shoes|handbag|bag|phone|book|headphones|jewelry|ring|necklace|bracelet|perfume|wallet|belt|glasses|toy|toys|earbuds|speaker)\b/i.test(testo);
  return parlaDiRegalo && !prodottoSpecifico;
}
