export function normalizza(testo: string) {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function radice(termine: string) {
  const valore = normalizza(termine).trim();
  if (valore.length <= 4) return valore;
  return valore.replace(/[aeiou]$/i, "");
}

export function estraiTermini(query: string) {
  return query
    .split(/\s+/)
    .map((termine) => normalizza(termine).trim())
    .filter(Boolean);
}

export function estraiToken(campo: string | null | undefined) {
  return normalizza(campo ?? "")
    .split(/[^a-z0-9]+/)
    .map((termine) => termine.trim())
    .filter(Boolean);
}

// ─── Equivalenza lessicale: forma compatta e sigle ───────────────────────────
// Lo stesso concetto arriva scritto in modi diversi: «Extra Vergine»,
// «extravergine», «extra-vergine», «EVO». Invece di aggiungere una coppia di
// sinonimi per ogni parola che manca, il confronto qui è STRUTTURALE e vale per
// qualsiasi concetto:
//   - forma compatta: spazi, apostrofi e trattini non contano;
//   - sigla: 3-4 lettere uguali alle iniziali di parole contigue, ignorando i
//     connettori («evo» = EXTRA VERGINE (di) OLIVA, «dop» =
//     Denominazione (di) Origine Protetta).
// Il confronto è bidirezionale: «olio evo» trova «Olio Extra Vergine» e
// «extra vergine» trova «Olio EVO».

const CONNETTORI_SIGLA = new Set([
  "di", "de", "del", "dello", "della", "dei", "degli", "delle", "da", "dal",
  "dalla", "dai", "a", "al", "allo", "alla", "ai", "agli", "alle", "in",
  "con", "su", "per", "e", "ed", "o", "the", "of", "and", "with", "for",
]);

/** Forma compatta: minuscole, senza spazi, apostrofi o trattini. */
export function formaCompatta(testo: string): string {
  return normalizza(testo).replace(/[^a-z0-9]+/g, "");
}

/** Parole di contenuto per le sigle: i connettori non contano come iniziale. */
function paroleSigla(testo: string): string[] {
  return normalizza(testo)
    .split(/[^a-z0-9]+/)
    .map((parola) => parola.trim())
    .filter((parola) => parola.length >= 2 && !CONNETTORI_SIGLA.has(parola));
}

function iniziali(parole: string[]): string {
  return parole.map((parola) => parola[0]).join("");
}

/**
 * Vero se `termine` e `testo` sono equivalenti per sigla.
 *
 * `testo` è la forma estesa («Extra Vergine di Oliva») e `termine` la sigla
 * («evo»), oppure il contrario («extra vergine» contro un prodotto «Olio EVO»).
 * Nel secondo caso la sigla può sciogliere anche una parola implicita in più
 * («evo» = EXTRA VERGINE + la O di OLIVA), quindi è ammessa una lettera in più
 * rispetto alle iniziali delle parole richieste. Il confronto non guarda le
 * descrizioni: vale solo sui metadati che identificano il prodotto.
 */
export function equivalenzaSigla(termine: string, testo: string): boolean {
  const siglaRichiesta = formaCompatta(termine);
  if (!siglaRichiesta || !normalizza(testo).trim()) return false;

  // 1) La richiesta è una sigla e il testo la scioglie in parole contigue.
  const paroleTesto = paroleSigla(testo);
  if (/^[a-z]{3,4}$/.test(siglaRichiesta) && paroleTesto.length >= siglaRichiesta.length) {
    for (let i = 0; i + siglaRichiesta.length <= paroleTesto.length; i++) {
      if (iniziali(paroleTesto.slice(i, i + siglaRichiesta.length)) === siglaRichiesta) {
        return true;
      }
    }
  }

  // 2) La richiesta è una frase e il testo usa la sigla.
  const paroleTermine = paroleSigla(termine);
  if (paroleTermine.length >= 2) {
    for (const token of estraiToken(testo)) {
      if (!/^[a-z]{3,4}$/.test(token)) continue;
      const paroleSciolte = token.length - 1;
      if (paroleSciolte < 2 || paroleSciolte > paroleTermine.length) continue;
      for (let i = 0; i + paroleSciolte <= paroleTermine.length; i++) {
        const sigla = iniziali(paroleTermine.slice(i, i + paroleSciolte));
        if (sigla.length >= 2 && token.startsWith(sigla)) return true;
      }
    }
  }

  return false;
}

/**
 * La query è composta SOLO da sigle (una o due parole di 3-4 lettere): «evo»,
 * «dop», «igt». In questi casi la sigla non compare nei nomi del catalogo e il
 * retrieval per sottostringa non ha nulla su cui lavorare.
 */
export function soloSigle(query: string): boolean {
  const parole = normalizza(query)
    .split(/[^a-z0-9]+/)
    .map((parola) => parola.trim())
    .filter(Boolean);
  if (parole.length < 1 || parole.length > 2) return false;
  return parole.every((parola) => /^[a-z]{3,4}$/.test(parola));
}
