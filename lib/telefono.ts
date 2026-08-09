/**
 * Normalizzazione dei numeri di telefono per WhatsApp.
 *
 * Funzione condivisa estratta dal pattern già usato nel progetto per i
 * link wa.me (app/negozio, app/prodotto, ShopResultCard): rimuove spazi,
 * trattini, parentesi, punti e il "+" iniziale, poi garantisce il prefisso
 * internazionale italiano (39) per il formato E.164 senza "+".
 *
 * Esempio: "+39 333 123 4567" → "393331234567" · "333 1234567" → "393331234567"
 */
export function normalizzaNumeroWhatsApp(raw: string | null | undefined): string {
  const cifre = (raw ?? "").replace(/[\s\-().+]/g, "");
  if (!cifre) return "";
  return cifre.startsWith("39") ? cifre : `39${cifre}`;
}
