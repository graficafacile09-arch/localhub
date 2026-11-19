import {
  fonteDocumentata,
  isUrlFonteUfficiale,
  type FonteUfficiale,
  type SchemaQualita,
} from "./fonti";
import type { FontePubblica, RiconoscimentoAi, VerificaDocumentale } from "./tipi";

/**
 * RadiciScan — verifica documentale.
 *
 * Il livello `verificato` non viene mai deciso dal modello: si ottiene solo
 * con una corrispondenza esatta (dopo normalizzazione) tra la denominazione
 * letta e una riga `denominazione` del registro ufficiale, attiva e completa.
 *
 * Il confronto è volutamente rigido: nessuna somiglianza fuzzy, nessuna
 * distanza di edit. Un falso positivo qui sarebbe una dichiarazione di
 * autenticità non supportata.
 */

const ETICHETTE_QUALITA = [
  "dop",
  "igp",
  "stg",
  "doc",
  "docg",
  "igt",
  "pat",
  "deco",
];

/** Minuscole, senza diacritici, punteggiatura ridotta a spazi. */
export function normalizzaTesto(valore: string): string {
  return valore
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Ricompatta le sigle scritte con i punti: "d o p" -> "dop".
 * Serve perché "D.O.P." viene normalizzato in tre token separati, che
 * altrimenti sfuggirebbero al riconoscimento dell'etichetta di qualità.
 */
function compattaSigle(parole: readonly string[]): string[] {
  const risultato: string[] = [];
  let sigla = "";

  for (const parola of parole) {
    if (parola.length === 1) {
      sigla += parola;
      continue;
    }
    if (sigla) {
      risultato.push(sigla);
      sigla = "";
    }
    risultato.push(parola);
  }
  if (sigla) risultato.push(sigla);

  return risultato;
}

/** Normalizzazione per il confronto delle denominazioni. */
export function normalizzaDenominazione(valore: string): string {
  const parole = compattaSigle(normalizzaTesto(valore).split(" ").filter(Boolean));
  while (parole.length > 1 && ETICHETTE_QUALITA.includes(parole[parole.length - 1])) {
    parole.pop();
  }
  return parole.join(" ");
}

/**
 * Coerenza tra due territori: uguaglianza dopo normalizzazione oppure
 * contenimento di uno nell'altro ("Calabria" ⊂ "Regione Calabria").
 * Un territorio più ampio non conferma una denominazione: serve solo a
 * escludere contraddizioni evidenti.
 */
export function territoriCoerenti(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  const na = normalizzaTesto(a);
  const nb = normalizzaTesto(b);
  if (!na || !nb) return true;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function proiettaFonte(fonte: FonteUfficiale): FontePubblica {
  return {
    id: fonte.id,
    slug: fonte.slug,
    denominazione: fonte.denominazione,
    ente: fonte.ente,
    urlUfficiale: fonte.urlUfficiale,
    riferimentoNormativo: fonte.riferimentoNormativo,
    consultataIl: fonte.consultataIl,
    schemaQualita: fonte.schemaQualita,
    territorio: fonte.territorio,
  };
}

function esisteCoerenzaSenzaDenominazione(
  registro: readonly FonteUfficiale[],
  schema: SchemaQualita | null,
  territorio: string | null
): FonteUfficiale | null {
  if (!schema && !territorio) return null;
  for (const fonte of registro) {
    if (!fonteDocumentata(fonte)) continue;
    if (schema && fonte.schemaQualita !== schema) continue;
    if (territorio && !territoriCoerenti(territorio, fonte.territorio)) continue;
    if (!isUrlFonteUfficiale(fonte.urlUfficiale)) continue;
    return fonte;
  }
  return null;
}

function nonVerificato(
  livello: VerificaDocumentale["livello"],
  esito: VerificaDocumentale["esito"],
  motivazione: string,
  fonte: FonteUfficiale | null = null
): VerificaDocumentale {
  return {
    esito,
    livello,
    fonte: fonte ? proiettaFonte(fonte) : null,
    denominazioneVerificata: null,
    motivazione,
  };
}

/**
 * Verifica una denominazione proposta contro il registro ufficiale.
 * Restituisce sempre una motivazione leggibile e non usa mai dati del
 * modello come se fossero fonte.
 */
export function verificaDenominazione(
  riconoscimento: RiconoscimentoAi,
  registro: readonly FonteUfficiale[]
): VerificaDocumentale {
  const proposta = riconoscimento.denominazioneProposta?.trim() ?? "";

  if (!proposta) {
    const coerente = esisteCoerenzaSenzaDenominazione(
      registro,
      riconoscimento.schemaProposto,
      riconoscimento.territorioProposto
    );
    if (coerente) {
      return nonVerificato(
        "coerente_non_verificato",
        "coerente_senza_denominazione",
        "Nessuna denominazione leggibile: schema e territorio sono compatibili con fonti registrate, ma la denominazione non è confermata.",
        coerente
      );
    }
    return nonVerificato(
      "non_verificato",
      "nessuna_denominazione",
      "Nessuna denominazione di qualità leggibile: il prodotto resta un riconoscimento non confermato."
    );
  }

  const cercata = normalizzaDenominazione(proposta);
  const candidate = registro.filter(
    (fonte) =>
      fonte.tipoAtto === "denominazione" &&
      normalizzaDenominazione(fonte.denominazione) === cercata
  );

  if (candidate.length === 0) {
    const coerente = esisteCoerenzaSenzaDenominazione(
      registro,
      riconoscimento.schemaProposto,
      riconoscimento.territorioProposto
    );
    return nonVerificato(
      coerente ? "coerente_non_verificato" : "non_verificato",
      "non_confermata",
      coerente
        ? `La denominazione "${proposta}" non risulta nel registro ufficiale; schema e territorio sono compatibili con fonti registrate, quindi la lettura è solo coerente, non verificata.`
        : `La denominazione "${proposta}" non risulta nel registro ufficiale: nessuna verifica documentale possibile.`,
      coerente
    );
  }

  const documentata = candidate.find((fonte) => fonteDocumentata(fonte));
  if (!documentata) {
    return nonVerificato(
      "non_verificato",
      "fonte_non_verificabile",
      `La denominazione "${proposta}" compare nel registro, ma la fonte non è attiva e completa: non può sostenere il livello verificato.`,
      candidate[0] ?? null
    );
  }

  if (
    riconoscimento.schemaProposto &&
    documentata.schemaQualita !== riconoscimento.schemaProposto
  ) {
    return nonVerificato(
      "incongruenza_possibile",
      "schema_incoerente",
      `Possibile incongruenza: lo schema dichiarato (${riconoscimento.schemaProposto}) non corrisponde a quello della fonte ufficiale (${documentata.schemaQualita}), che resta l'unico riferimento valido.`,
      documentata
    );
  }

  if (
    riconoscimento.territorioProposto &&
    !territoriCoerenti(riconoscimento.territorioProposto, documentata.territorio)
  ) {
    return nonVerificato(
      "incongruenza_possibile",
      "territorio_incoerente",
      `Possibile incongruenza: il territorio dichiarato ("${riconoscimento.territorioProposto}") non coincide con quello della fonte ufficiale ("${documentata.territorio}"). Da controllare, non è una conclusione.`,
      documentata
    );
  }

  return {
    esito: "confermata",
    livello: "verificato",
    fonte: proiettaFonte(documentata),
    denominazioneVerificata: documentata.denominazione,
    motivazione: `Denominazione confermata su fonte ufficiale registrata (${documentata.ente}), consultata il ${documentata.consultataIl}.`,
  };
}
