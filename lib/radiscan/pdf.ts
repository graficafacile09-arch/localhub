import { inflateRawSync, inflateSync } from "node:zlib";

/**
 * RadiciScan — estrazione del testo dai PDF ufficiali.
 *
 * Perché un estrattore interno: i disciplinari eAmbrosia sono PDF prodotti da
 * generatori standard (FlateDecode, font WinAnsi, testo in operatori Tj/TJ).
 * Un estratto interno con `node:zlib` evita una dipendenza onerosa e tiene
 * il comportamento verificabile dai test.
 *
 * Associazione pagina→testo: si leggono gli oggetti `/Type /Page` e i loro
 * riferimenti `/Contents`, così una pagina con più flussi non viene contata
 * come più pagine (errore osservato su un riepilogo reale). Se il PDF non
 * espone i riferimenti (per esempio con oggetti compressi in ObjStm), il
 * risultato è dichiarato `ordine_flussi`: le sezioni sono numerate, non
 * spacciate per pagine.
 *
 * Limiti dichiarati, mai nascosti:
 * - i PDF scansionati (una sola immagine per pagina) non hanno testo: vengono
 *   restituiti come pagine senza testo, NON come "letto";
 * - i font CID con CMap esotica possono produrre testo incompleto;
 * - nessun OCR.
 */

export interface PaginaPdf {
  /** Numero di pagina 1-based quando l'associazione è verificata. */
  numero: number;
  testo: string;
}

/**
 * `pagine`: i testi sono associati agli oggetti pagina del PDF.
 * `ordine_flussi`: il PDF non permette l'associazione; i testi sono sezioni
 * numerate nell'ordine di comparsa e non vanno presentati come pagine.
 */
export type AssociazionePagine = "pagine" | "ordine_flussi";

export interface EstrazionePdf {
  pagine: PaginaPdf[];
  /** Oggetti `/Type /Page` dichiarati dal PDF, quando riconoscibili. */
  pagineTotali: number | null;
  associazione: AssociazionePagine;
  /** Pagine senza testo estraibile (probabile scansione). */
  pagineSenzaTesto: number[];
  note: string[];
}

const MAX_CARATTERI_PAGINA = 20_000;
const MAX_OGGETTI = 400;

function decodificaEscapes(testo: string): string {
  let risultato = "";
  for (let indice = 0; indice < testo.length; indice += 1) {
    const carattere = testo[indice];
    if (carattere !== "\\") {
      risultato += carattere;
      continue;
    }

    const successivo = testo[indice + 1];
    if (successivo === undefined) break;

    if (successivo === "n") {
      risultato += "\n";
      indice += 1;
    } else if (successivo === "r") {
      risultato += "\r";
      indice += 1;
    } else if (successivo === "t") {
      risultato += "\t";
      indice += 1;
    } else if (successivo === "b" || successivo === "f" || successivo === "\n") {
      indice += 1;
    } else if (/[0-7]/.test(successivo)) {
      let ottale = "";
      let passo = 1;
      while (passo <= 3 && /[0-7]/.test(testo[indice + passo] ?? "")) {
        ottale += testo[indice + passo];
        passo += 1;
      }
      risultato += String.fromCharCode(parseInt(ottale, 8));
      indice += passo - 1;
    } else {
      risultato += successivo;
      indice += 1;
    }
  }
  return risultato;
}

/** Legge una stringa letterale `(...)` con parentesi annidate ed escape. */
function leggiStringaLettérale(
  contenuto: string,
  inizio: number
): { valore: string; fine: number } {
  let profondita = 0;
  let grezzo = "";

  for (let indice = inizio; indice < contenuto.length; indice += 1) {
    const carattere = contenuto[indice];

    if (carattere === "\\") {
      grezzo += carattere + (contenuto[indice + 1] ?? "");
      indice += 1;
      continue;
    }
    if (carattere === "(") {
      profondita += 1;
      if (profondita === 1) continue;
    }
    if (carattere === ")") {
      profondita -= 1;
      if (profondita === 0) {
        return { valore: decodificaEscapes(grezzo), fine: indice + 1 };
      }
    }
    grezzo += carattere;
  }

  return { valore: decodificaEscapes(grezzo), fine: contenuto.length };
}

