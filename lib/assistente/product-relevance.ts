import { normalizza, estraiToken } from "../text-utils.ts";
// Estensione esplicita: questo modulo è caricato anche dalla suite node
// (`node --experimental-strip-types --test`), che non risolve gli alias.
import { refusoPlausibile } from "./understanding.ts";

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
 * Metadati che IDENTIFICANO il prodotto: nome e categoria. Le parole chiave
 * sono un contributo, non un'identità autosufficiente (vedi
 * `paroleChiaveProdotto`).
 */
function identitaProdotto(prodotto: ProdottoIdentificabile): string {
  return normalizza([prodotto.nome, prodotto.categoria].filter(Boolean).join(" "));
}

/** Parole chiave dichiarate dal venditore, normalizzate. */
function paroleChiaveProdotto(prodotto: ProdottoIdentificabile): string[] {
  return (prodotto.parole_chiave ?? [])
    .map((chiave) => normalizza(String(chiave ?? "")))
    .filter(Boolean);
}

/**
 * Contesto discorsivo del prodotto (descrizioni libere). Non dimostra da solo
 * l'identità: "Filetti di cipolla" descritti come "conservati sott'olio" non
 * sono un prodotto che si chiama olio.
 *
 * Rimuove anche le formule redazionali che citano il venditore, non il
 * prodotto ("nella selezione demo di Mani in Pasta").
 */
function dettagliDescrittivi(prodotto: ProdottoIdentificabile): string {
  return [prodotto.descrizione, prodotto.descrizione_completa]
    .filter(Boolean)
    .join(" ")
    .replace(/\b(?:nella\s+)?selezione\s+demo\s+di\s+[^,.!?;]+/gi, " ");
}

/**
 * Il soggetto identifica il prodotto tramite nome/categoria. Le parole chiave
 * del venditore NON bastano da sole e nemmeno una descrizione che le citi di
 * passaggio ("con olio", "per uso alimentare"): serve un segnale di
 * classificazione vero, cioè o una parola chiave FRASE che contiene il soggetto
 * ("pasta calabrese") o una descrizione che NOMINA il soggetto in apertura
 * ("Pasta tradizionale calabrese…"). La descrizione resta contesto, non
 * identità (D1).
 * Non vengono considerati i dati del negozio: evitare che il nome dell'attività
 * o formule redazionali che lo citano alterino la pertinenza del prodotto.
 */
export function prodottoIdentificatoDaSoggetto(
  prodotto: ProdottoIdentificabile,
  soggetto: string | undefined,
  concetti: string[] = []
): boolean {
  const identita = identitaProdotto(prodotto);
  const dettagli = normalizza(dettagliDescrittivi(prodotto));
  const chiavi = paroleChiaveProdotto(prodotto);
  if (!identita && !dettagli && chiavi.length === 0) return false;
  if (!soggetto) return true;

  const corrisponde = (testo: string): boolean => {
    if (!testo) return false;
    const token = estraiToken(testo);
    return soggetto.length < 4
      ? token.includes(soggetto)
      : testo.includes(soggetto) || tokenCompatibile(soggetto, token);
  };

  // Parola chiave + descrizione concorde: la keyword non è autosufficiente.
  // Il contributo è ammesso solo se il soggetto è dichiarato come categoria
  // (keyword-frase del venditore) o se la descrizione lo nomina in apertura:
  // "Biscotti … con olio" non diventano olio, "Pasta tradizionale" sì.
  const chiaveConfermata = chiavi.some((chiave) => corrisponde(chiave));
  const keywordClassificante = chiavi.some(
    (chiave) => chiave.includes(" ") && corrisponde(chiave)
  );
  const descrizioneNomina =
    corrisponde(dettagli) &&
    (dettagli.startsWith(soggetto) ||
      estraiToken(dettagli).slice(0, 2).some((t) => corrisponde(t)));
  const confermataDalleDescrizioni =
    chiaveConfermata && (keywordClassificante || descrizioneNomina);

  return corrisponde(identita) || confermataDalleDescrizioni ||
    concetti.some((concetto) => {
      const c = normalizza(concetto);
      return Boolean(c) && (identita.includes(c) || dettagli.includes(c));
    });
}

/**
 * Varianti di numero ottenute cambiando solo la vocale finale (cane → cani,
 * gatto → gatti). Servono alle parole corte, dove la radice di prodotto non
 * basta a riconoscere il plurale.
 */
export function variantiNumero(termine: string): string[] {
  if (termine.length < 4 || !/^[a-z]+$/.test(termine)) return [];
  const base = termine.slice(0, -1);
  return ["a", "e", "i", "o"]
    .map((vocale) => base + vocale)
    .filter((variante) => variante !== termine);
}

/**
 * Stessa famiglia lessicale: almeno 5 caratteri di prefisso in comune e
 * lunghezze vicine ("gioielli" → "Gioielleria", "maglia" → "Maglietta").
 * La soglia esclude le parole corte e generiche: "pasta" (prefisso "past", 4)
 * non aggancia "Pasticceria".
 */
function stessaFamiglia(termine: string, token: string): boolean {
  // Un refuso non è un familiare: "telefno"/"telefono" passa dal recupero
  // refusi, non dalla corrispondenza normale.
  if (refusoPlausibile(termine, token)) return false;
  if (Math.abs(termine.length - token.length) > 4) return false;
  let comuni = 0;
  while (
    comuni < termine.length &&
    comuni < token.length &&
    termine[comuni] === token[comuni]
  ) {
    comuni++;
  }
  return comuni >= 5;
}

/**
 * Identificazione del soggetto per una ricerca a parola singola: corrispondenza
 * diretta, variante singolare/plurale oppure stessa famiglia lessicale.
 * Non guarda le descrizioni generiche, per non reintrodurre i falsi positivi
 * del motore tollerante.
 */
export function prodottoIdentificaSoggetto(
  prodotto: ProdottoIdentificabile,
  soggetto: string
): boolean {
  if (!soggetto) return true;
  if (prodottoIdentificatoDaSoggetto(prodotto, soggetto)) return true;

  const identita = normalizza(
    [prodotto.nome, prodotto.categoria].filter(Boolean).join(" ")
  );
  const token = estraiToken(identita);
  if (token.length === 0) return false;

  // Se un termine del prodotto è un refuso della richiesta, il prodotto
  // appartiene al recupero refusi: qui non deve passare per "famiglia"
  // (altrimenti "telefno" entrerebbe dalla categoria "Telefonia").
  if (token.some((t) => refusoPlausibile(soggetto, t))) return false;

  const varianti = new Set([soggetto, ...variantiNumero(soggetto)]);
  return token.some(
    (t) => varianti.has(t) || stessaFamiglia(soggetto, t)
  );
}

/**
 * Il prodotto è un refuso plausibile del soggetto ("telefno" → "Telefono",
 * "panifcio" → "Panificio").
 *
 * Il confronto avviene SOLO con la testa del nome prodotto (primo termine
 * dotato di contenuto): una parola secondaria non identifica il prodotto, e
 * "Cintura Orologio" non deve essere recuperata da "orologgio". Usato solo
 * come recupero quando nessun prodotto identifica davvero il soggetto.
 */
export function prodottoForseRefusoDiSoggetto(
  prodotto: ProdottoIdentificabile,
  soggetto: string
): boolean {
  const testa = estraiToken(normalizza(prodotto.nome ?? "")).find(
    (t) => t.length >= 4
  );
  if (!testa) return false;
  return refusoPlausibile(soggetto, testa);
}
