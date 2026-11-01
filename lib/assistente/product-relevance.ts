import { normalizza, estraiToken } from "../text-utils.ts";

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
 * Il soggetto deve identificare il prodotto tramite nome/categoria oppure
 * tramite una descrizione o parole chiave esplicite del prodotto.
 * Non vengono considerati i dati del negozio: evitare che "Mani in Pasta"
 * faccia comparire prodotti non alimentari nella ricerca "pasta".
 */
export function prodottoIdentificatoDaSoggetto(
  prodotto: ProdottoIdentificabile,
  soggetto: string | undefined,
  concetti: string[] = []
): boolean {
  const identita = normalizza([prodotto.nome, prodotto.categoria].filter(Boolean).join(" "));
  const dettagli = normalizza([
    prodotto.descrizione,
    prodotto.descrizione_completa,
    ...(prodotto.parole_chiave ?? []),
  ].filter(Boolean).join(" "));
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
