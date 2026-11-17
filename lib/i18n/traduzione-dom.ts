import { traduci, type Lingua } from "./dictionary";

/**
 * Traduzione del DOM lato browser.
 *
 * Le pagine sono server components con i testi in italiano: qui ogni testo
 * (nodi di testo + attributi visibili o letti dagli screen reader) viene
 * cercato nel dizionario e sostituito, conservando l'originale per poter
 * tornare all'italiano senza ricaricare. Un `MutationObserver` ritraduce i
 * pezzi che React aggiunge o cambia dopo l'idratazione.
 */

/** Attributi che l'utente vede o sente. */
const ATTRIBUTI = ["placeholder", "aria-label", "title", "alt"] as const;

/** Sottoalberi dove non si tocca nulla (codice, stili, SVG, campi liberi). */
const NON_TRADURRE = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "SVG"]);

/** Ultimo testo italiano visto, la sua traduzione e la lingua applicata. */
type VoceText = { originale: string; tradotto: string; lingua: Lingua };
type VoceAttributo = { originale: string; tradotto: string; lingua: Lingua };

const testiOriginali = new WeakMap<Text, VoceText>();
const attributiOriginali = new WeakMap<Element, Map<string, VoceAttributo>>();

/** Registri forti, usati solo per ripristinare l'italiano. */
let nodiTradotti: Text[] = [];
let elementiTradotti: Element[] = [];
let osservatore: MutationObserver | null = null;

/**
 * Elementi di cui non si traduce il CONTENUTO. Gli attributi visibili
 * (placeholder, aria-label, title, alt) restano invece traducibili: è il caso
 * della <textarea> delle note, il cui placeholder deve seguire la lingua.
 */
function bloccato(elemento: Element): boolean {
  return (
    elemento.hasAttribute("data-no-translate") ||
    (elemento as HTMLElement).isContentEditable === true
  );
}

function conSpazi(base: string, testo: string): string {
  const iniziali = base.match(/^\s*/)?.[0] ?? "";
  const finali = base.match(/\s*$/)?.[0] ?? "";
  return iniziali + testo + finali;
}

function traduciNodo(nodo: Text, lingua: Lingua): void {
  const corrente = nodo.nodeValue ?? "";
  if (!corrente.trim()) return;

  const voce = testiOriginali.get(nodo);

  if (voce && voce.lingua === lingua) {
    // Nostra stessa scrittura: uscire SUBITO, altrimenti la mutazione
    // richiama l'observer e si entra in un ciclo infinito.
    if (corrente === voce.tradotto) return;

    // Testo identico all'italiano già tradotto: React ha ripristinato il
    // valore originale, si ritraduce.
    if (corrente !== voce.originale) {
      // Testo nuovo scritto da React (prezzo aggiornato, contatore, stato…):
      // è il nuovo italiano di riferimento, da tradurre adesso.
      voce.originale = corrente;
      voce.tradotto = corrente;
    }
  }
  // Lingua diversa da quella già applicata: il riferimento resta
  // `voce.originale` (italiano), anche se a video c'è la traduzione vecchia.

  const originale = voce?.originale ?? corrente;
  const tradotto = traduci(originale, lingua);
  if (tradotto === null) return;

  const nuovo = conSpazi(originale, tradotto);
  if (nuovo === originale) return; // traduzione identica (es. "Home"): niente da fare

  if (voce) {
    voce.tradotto = nuovo;
    voce.lingua = lingua;
  } else {
    testiOriginali.set(nodo, { originale, tradotto: nuovo, lingua });
    nodiTradotti.push(nodo);
  }
  if (nodo.nodeValue !== nuovo) nodo.nodeValue = nuovo;
}

