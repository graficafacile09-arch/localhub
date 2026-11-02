import { normalizza, estraiToken } from "../text-utils.ts";
import { terminiSignificativi } from "../search-tollerante.ts";
import { normalizzaQueryCatalogo } from "./understanding.ts";

export type ProdottoIdentificabile = {
  nome?: string | null;
  categoria?: string | null;
  descrizione?: string | null;
  descrizione_completa?: string | null;
  parole_chiave?: string[] | null;
};

function tokenCompatibile(termine: string, token: string[]): boolean {
  if (termine.length < 4) return false;
  const radiceTermine = termine.replace(/[aeiou]+$/i, "");
  if (radiceTermine.length < 4) return false;
  return token.some(
    (t) => t.length >= 4 && t.replace(/[aeiou]+$/i, "") === radiceTermine
  );
}

/**
 * Rimuove dalle descrizioni le formule redazionali che citano il venditore,
 * non il prodotto. Per esempio "nella selezione demo di Mani in Pasta":
 * la parola "pasta" appartiene al nome dell'attività e non deve rendere
 * pertinenti taralli o biscotti a una ricerca di pasta.
 */
function dettagliDescrittivi(prodotto: ProdottoIdentificabile): string {
  return [
    prodotto.descrizione,
    prodotto.descrizione_completa,
    ...(prodotto.parole_chiave ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\b(?:nella\s+)?selezione\s+demo\s+di\s+[^,.!?;]+/gi, " ");
}

/**
 * Il soggetto deve identificare il prodotto tramite nome/categoria oppure
 * tramite una descrizione o parole chiave esplicite del prodotto.
 * Non vengono considerati i dati del negozio: evitare che il nome dell'attività
 * o formule redazionali che lo citano alterino la pertinenza del prodotto.
 */
export function prodottoIdentificatoDaSoggetto(
  prodotto: ProdottoIdentificabile,
  soggetto: string | undefined,
  concetti: string[] = []
): boolean {
  const identita = normalizza([prodotto.nome, prodotto.categoria].filter(Boolean).join(" "));
  const dettagli = normalizza(dettagliDescrittivi(prodotto));
  if (!identita && !dettagli) return false;
  if (!soggetto) return true;

  const corrisponde = (testo: string): boolean => {
    if (!testo) return false;
    const token = estraiToken(testo);
    return soggetto.length < 4
      ? token.includes(soggetto)
      : testo.includes(soggetto) || tokenCompatibile(soggetto, token);
  };

  return corrisponde(identita) || corrisponde(dettagli) ||
    concetti.some((concetto) => {
      const c = normalizza(concetto);
      return Boolean(c) && (identita.includes(c) || dettagli.includes(c));
    });
}

/**
 * Ultima barriera sui prodotti restituiti da Pino: confronta ogni prodotto con
 * il soggetto ricavato dalla FRASE ORIGINALE dell'utente, non con la query
 * eventualmente riscritta dal planner AI. Il soggetto principale deve apparire
 * nel nome/categoria del prodotto; gli eventuali qualificatori possono
 * comparire anche nei dettagli. Così un planner che interpreta male "un gatto",
 * "un cane" o una frase casuale non può trasformare la richiesta in orologi,
 * vino o altri articoli del catalogo.
 */
export function prodottoCorrispondeAllaRichiestaUtente(
  prodotto: ProdottoIdentificabile,
  richiesta: string
): boolean {
  const query = normalizzaQueryCatalogo(richiesta);
  if (!query) return false;

  const termini = terminiSignificativi(query, 10).map(normalizza).filter(Boolean);
  const stopwordBrevi = new Set(["da", "di", "in", "a", "e", "il", "lo", "la", "un", "on", "of", "to"]);
  const brevi = estraiToken(query).filter((t) => t.length === 2 && !stopwordBrevi.has(t));
  const richiesti = Array.from(new Set([...termini, ...brevi]));
  if (richiesti.length === 0) return false;

  const identita = normalizza([prodotto.nome, prodotto.categoria].filter(Boolean).join(" "));
  const primo = richiesti[0];
  const tokenIdentita = estraiToken(identita);
  const soggettoNelNome =
    primo.length < 4
      ? tokenIdentita.includes(primo)
      : identita.includes(primo) || tokenCompatibile(primo, tokenIdentita);
  if (!soggettoNelNome) return false;

  return richiesti.slice(1).every((termine) =>
    prodottoIdentificatoDaSoggetto(prodotto, termine)
  );
}
