/**
 * Pino widget — visibilità per rotta.
 *
 * Nei flussi transazionali Pino non deve comparire: carrello, checkout (con il
 * suo step di pagamento) e conferma ordine. Sono rotte in cui l'utente sta
 * finalizzando un acquisto: un widget flottante che copre i pulsanti o che
 * invita a chattare distrae e ostacola il completamento del pagamento.
 *
 * La lista è volutamente ESPLICITA e ancorata alle rotte reali del progetto:
 *  - /carrello
 *  - /checkout
 *  - /prodotto/<slug>/acquista            (scelta ritiro/spedizione)
 *  - /prodotto/<slug>/acquista/ritiro      (checkout + pagamento)
 *  - /prodotto/<slug>/acquista/spedizione  (checkout + pagamento)
 *  - /ordini/conferma/<id>                 (conferma ordine, e /recesso)
 *
 * Non è un elenco "tutto ciò che contiene ordine/acquisto": le aree
 * amministratore/merchant e lo storico ordini (/ordini) restano invariate.
 */

/** Prefissi di rotta in cui Pino resta nascosto. */
const PREFIXI_TRANSIZIONALI = ["/carrello", "/checkout", "/ordini/conferma"] as const;

/** Percorso di acquisto immediato: /prodotto/<slug>/acquista[/...]. */
const RE_ACQUISTA = /^\/prodotto\/[^/]+\/acquista(?:\/|$)/;

/**
 * `true` quando la rotta corrente appartiene a un flusso transazionale e Pino
 * deve restare nascosto. Accetta anche pathname `null` (prima hydration) e
 * ignora query string e slash finale, così "/carrello/" combacia con "/carrello".
 */
export function isPinoTransactionalRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;

  const percorso = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";

  for (const prefisso of PREFIXI_TRANSIZIONALI) {
    if (percorso === prefisso || percorso.startsWith(`${prefisso}/`)) return true;
  }

  return RE_ACQUISTA.test(percorso);
}
