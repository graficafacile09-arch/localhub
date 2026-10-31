import { normalizza, estraiToken } from "../text-utils";

export type ProdottoIdentificabile = {
  nome?: string | null;
  categoria?: string | null;
};

function tokenCompatibile(termine: string, token: string[]): boolean {
  if (termine.length < 4) return false;
  const radiceTermine = termine.replace(/[aeiou]+$/i, "");
  if (radiceTermine.length < 4) return false;
  return token.some(
    (t) => t.length >= 4 && t.replace(/[aeiou]+$/i, "") === radiceTermine
  );
}

/** Il soggetto della ricerca deve identificare il prodotto, non solo la sua descrizione. */
export function prodottoIdentificatoDaSoggetto(
  prodotto: ProdottoIdentificabile,
  soggetto: string | undefined,
  concetti: string[] = []
): boolean {
  const identita = normalizza([prodotto.nome, prodotto.categoria].filter(Boolean).join(" "));
  if (!identita) return false;
  if (!soggetto) return true;
  const token = estraiToken(identita);
  const corrisponde = soggetto.length < 4
    ? token.includes(soggetto)
    : identita.includes(soggetto) || tokenCompatibile(soggetto, token);
  return corrisponde || concetti.some((concetto) => identita.includes(normalizza(concetto)));
}