function traduciAttributi(elemento: Element, lingua: Lingua): void {
  for (const nome of ATTRIBUTI) {
    const valore = elemento.getAttribute(nome);
    if (!valore) continue;

    const mappa = attributiOriginali.get(elemento);
    const voce = mappa?.get(nome);
    if (voce && voce.lingua === lingua) {
      // Nostra stessa scrittura: niente da fare.
      if (valore === voce.tradotto) continue;
      // React ha cambiato il valore: vale come nuovo testo italiano.
      if (valore !== voce.originale) {
        voce.originale = valore;
        voce.tradotto = valore;
      }
    }

    const originale = voce?.originale ?? valore;
    const tradotto = traduci(originale, lingua);
    if (tradotto === null || tradotto === originale) continue;

    if (voce) {
      voce.tradotto = tradotto;
      voce.lingua = lingua;
    } else if (mappa) {
      mappa.set(nome, { originale, tradotto, lingua });
    } else {
      const nuova = new Map<string, VoceAttributo>();
      nuova.set(nome, { originale, tradotto, lingua });
      attributiOriginali.set(elemento, nuova);
      elementiTradotti.push(elemento);
    }
    elemento.setAttribute(nome, tradotto);
  }
}

/**
 * Traduce un nodo e tutto il suo sottoalbero.
 *
 * Ricorsione esplicita sui figli: la `TreeWalker` con filtro saltava il testo
 * dentro lo `<span>` giallo della hero, quindi qui si visita ogni nodo.
 */
export function traduciAlbero(radice: Node, lingua: Lingua): void {
  if (radice.nodeType === Node.TEXT_NODE) {
    traduciNodo(radice as Text, lingua);
    return;
  }
  if (radice.nodeType !== Node.ELEMENT_NODE) return;

  const elemento = radice as Element;
  if (bloccato(elemento)) return;
  traduciAttributi(elemento, lingua);
  if (NON_TRADURRE.has(elemento.tagName)) return;

  for (const figlio of Array.from(elemento.childNodes)) traduciAlbero(figlio, lingua);
}

/** Riporta alla lingua originale tutto ciò che era stato tradotto. */
export function ripristina(): void {
  for (const nodo of nodiTradotti) {
    const voce = testiOriginali.get(nodo);
    if (voce && nodo.isConnected && nodo.nodeValue === voce.tradotto) {
      nodo.nodeValue = voce.originale;
    }
    testiOriginali.delete(nodo);
  }
  for (const elemento of elementiTradotti) {
    const mappa = attributiOriginali.get(elemento);
    if (mappa && elemento.isConnected) {
      for (const [nome, voce] of mappa) {
        if (elemento.getAttribute(nome) === voce.tradotto) {
          elemento.setAttribute(nome, voce.originale);
        }
      }
    }
    attributiOriginali.delete(elemento);
  }
  nodiTradotti = [];
  elementiTradotti = [];
}

/**
 * Ritardo prima di ritradurre ciò che React aggiunge o riscrive. Non si traduce
 * nell'istante della mutazione: un nodo appena inserito viene idratato subito
 * dopo, e scriverci dentro in quel momento produce un mismatch (errore 418).
 */
const ATTESA_MUTAZIONI = 120;
let coda: ReturnType<typeof setTimeout> | null = null;
/**
 * Lingua con cui tradurre le mutazioni. È una variabile, non una chiusura:
 * quando l'utente passa da una lingua all'altra l'osservatore resta acceso, ma
 * deve applicare SUBITO la lingua nuova. Con la lingua catturata alla creazione
 * (bug) dopo un cambio francese → spagnolo l'observer ritraduceva tutto in
 * francese, annullando il cambio.
 */
let linguaOsservata: Lingua = "it";

/**
 * Allinea subito la lingua dell'osservatore a quella scelta dall'utente: al
 * cambio lingua le mutazioni prodotte dal ripristino non vengono ritradotte
 * con la lingua vecchia nel breve intervallo prima del nuovo effetto.
 */
export function allineaLinguaOsservata(lingua: Lingua): void {
  linguaOsservata = lingua;
}

/** Accende/spegne il controllo sui contenuti aggiunti dopo l'idratazione. */
export function osserva(attivo: boolean, lingua: Lingua): void {
  linguaOsservata = lingua;
  if (!attivo) {
    osservatore?.disconnect();
    osservatore = null;
    if (coda !== null) {
      clearTimeout(coda);
      coda = null;
    }
    return;
  }
  if (osservatore || linguaOsservata === "it") return;

  osservatore = new MutationObserver(() => {
    if (coda !== null) return;
    coda = setTimeout(() => {
      coda = null;
      traduciAlbero(document.body, linguaOsservata);
    }, ATTESA_MUTAZIONI);
  });

  osservatore.observe(document.body, { childList: true, subtree: true, characterData: true });
}
