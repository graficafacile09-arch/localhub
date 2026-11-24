import type { SchedaProdottoBarcode } from "./tipi";

/**
 * RadiciScan — codici a barre.
 *
 * - La validazione del carattere di controllo avviene in locale: un codice
 *   inventato non interroga nulla.
 * - La banca dati prodotti è OpenFoodFacts (open data, nessuna chiave API,
 *   nessun costo). È un database collaborativo: attendibilità `media`, mai
 *   una certificazione.
 * - Host fisso, identificativo solo numerico, nessun URL costruito da input
 *   arbitrario, redirect rifiutati, tetto della risposta e timeout.
 */

const BASE_URL = "https://world.openfoodfacts.org/api/v2/product/";
const TIMEOUT_MS = 6_000;
const MAX_BYTES = 400_000;

export type TipoBarcode = "EAN-13" | "EAN-8" | "UPC-A";

export interface EsitoBarcode {
  valido: boolean;
  tipo: TipoBarcode | null;
  normalizzato: string | null;
}

function cifre(valore: string): string {
  return valore.replace(/[\s-]/g, "");
}

function checksumValido(codice: string): boolean {
  const numeri = codice.split("").map(Number);
  if (numeri.some((numero) => !Number.isInteger(numero))) return false;
  const controllo = numeri.pop() as number;
  let somma = 0;
  // Dal carattere più a destra del corpo: peso 3, poi 1, alternati.
  for (let indice = numeri.length - 1, peso = 3; indice >= 0; indice -= 1, peso = 4 - peso) {
    somma += numeri[indice] * peso;
  }
  return (10 - (somma % 10)) % 10 === controllo;
}

/** Accetta solo EAN-13, EAN-8 e UPC-A con checksum corretto. */
export function validaBarcode(valore: string | null | undefined): EsitoBarcode {
  if (typeof valore !== "string") {
    return { valido: false, tipo: null, normalizzato: null };
  }
  const codice = cifre(valore.trim());
  if (!/^\d+$/.test(codice)) {
    return { valido: false, tipo: null, normalizzato: null };
  }

  let tipo: TipoBarcode | null = null;
  if (codice.length === 13) tipo = "EAN-13";
  else if (codice.length === 8) tipo = "EAN-8";
  else if (codice.length === 12) tipo = "UPC-A";
  else return { valido: false, tipo: null, normalizzato: null };

  if (!checksumValido(codice)) {
    return { valido: false, tipo: null, normalizzato: null };
  }
  return { valido: true, tipo, normalizzato: codice };
}

interface ProdottoOpenFoodFacts {
  code?: unknown;
  product_name?: unknown;
  brands?: unknown;
  labels?: unknown;
  categories?: unknown;
  manufacturing_places?: unknown;
  countries?: unknown;
  status?: unknown;
}

function testo(valore: unknown, max = 160): string | null {
  if (typeof valore !== "string") return null;
  const pulito = valore.replace(/\s+/g, " ").trim();
  if (!pulito) return null;
  return pulito.length > max ? pulito.slice(0, max).trim() : pulito;
}

function elenco(valore: unknown, max = 12): string[] {
  if (typeof valore !== "string") return [];
  return valore
    .split(",")
    .map((voce) => voce.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, max);
}

function schedaNonTrovata(
  codice: string,
  consultataIl: string,
  messaggio: string
): SchedaProdottoBarcode {
  return {
    codice,
    trovato: false,
    nome: null,
    marchio: null,
    etichette: [],
    luoghiProduzione: [],
    categorie: [],
    url: `https://world.openfoodfacts.org/product/${codice}`,
    fonte: "OpenFoodFacts",
    attendibilita: "media",
    consultataIl,
    messaggio,
  };
}

export interface OpzioniBarcode {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  adesso?: () => Date;
  signal?: AbortSignal;
}

/**
 * Cerca il codice in OpenFoodFacts. Non lancia mai: un errore di rete è
 * distinto da "prodotto assente" ed entrambi sono dichiarati.
 */
export async function cercaBarcode(
  valore: string,
  opzioni: OpzioniBarcode = {}
): Promise<SchedaProdottoBarcode> {
  const validazione = validaBarcode(valore);
  const consultataIl = (opzioni.adesso ?? (() => new Date()))()
    .toISOString()
    .slice(0, 10);

  if (!validazione.valido || !validazione.normalizzato) {
    return schedaNonTrovata(
      cifre(valore ?? "").slice(0, 14),
      consultataIl,
      "Codice a barre non valido (checksum o lunghezza): nessuna interrogazione eseguita."
    );
  }

  const codice = validazione.normalizzato;
  const fetchImpl = opzioni.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opzioni.timeoutMs ?? TIMEOUT_MS
  );
  const annulla = () => controller.abort();
  opzioni.signal?.addEventListener("abort", annulla, { once: true });
  if (opzioni.signal?.aborted) controller.abort();

  try {
    const url = new URL(`${BASE_URL}${codice}.json`);
    url.search = new URLSearchParams({
      fields: "code,product_name,brands,labels,categories,manufacturing_places,countries,status",
    }).toString();

    const risposta = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!risposta.ok) {
      return schedaNonTrovata(
        codice,
        consultataIl,
        `Banca dati prodotti non raggiungibile (HTTP ${risposta.status}): nessun dato, non un'assenza di prodotto.`
      );
    }

    const dichiarata = Number(risposta.headers.get("content-length") ?? "");
    if (Number.isFinite(dichiarata) && dichiarata > MAX_BYTES) {
      return schedaNonTrovata(
        codice,
        consultataIl,
        "Risposta della banca dati oltre il limite: non letta."
      );
    }

    const testoRisposta = await risposta.text();
    if (testoRisposta.length > MAX_BYTES) {
      return schedaNonTrovata(
        codice,
        consultataIl,
        "Risposta della banca dati oltre il limite: non letta."
      );
    }

    let payload: { status?: unknown; product?: ProdottoOpenFoodFacts };
    try {
      payload = JSON.parse(testoRisposta) as typeof payload;
    } catch {
      return schedaNonTrovata(
        codice,
        consultataIl,
        "Risposta della banca dati non interpretabile: nessun dato."
      );
    }

    if (payload?.status !== 1 || !payload.product) {
      return schedaNonTrovata(
        codice,
        consultataIl,
        "Codice non presente in OpenFoodFacts: nessuna scheda, non una prova di non conformità."
      );
    }

    const prodotto = payload.product;
    const nome = testo(prodotto.product_name);
    return {
      codice,
      trovato: nome !== null || testo(prodotto.brands) !== null,
      nome,
      marchio: testo(prodotto.brands),
      etichette: elenco(prodotto.labels),
      luoghiProduzione: elenco(prodotto.manufacturing_places),
      categorie: elenco(prodotto.categories),
      url: `https://world.openfoodfacts.org/product/${codice}`,
      fonte: "OpenFoodFacts",
      attendibilita: "media",
      consultataIl,
      messaggio:
        "Scheda di una banca dati collaborativa: utile per identificare il prodotto, non per certificarne l'origine.",
    };
  } catch {
    return schedaNonTrovata(
      codice,
      consultataIl,
      "Banca dati prodotti non raggiungibile o tempo scaduto: nessun dato letto."
    );
  } finally {
    clearTimeout(timer);
    opzioni.signal?.removeEventListener("abort", annulla);
  }
}
