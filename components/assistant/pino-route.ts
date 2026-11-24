/**
 * Pino widget — visibilità per rotta.
 *
 * Pino non deve comparire nelle pagine prodotto che mostrano il pulsante
 * «Acquista» né durante il flusso di acquisto: evita che il widget copra i
 * controlli o distragga mentre l'utente sta scegliendo o comprando un prodotto.
 *
 * Rotte escluse:
 *  - /prodotto/<slug>                       (scheda prodotto con «Acquista»)
 *  - /prodotto/<slug>/acquista[/...]        (flusso di acquisto)
 *  - /carrello
 *  - /checkout
 *  - /ordini/conferma/<id>
 *
 * Le altre pagine, inclusa la homepage e lo storico ordini (/ordini),
 * mantengono il comportamento esistente.
 *
 * Le AREE PERSONALI (venditore, cliente, corriere, amministratore) sono
 * escluse a parte, da `isPinoAreaRiservata`: Pino è l'assistente del sito
 * pubblico e non compare nei menù delle aree. Chi ha fatto l'accesso e torna
 * sulle pagine pubbliche (homepage compresa) lo vede normalmente.
 */

const PREFIXI_TRANSIZIONALI = ["/carrello", "/checkout", "/ordini/conferma"] as const;

/** Scheda prodotto: /prodotto/<slug>. */
const RE_DETTAGLIO_PRODOTTO = /^\/prodotto\/[^/]+$/;

/** Percorso di acquisto: /prodotto/<slug>/acquista[/...]. */
const RE_ACQUISTA = /^\/prodotto\/[^/]+\/acquista(?:\/|$)/;

/**
 * `true` quando Pino deve restare nascosto. Accetta pathname null durante
 * l'hydration e ignora query string e slash finale.
 */
export function isPinoTransactionalRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;

  const percorso = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";

  for (const prefisso of PREFIXI_TRANSIZIONALI) {
    if (percorso === prefisso || percorso.startsWith(prefisso + "/")) return true;
  }

  return RE_DETTAGLIO_PRODOTTO.test(percorso) || RE_ACQUISTA.test(percorso);
}

/**
 * Sezioni del sito in cui Pino non deve comparire anche se la pagina è
 * pubblica: la sezione Territorio è una guida redazionale (territori,
 * prodotti tipici, riconoscimenti) e il widget coprirebbe le card e le
 * didascalie delle foto, senza aggiungere nulla all'esperienza. La sezione
 * Notizie è un archivio editoriale: il widget coprirebbe le schede e la
 * lettura, quindi resta fuori anche lì.
 */
const PREFIXI_SEZIONI_NASCOSTE = ["/territorio", "/filiere", "/notizie"] as const;

/** `true` quando la rotta appartiene a una sezione in cui Pino resta nascosto. */
export function isPinoSezioneNascosta(pathname: string | null | undefined): boolean {
  if (!pathname) return false;

  const percorso = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";

  return PREFIXI_SEZIONI_NASCOSTE.some(
    (prefisso) => percorso === prefisso || percorso.startsWith(prefisso + "/")
  );
}

/** Aree personali: nessun Pino nei menù né nelle pagine dell'area. */
const PREFIXI_AREE_RISERVATE = ["/merchant", "/cliente", "/corriere", "/amministratore"] as const;

/**
 * `true` quando la rotta appartiene a un'area personale (venditore, cliente,
 * corriere, amministratore). Indipendente dalla sessione: la homepage e le
 * altre pagine pubbliche restano sempre coperte, anche da loggati.
 */
export function isPinoAreaRiservata(pathname: string | null | undefined): boolean {
  if (!pathname) return false;

  const percorso = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";

  return PREFIXI_AREE_RISERVATE.some(
    (prefisso) => percorso === prefisso || percorso.startsWith(prefisso + "/")
  );
}
