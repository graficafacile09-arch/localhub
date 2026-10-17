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

/** True solo per un intento regalo senza un tipo di prodotto già specificato. */
export function isGenericGiftRequest(query: string): boolean {
  const testo = String(query ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const parlaDiRegalo =
    /\bregal(?:o|i|are|ino|ini|etto|etti)\b|\bidea regalo\b|\bbombonier/i.test(testo);
  const prodottoSpecifico =
    /\b(orologio|scarpe|borsa|telefono|libro|cuffie|smartwatch|anello|collana|bracciale|profumo|portafoglio|cintura|occhiali|giocattolo|videogioco|tablet|computer|auricolari|altoparlante|speaker|cassa bluetooth|gioiello|gioielli|orecchini|anelli|collane|bracciali|orologi|watch|watches|clock|clocks|shoes|handbag|bag|phone|book|headphones|jewelry|ring|necklace|bracelet|perfume|wallet|belt|glasses|toy|toys|earbuds|speaker)\b/i.test(testo);
  return parlaDiRegalo && !prodottoSpecifico;
}
