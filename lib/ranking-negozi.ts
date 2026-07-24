import { normalizza, radice, estraiTermini, estraiToken } from "./text-utils";

type NegozioIndicizzabile = {
  id: string;
  nome?: string | null;
  categoria?: string | null;
  descrizione?: string | null;
  indirizzo?: string | null;
  sito_web?: string | null;
  servizi?: string | null;
  parole_chiave?: string[] | string | null;
};



function contieneTermineRilevante(campo: string | null | undefined, termine: string) {
  const tokens = estraiToken(campo);
  const termineNorm = normalizza(termine);
  const radiceTermine = radice(termineNorm);

  return tokens.some((token) => {
    if (token === termineNorm) {
      return true;
    }

    if (token.length < 3 || termineNorm.length < 3) {
      return false;
    }

    const radiceToken = radice(token);

    return (
      radiceToken === radiceTermine ||
      (token.length >= 4 && termineNorm.length >= 4 && token.startsWith(termineNorm)) ||
      (token.length >= 4 && termineNorm.length >= 4 && termineNorm.startsWith(token))
    );
  });
}

function paroleChiaveComeTesto(paroleChiave: NegozioIndicizzabile["parole_chiave"]) {
  if (Array.isArray(paroleChiave)) {
    return paroleChiave.join(" ");
  }

  return paroleChiave ?? "";
}

export function calcolaPunteggioNegozio(
  negozio: NegozioIndicizzabile,
  query: string
) {
  const termini = estraiTermini(query);
  let punteggio = 0;

  const nome = negozio.nome ?? "";
  const categoria = negozio.categoria ?? "";
  const descrizione = negozio.descrizione ?? "";
  const indirizzo = negozio.indirizzo ?? "";
  const sito = negozio.sito_web ?? "";
  const servizi = negozio.servizi ?? "";
  const paroleChiave = paroleChiaveComeTesto(negozio.parole_chiave);

  for (const termine of termini) {
    if (contieneTermineRilevante(nome, termine)) punteggio += 14;
    if (contieneTermineRilevante(categoria, termine)) punteggio += 11;
    if (contieneTermineRilevante(paroleChiave, termine)) punteggio += 10;
    if (contieneTermineRilevante(servizi, termine)) punteggio += 7;
    if (contieneTermineRilevante(descrizione, termine)) punteggio += 6;
    if (contieneTermineRilevante(indirizzo, termine)) punteggio += 2;
    if (contieneTermineRilevante(sito, termine)) punteggio += 1;
  }

  return punteggio;
}

export function ordinaNegoziPerRilevanza<T extends NegozioIndicizzabile>(
  negozi: T[],
  query: string
) {
  return [...negozi].sort(
    (a, b) => calcolaPunteggioNegozio(b, query) - calcolaPunteggioNegozio(a, query)
  );
}

export function filtraNegoziPerPertinenza<T extends NegozioIndicizzabile>(
  negozi: T[],
  query: string
) {
  const ordinati = ordinaNegoziPerRilevanza(negozi, query);

  if (ordinati.length === 0) {
    return [];
  }

  const punteggi = ordinati.map((negozio) => ({
    negozio,
    punteggio: calcolaPunteggioNegozio(negozio, query),
  }));

  const topScore = punteggi[0]?.punteggio ?? 0;

  if (topScore <= 0) {
    return [];
  }

  const soglia = Math.max(8, Math.ceil(topScore * 0.35));
  const filtrati = punteggi
    .filter(({ punteggio }) => punteggio >= soglia)
    .map(({ negozio }) => negozio);

  return filtrati.length > 0 ? filtrati : [ordinati[0]];
}