function leggiStringaEsadecimale(
  contenuto: string,
  inizio: number
): { valore: string; fine: number } | null {
  const fine = contenuto.indexOf(">", inizio + 1);
  if (fine < 0) return null;

  const cifre = contenuto.slice(inizio + 1, fine).replace(/[^0-9A-Fa-f]/g, "");
  if (cifre.length === 0) return { valore: "", fine: fine + 1 };

  const completata = cifre.length % 2 === 0 ? cifre : `${cifre}0`;
  const byte: number[] = [];
  for (let indice = 0; indice < completata.length; indice += 2) {
    byte.push(parseInt(completata.slice(indice, indice + 2), 16));
  }

  // UTF-16BE si riconosce perché un byte su due è zero.
  const utf16 =
    byte.length >= 2 &&
    byte.every((valore, posizione) => posizione % 2 === 0 || valore === 0);

  if (utf16) {
    let testo = "";
    for (let indice = 0; indice + 1 < byte.length; indice += 2) {
      testo += String.fromCharCode((byte[indice] << 8) | byte[indice + 1]);
    }
    return { valore: testo, fine: fine + 1 };
  }

  return { valore: Buffer.from(byte).toString("latin1"), fine: fine + 1 };
}

/**
 * Estrae il testo mostrato da un flusso di contenuto PDF.
 *
 * Le stringhe sono concatenate finché non cambia la posizione del testo:
 * i generatori spezzano le parole in più `Tj` per la crenatura, quindi
 * aggiungere spazi tra i frammenti corromperebbe le parole.
 */
