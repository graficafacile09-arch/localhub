import type {
  EsitoScansione,
  VoceConoscenza,
  VoceConoscenzaConHash,
} from "./tipi";
import { hashTesto } from "./testo";

/** Stato di una voce già presente nell'archivio. */
export type VoceArchiviata = {
  chiave: string;
  hash: string;
  stato: "attivo" | "rimosso";
};

export type PianoAggiornamento = {
  /** Voci nuove o con testo cambiato: vanno inserite o aggiornate. */
  daScrivere: VoceConoscenzaConHash[];
  /** Chiavi archiviate attive non più presenti nella scansione: rimozione logica. */
  daRimuovere: string[];
  /** Chiavi rimosse che tornano presenti: riattivazione. */
  daRiattivare: string[];
  /** Se false, nessuna scrittura né rimozione è sicura: vedi `motivoBlocco`. */
  sicuro: boolean;
  motivoBlocco?: string;
};

/** Aggiunge l'hash del testo a ogni voce. */
export function conHash(voci: VoceConoscenza[]): VoceConoscenzaConHash[] {
  return voci.map((v) => ({ ...v, hash: hashTesto(`${v.titolo}\n${v.testo}`) }));
}

/** Esito di una singola pagina letta da una sorgente paginata. */
export type PaginaLetta<T> = {
  righe: T[];
  /** Conteggio totale dichiarato dalla sorgente (richiesto per verificare la lettura). */
  totale: number | null;
  errore?: string;
};

/**
 * Legge TUTTE le pagine di una sorgente e dimostra la completezza della lettura.
 *
 * La lettura è accettata solo se:
 * - ogni pagina è letta senza errore (un errore interrompe e lancia);
 * - la sorgente dichiara il totale (senza totale la completezza non è dimostrabile);
 * - il totale dichiarato non cambia tra una pagina e l'altra;
 * - la paginazione termina con una pagina corta (o vuota);
 * - le righe lette sono esattamente il totale dichiarato.
 *
 * In ogni altro caso lancia errore: il chiamante non deve produrre scritture
 * né rimozioni basate su una lettura parziale.
 */
export async function leggiTutteLePagine<T>(
  leggiPagina: (da: number, a: number) => Promise<PaginaLetta<T>>,
  dimensione: number
): Promise<T[]> {
  const tutte: T[] = [];
  let totaleAtteso: number | null = null;
  for (let da = 0; ; da += dimensione) {
    const pagina = await leggiPagina(da, da + dimensione - 1);
    if (pagina.errore) throw new Error(`lettura interrotta a ${da}: ${pagina.errore}`);
    if (pagina.totale === null) throw new Error("totale non dichiarato: completezza non verificabile");
    if (totaleAtteso === null) totaleAtteso = pagina.totale;
    else if (pagina.totale !== totaleAtteso) {
      throw new Error("totale cambiato durante la lettura: scansione non affidabile");
    }
    tutte.push(...pagina.righe);
    if (pagina.righe.length < dimensione) break;
  }
  if (tutte.length !== totaleAtteso) {
    throw new Error(`lettura incompleta: ${tutte.length} righe lette su ${totaleAtteso} dichiarate`);
  }
  return tutte;
}

/**
 * Confronta la scansione completa con l'archivio e decide cosa scrivere.
 *
 * Regole di sicurezza (nessuna soglia percentuale):
 * - una scansione senza `completa: true` (errore, timeout, interruzione o
 *   paginazione non verificata) non produce né scritture né rimozioni;
 * - una scansione completa che restituisce zero voci non produce rimozioni:
 *   è un'anomalia, non un contenuto davvero scomparso;
 * - solo una scansione completa e non vuota può rimuovere logicamente le
 *   voci attive archiviate che non compaiono più.
 */
export function pianificaAggiornamento(
  esito: EsitoScansione,
  archiviate: VoceArchiviata[]
): PianoAggiornamento {
  const bloccato = (motivoBlocco: string): PianoAggiornamento => ({
    daScrivere: [],
    daRimuovere: [],
    daRiattivare: [],
    sicuro: false,
    motivoBlocco,
  });

  if (!esito.ok) return bloccato(`scansione non completa: ${esito.errore}`);
  if (esito.completa !== true) return bloccato("scansione non dimostrata completa");

  const scansione = conHash(esito.voci);
  if (scansione.length === 0) return bloccato("scansione completa vuota: nessuna modifica");

  const mappa = new Map(archiviate.map((a) => [a.chiave, a]));
  const presenti = new Set(scansione.map((v) => v.chiave));

  const daScrivere = scansione.filter((v) => {
    const a = mappa.get(v.chiave);
    return !a || a.hash !== v.hash || a.stato !== "attivo";
  });

  const daRiattivare = scansione
    .filter((v) => mappa.get(v.chiave)?.stato === "rimosso")
    .map((v) => v.chiave);

  const daRimuovere = archiviate
    .filter((a) => a.stato === "attivo" && !presenti.has(a.chiave))
    .map((a) => a.chiave);

  return { daScrivere, daRimuovere, daRiattivare, sicuro: true };
}

/**
 * Filtra i risultati di ricerca escludendo le voci rimosse, così Pino non
 * risponde mai con contenuti non più presenti nel sito.
 */
export function soloAttive<T extends { chiave: string }>(
  risultati: T[],
  archiviate: VoceArchiviata[]
): T[] {
  const rimosse = new Set(
    archiviate.filter((a) => a.stato === "rimosso").map((a) => a.chiave)
  );
  return risultati.filter((r) => !rimosse.has(r.chiave));
}
