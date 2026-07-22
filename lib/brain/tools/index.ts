/**
 * LocalHub Brain — Tools
 *
 * Strumenti (tools/functions) che i modelli LLM possono invocare
 * tramite function calling per eseguire azioni concrete.
 *
 * I tools permettono all'AI di andare oltre la generazione di testo:
 * può interrogare il database, recuperare prezzi aggiornati,
 * verificare la disponibilità dei prodotti, controllare gli orari.
 *
 * Tools pianificati:
 * - searchNegozi       → cerca negozi nel DB con parametri strutturati
 * - getProductDetails  → recupera dettagli prodotto per ID
 * - checkStoreHours    → verifica se un negozio è aperto adesso
 * - getActiveOffers    → recupera offerte attive per categoria/zona
 * - getNearbyStores    → trova negozi per prossimità geografica
 *
 * Ogni tool è una funzione pura con input/output tipizzati.
 * I tool non modificano dati: sono tutti in sola lettura.
 *
 * Implementazione prevista nei task successivi.
 *
 * @module lib/brain/tools
 */

// Placeholder: le esportazioni verranno aggiunte nei task successivi
