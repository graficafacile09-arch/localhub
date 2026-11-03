/**
 * Sottotipi di una categoria generica di prodotto.
 *
 * Il catalogo InCittà non ripete la categoria generica nel nome del prodotto:
 * un "Pecorino di Castrovillari" è un formaggio, ma la parola «formaggio» non
 * compare né nel nome né nella categoria («Alimentari»). Questa mappa curata
 * collega la parola generica ai termini con cui i sottotipi sono realmente
 * pubblicati. Viene usata solo per due cose:
 *   - ampliare la query di retrieval dei prodotti (il termine generico resta:
 *     l'espansione aggiunge, non sostituisce);
 *   - riconoscere l'appartenenza alla categoria sui metadati identitari del
 *     prodotto (nome, categoria, parole chiave), mai sulla sola descrizione.
 *
 * Non è un dizionario infinito: i termini sono nomi di alimento reali, non
 * prodotti inventati. Le parole identiche in italiano e inglese ("pasta",
 * "pizza") non vanno inserite qui come chiavi generiche.
 */

export const SOTTOTIPI_PRODOTTO: Record<string, string[]> = {
  formaggio: [
    "formaggi",
    "pecorino",
    "pecorini",
    "caciocavallo",
    "caciotta",
    "ricotta",
    "mozzarella",
    "provola",
    "provolone",
    "parmigiano",
    "grana",
    "canestrato",
    "stracchino",
    "gorgonzola",
    "scamorza",
    "burrata",
    "caprino",
  ],
};