export function testoDaFlussoContenuto(contenuto: string): string {
  const righe: string[] = [];
  let corrente = "";

  const chiudiRiga = () => {
    const pulita = corrente.replace(/[ \t]+/g, " ").trim();
    if (pulita) righe.push(pulita);
    corrente = "";
  };

  let indice = 0;
  while (indice < contenuto.length) {
    const carattere = contenuto[indice];

    if (carattere === "(") {
      const { valore, fine } = leggiStringaLettérale(contenuto, indice);
      corrente += valore;
      indice = fine;
      continue;
    }

    if (carattere === "<" && contenuto[indice + 1] !== "<") {
      const esadecimale = leggiStringaEsadecimale(contenuto, indice);
      if (esadecimale) {
        corrente += esadecimale.valore;
        indice = esadecimale.fine;
        continue;
      }
      indice += 1;
      continue;
    }

    if (/[A-Za-z*'"]/.test(carattere)) {
      let fine = indice;
      while (fine < contenuto.length && /[A-Za-z*'"]/.test(contenuto[fine])) {
        fine += 1;
      }
      const operatore = contenuto.slice(indice, fine);

      if (
        operatore === "Td" ||
        operatore === "TD" ||
        operatore === "Tm" ||
        operatore === "T*" ||
        operatore === "BT" ||
        operatore === "ET" ||
        operatore === "'" ||
        operatore === '"'
      ) {
        chiudiRiga();
      }

      indice = fine;
      continue;
    }

    indice += 1;
  }

  chiudiRiga();
  return righe.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function decodificaFlusso(
  grezzo: Uint8Array,
  dizionario: string
): Uint8Array | null {
  const filtro = /\/Filter\s*\/?\[?\s*\/(\w+)/.exec(dizionario)?.[1] ?? null;

  if (
    filtro === "CCITTFaxDecode" ||
    filtro === "DCTDecode" ||
    filtro === "JPXDecode"
  ) {
    return null;
  }
  if (/\/Subtype\s*\/Image\b/.test(dizionario)) return null;

  try {
    return inflateSync(grezzo);
  } catch {
    // Alcuni generatori omettono l'header zlib: si prova il flusso grezzo.
  }
  try {
    return inflateRawSync(grezzo);
  } catch {
    return filtro === null ? grezzo : null;
  }
}

interface OggettoGrezzo {
  numero: number;
  inizio: number;
  fine: number;
}

function oggettiPdf(grezzo: string): OggettoGrezzo[] {
  const re = /(\d+)\s+0\s+obj\b/g;
  const trovati: { numero: number; inizio: number }[] = [];
  let corrispondenza: RegExpExecArray | null;
  while ((corrispondenza = re.exec(grezzo)) !== null) {
    trovati.push({ numero: Number(corrispondenza[1]), inizio: corrispondenza.index });
    if (trovati.length >= MAX_OGGETTI) break;
  }

  return trovati.map((oggetto, indice) => ({
    ...oggetto,
    fine: indice + 1 < trovati.length ? trovati[indice + 1].inizio : grezzo.length,
  }));
}

function mappaFlussi(
  grezzo: string,
  oggetti: readonly OggettoGrezzo[]
): Map<number, Uint8Array> {
  const mappa = new Map<number, Uint8Array>();

  for (const oggetto of oggetti) {
    const segmento = grezzo.slice(oggetto.inizio, oggetto.fine);
    const posizioneStream = segmento.indexOf("stream");
    if (posizioneStream < 0) continue;

    const dizionario = segmento.slice(0, posizioneStream);
    let inizioDati = oggetto.inizio + posizioneStream + "stream".length;
    if (grezzo[inizioDati] === "\r") inizioDati += 1;
    if (grezzo[inizioDati] === "\n") inizioDati += 1;

    const fineDati = grezzo.indexOf("endstream", inizioDati);
    if (fineDati < 0 || fineDati > oggetto.fine) continue;

    const bytes = Buffer.from(grezzo.slice(inizioDati, fineDati), "latin1");
    const decodificato = decodificaFlusso(bytes, dizionario);
    if (decodificato) mappa.set(oggetto.numero, decodificato);
  }

  return mappa;
}

function riferimentiContenuto(dizionario: string): number[] {
  const posizione = dizionario.indexOf("/Contents");
  if (posizione < 0) return [];

  const resto = dizionario.slice(posizione, posizione + 400);
  const elenco = /\/Contents\s*\[([^\]]*)\]/.exec(resto);

  if (elenco) {
    return [...elenco[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((voce) =>
      Number(voce[1])
    );
  }

  const singolo = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(resto);
  return singolo ? [Number(singolo[1])] : [];
}

function testoDiOggetti(
  riferimenti: readonly number[],
  flussi: Map<number, Uint8Array>
): string | null {
  const parti: string[] = [];
  for (const riferimento of riferimenti) {
    const flusso = flussi.get(riferimento);
    if (!flusso) return null;
    parti.push(
      Buffer.from(flusso.buffer, flusso.byteOffset, flusso.byteLength).toString(
        "latin1"
      )
    );
  }
  return parti.join("\n");
}

/**
 * Estrae le pagine con testo da un PDF.
 *
 * Non lancia: un file illeggibile restituisce `pagine: []` con una nota, così
 * il chiamante può distinguere "documento scaricato ma non estraibile" da un
 * errore di rete.
 */
export function estraiTestoPdf(bytes: Uint8Array): EstrazionePdf {
  const note: string[] = [];

  if (bytes.byteLength < 5) {
    return {
      pagine: [],
      pagineTotali: null,
      associazione: "ordine_flussi",
      pagineSenzaTesto: [],
      note: ["File vuoto o troppo piccolo per essere un PDF."],
    };
  }

  const grezzo = Buffer.from(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  ).toString("latin1");

  if (!grezzo.startsWith("%PDF-")) {
    return {
      pagine: [],
      pagineTotali: null,
      associazione: "ordine_flussi",
      pagineSenzaTesto: [],
      note: ["Il contenuto scaricato non è un PDF."],
    };
  }

  const oggetti = oggettiPdf(grezzo);
  const flussi = mappaFlussi(grezzo, oggetti);
  const oggettiPagina = oggetti.filter((oggetto) => {
    const dizionario = grezzo.slice(
      oggetto.inizio,
      Math.min(oggetto.fine, oggetto.inizio + 3_000)
    );
    return /\/Type\s*\/Page\b(?!s)/.test(dizionario);
  });

  // ── Associazione pagina → contenuto ──────────────────────────────────────
  if (oggettiPagina.length > 0) {
    const pagine: PaginaPdf[] = [];
    const pagineSenzaTesto: number[] = [];
    let mappaturaCompleta = true;

    for (let indice = 0; indice < oggettiPagina.length; indice += 1) {
      const oggetto = oggettiPagina[indice];
      const dizionario = grezzo.slice(
        oggetto.inizio,
        Math.min(oggetto.fine, oggetto.inizio + 3_000)
      );
      const riferimenti = riferimentiContenuto(dizionario);
      const contenuto = riferimenti.length > 0 ? testoDiOggetti(riferimenti, flussi) : null;

      if (contenuto === null) {
        mappaturaCompleta = false;
        break;
      }

      const testo = testoDaFlussoContenuto(contenuto);
      if (testo.trim().length === 0) {
        pagineSenzaTesto.push(indice + 1);
      } else {
        pagine.push({
          numero: indice + 1,
          testo: testo.slice(0, MAX_CARATTERI_PAGINA),
        });
      }
    }

    if (mappaturaCompleta) {
      if (pagine.length === 0) {
        note.push(
          "Nessun testo estraibile dalle pagine: probabile documento scansionato o protetto. OCR non eseguito."
        );
      } else if (pagineSenzaTesto.length > 0) {
        note.push(
          `Pagine senza testo estraibile: ${pagineSenzaTesto.join(", ")}.`
        );
      }

      return {
        pagine,
        pagineTotali: oggettiPagina.length,
        associazione: "pagine",
        pagineSenzaTesto,
        note,
      };
    }

    note.push(
      "Il PDF non espone i riferimenti pagina→contenuto in forma leggibile: i testi sono sezioni numerate, non pagine verificate."
    );
  } else {
    note.push(
      "Il PDF non dichiara oggetti pagina leggibili: i testi sono sezioni numerate, non pagine verificate."
    );
  }

  // ── Ripiego: ordine dei flussi, dichiarato ───────────────────────────────
  const pagine: PaginaPdf[] = [];
  const pagineSenzaTesto: number[] = [];
  for (const [numero] of flussi) {
    const flusso = flussi.get(numero);
    if (!flusso) continue;
    const testoFlusso = Buffer.from(
      flusso.buffer,
      flusso.byteOffset,
      flusso.byteLength
    ).toString("latin1");
    if (!/\bBT\b/.test(testoFlusso) || !/(Tj|TJ)/.test(testoFlusso)) continue;

    const testo = testoDaFlussoContenuto(testoFlusso).slice(0, MAX_CARATTERI_PAGINA);
    if (testo.trim().length === 0) {
      pagineSenzaTesto.push(pagine.length + 1);
      continue;
    }
    pagine.push({ numero: pagine.length + 1, testo });
  }

  if (pagine.length === 0) {
    note.push(
      "Nessun flusso di testo estraibile: probabile documento scansionato o protetto. OCR non eseguito."
    );
  }

  return {
    pagine,
    pagineTotali: oggettiPagina.length > 0 ? oggettiPagina.length : null,
    associazione: "ordine_flussi",
    pagineSenzaTesto,
    note,
  };
}
