import { normalizza, estraiToken } from "../text-utils.ts";
// Estensione esplicita: questo modulo è caricato anche dalla suite node
// (`node --experimental-strip-types --test`), che non risolve gli alias.
import { refusoPlausibile } from "./understanding.ts";
import { SOTTOTIPI_PRODOTTO } from "../sottotipi-prodotto.ts";

// Parole chiave che descrivono una categoria, un attributo o una provenienza:
// non sono un'identità di marca. Servono a impedire che una keyword isolata
// ("pasta", "olio", "alimentari") identifichi un prodotto solo perché è
// dichiarata dal venditore. Il confronto con la keyword resta esatto: nessuna
// somiglianza fuzzy viene introdotta.
const CHIAVI_GENERICHE_NON_IDENTITARIE = new Set([
  "alimentare", "alimentari", "pasta", "pane", "pizza", "dolce", "dolci",
  "biscotti", "formaggio", "salumi", "carne", "pesce", "verdura", "frutta",
  "olio", "miele", "conserve", "farina", "riso", "cipolla", "pomodoro",
  "artigianale", "artigianali", "tipico", "tipica", "tipici", "tipiche",
  "tradizionale", "tradizionali", "calabrese", "calabresi", "italiano",
  "italiana", "eccellenze", "selezione", "demo", "prodotto", "prodotti",
  "pelle", "cotone", "lino", "seta", "lana", "metallo", "argento", "oro",
  "acciaio", "legno", "plastica", "vetro", "ceramica", "dop", "igp",
]);

export type ProdottoIdentificabile = {
  nome?: string | null;
  categoria?: string | null;
  sottocategoria?: string | null;
  marca?: string | null;
  descrizione?: string | null;
  descrizione_completa?: string | null;
  parole_chiave?: string[] | null;
  parole_chiave_normalizzate?: string[] | null;
  caratteristiche?: string[] | null;
  seo_title?: string | null;
  seo_description?: string | null;
  alt_text_immagine?: string | null;
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
 * Metadati che IDENTIFICANO il prodotto: nome, categoria, sottocategoria e
 * marca. La marca è un dato del prodotto, non il nome del negozio: non viene
 * mai usata la proprietà `negozio_nome`. Le parole chiave restano un contributo,
 * non un'identità autosufficiente (vedi `paroleChiaveProdotto`).
 */
function identitaProdotto(prodotto: ProdottoIdentificabile): string {
  return normalizza(
    [
      prodotto.nome,
      prodotto.categoria,
      prodotto.sottocategoria,
      prodotto.marca,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

/**
 * Parole chiave dichiarate dal venditore, normalizzate. Quando P1.2 ha già
 * prodotto la vista normalizzata, la si usa direttamente: evita di riscrivere
 * la lista originale e mantiene una sola interpretazione dei metadati.
 */
function paroleChiaveProdotto(prodotto: ProdottoIdentificabile): string[] {
  const normalizzate = (prodotto.parole_chiave_normalizzate ?? [])
    .map((chiave) => normalizza(String(chiave ?? "")))
    .filter(Boolean);
  if (normalizzate.length > 0) return normalizzate;
  return (prodotto.parole_chiave ?? [])
    .map((chiave) => normalizza(String(chiave ?? "")))
    .filter(Boolean);
}

/**
 * Contesto di supporto del prodotto: descrizioni, caratteristiche, SEO e alt
 * text. Non dimostra da solo l'identità e non può rendere pertinente un
 * prodotto: "Filetti di cipolla" descritti come "conservati sott'olio" non
 * sono un prodotto che si chiama olio.
 *
 * Le caratteristiche e i campi SEO/alt sono quindi utilizzabili solo come
 * conferma di un segnale già presente (identità o parola chiave). Rimuove le
 * formule redazionali che citano il venditore, non il prodotto ("nella
 * selezione demo di Mani in Pasta").
 */
function dettagliDescrittivi(prodotto: ProdottoIdentificabile): string {
  return [
    prodotto.descrizione,
    prodotto.descrizione_completa,
    ...(prodotto.caratteristiche ?? []),
    prodotto.seo_title,
    prodotto.seo_description,
    prodotto.alt_text_immagine,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\b(?:nella\s+)?selezione\s+demo\s+di\s+[^,.!?;]+/gi, " ");
}

/**
 * Una parola chiave può essere un segnale d'identità solo quando coincide
 * esattamente con il soggetto e contiene almeno un token distintivo. La lista
 * di esclusione impedisce che categorie e attributi generici diventino marche.
 * Non vengono usati il nome del negozio né confronti fuzzy.
 */
function chiaveIdentificaMarca(
  prodotto: ProdottoIdentificabile,
  soggetto: string
): boolean {
  const chiavi = paroleChiaveProdotto(prodotto);
  const testo = normalizza(soggetto).trim();
  if (!testo || testo.length < 4) return false;
  return chiavi.some((chiave) => {
    if (chiave !== testo) return false;
    const token = estraiToken(chiave);
    if (token.length === 0 || token.length > 3) return false;
    return token.some(
      (t) => t.length >= 4 && !CHIAVI_GENERICHE_NON_IDENTITARIE.has(t)
    );
  });
}

/**
 * Il soggetto identifica il prodotto tramite nome/categoria/sottocategoria/
 * marca. Le parole chiave del venditore NON bastano da sole e nemmeno una
 * descrizione che le citi di passaggio ("con olio", "per uso alimentare"):
 * serve un segnale di classificazione vero, cioè o una parola chiave FRASE che
 * contiene il soggetto ("pasta calabrese") o una descrizione che NOMINA il
 * soggetto in apertura ("Pasta tradizionale calabrese…"). Descrizioni,
 * caratteristiche, SEO e alt text restano contesto di supporto, non identità
 * (D1). Un'unica eccezione esatta è una keyword-marca distintiva, gestita da
 * `chiaveIdentificaMarca`; il nome del negozio non è mai un'identità.
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
  const chiaveMarca = chiaveIdentificaMarca(prodotto, soggetto);

  return corrisponde(identita) || chiaveMarca || confermataDalleDescrizioni ||
    concetti.some((concetto) => {
      const c = normalizza(concetto);
      return Boolean(c) && (identita.includes(c) || dettagli.includes(c));
    });
}

/**
 * Il prodotto appartiene alla categoria GENERICA richiesta tramite un sottotipo
 * pubblicato nel catalogo ("formaggio" → "Pecorino di Castrovillari").
 *
 * Vale solo sui metadati identitari (nome, categoria, parole chiave): una
 * descrizione che cita la categoria di passaggio ("ottima con formaggi") non
 * rende il prodotto un formaggio. La mappa dei sottotipi è curata e piccola:
 * nessuna soglia di rilevanza viene abbassata per le altre ricerche.
 */
export function prodottoIdentificaCategoriaGenerica(
  prodotto: ProdottoIdentificabile,
  soggetto: string | undefined
): boolean {
  const chiave = normalizza(soggetto ?? "").trim();
  if (!chiave) return false;
  const sottotipi = SOTTOTIPI_PRODOTTO[chiave] ?? [];
  if (sottotipi.length === 0) return false;
  // Confronto per parola intera: "toma" non deve agganciare "automatico".
  const tokenIdentita = estraiToken(identitaProdotto(prodotto));
  const tokenChiavi = paroleChiaveProdotto(prodotto).flatMap((chiaveProdotto) =>
    estraiToken(chiaveProdotto)
  );
  return sottotipi.some((sottotipo) => {
    const voce = normalizza(sottotipo).trim();
    return Boolean(voce) && (tokenIdentita.includes(voce) || tokenChiavi.includes(voce));
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
