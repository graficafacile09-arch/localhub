/**
 * Disponibilità reale dei prodotti (Fase D — operatività catalogo).
 *
 * La disponibilità effettiva considera anche la riserva di stock legata a
 * pagamenti/ordini pending (prodotti.quantita_riservata, default 0):
 *
 *   disponibile_reale = quantita_disponibile - quantita_riservata
 *
 * Regola per il NULL: se quantita_disponibile è NULL il prodotto non ha
 * quantità tracciata e viene considerato disponibile (mai "esaurito"),
 * coerente con il resto del catalogo.
 */

export function disponibilitaReale(
  quantitaDisponibile: number | null | undefined,
  quantitaRiservata: number | null | undefined
): number | null {
  if (quantitaDisponibile == null) return null;
  return quantitaDisponibile - (quantitaRiservata ?? 0);
}

export function prodottoEsaurito(
  quantitaDisponibile: number | null | undefined,
  quantitaRiservata: number | null | undefined
): boolean {
  const reale = disponibilitaReale(quantitaDisponibile, quantitaRiservata);
  if (reale === null) return false;
  return reale <= 0;
}
