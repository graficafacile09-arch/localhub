/**
 * RadiciScan — fonti ufficiali e whitelist dei domini.
 *
 * UNICA FONTE DI VERITÀ DEL REGISTRO: la tabella public.radiscan_fonti,
 * popolata dalla migration supabase/migrations/20261118_radiscan_core.sql.
 * Questo file NON duplica il registro: nessuna denominazione, nessun
 * territorio e nessun riferimento normativo vive qui.
 *
 * Contiene soltanto:
 * - i tipi condivisi dal codice RadiciScan;
 * - la whitelist statica dei domini ufficiali ammessi.
 *
 * Perché una whitelist statica: l'AI non deve poter proporre un URL
 * qualsiasi come "fonte". Prima di mostrare o registrare una fonte,
 * `isUrlFonteUfficiale` verifica protocollo, host e forma dell'URL; un URL
 * fuori whitelist non può sostenere il livello VERIFICATO.
 *
 * I domini elencati sono esclusivamente quelli delle fonti registrate nella
 * migration: aggiungere una fonte significa aggiornare la migration e questo
 * elenco insieme. Il test di coerenza previsto in FASE 2B fallisce se i due
 * elenchi divergono.
 */

/** Schemi di qualità riconosciuti dal servizio. */
export const SCHEMI_QUALITA = [
  "DOP",
  "IGP",
  "STG",
  "DOC",
  "DOCG",
  "IGT",
  "PAT",
  "DECO",
] as const;

export type SchemaQualita = (typeof SCHEMI_QUALITA)[number];

/**
 * `registro`: pagina ufficiale che elenca più denominazioni.
 * `denominazione`: singola denominazione con territorio e atto di
 * registrazione verificati manualmente.
 */
export const TIPI_ATTO_FONTE = ["registro", "denominazione"] as const;

export type TipoAttoFonte = (typeof TIPI_ATTO_FONTE)[number];

/**
 * Domini ufficiali ammessi per le fonti RadiciScan.
 * Confronto esatto sull'hostname: nessun sottodominio implicito.
 */
export const DOMINI_UFFICIALI = [
  "ec.europa.eu",
  "www.masaf.gov.it",
  "www.regione.calabria.it",
  "www.arsacweb.it",
] as const;

export type DominioUfficiale = (typeof DOMINI_UFFICIALI)[number];

/** Riga di `public.radiscan_fonti` come letta dall'applicazione. */
export interface FonteUfficiale {
  id: string;
  slug: string;
  denominazione: string;
  tipoAtto: TipoAttoFonte;
  /** Obbligatorio quando `tipoAtto` è `denominazione`. */
  schemaQualita: SchemaQualita | null;
  /** Obbligatorio quando `tipoAtto` è `denominazione`. */
  territorio: string | null;
  ente: string;
  urlUfficiale: string;
  /** Estremo normativo esplicito: senza di esso non c'è verifica. */
  riferimentoNormativo: string;
  /** Data ISO (YYYY-MM-DD) dell'ultima verifica manuale. */
  consultataIl: string;
  attiva: boolean;
}

/** Dominio ufficiale della whitelist, oppure `null`. */
export function dominioUfficiale(hostname: string): DominioUfficiale | null {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  const trovato = (DOMINI_UFFICIALI as readonly string[]).includes(host);
  return trovato ? (host as DominioUfficiale) : null;
}

/**
 * True solo per un URL https assoluto, senza credenziali, porta o frammento,
 * il cui host è esattamente uno dei domini ufficiali ammessi.
 *
 * Non esegue richieste di rete e non segue redirect: è un controllo di
 * forma, il controllo di contenuto resta alla verifica documentale.
 */
/**
 * Predicato di documentabilità: replica i controlli del trigger
 * `radiscan_valida_fonte_analisi` della migration 20261118.
 *
 * Una fonte che non li supera non può sostenere il livello VERIFICATO:
 * serve una denominazione ufficiale ATTIVA e COMPLETA (territorio, schema,
 * URL ufficiale, riferimento normativo, data di consultazione).
 */
export function fonteDocumentata(
  fonte: FonteUfficiale | null | undefined
): boolean {
  if (!fonte) return false;
  return (
    fonte.tipoAtto === "denominazione" &&
    fonte.attiva === true &&
    typeof fonte.territorio === "string" &&
    fonte.territorio.trim().length > 0 &&
    fonte.schemaQualita !== null &&
    isUrlFonteUfficiale(fonte.urlUfficiale) &&
    typeof fonte.riferimentoNormativo === "string" &&
    fonte.riferimentoNormativo.trim().length > 3 &&
    typeof fonte.consultataIl === "string" &&
    fonte.consultataIl.trim().length > 0
  );
}

export function isUrlFonteUfficiale(valore: string | null | undefined): boolean {
  if (typeof valore !== "string" || valore.trim() === "") return false;

  let url: URL;
  try {
    url = new URL(valore.trim());
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  if (url.port !== "") return false;
  if (url.hash !== "") return false;

  return dominioUfficiale(url.hostname) !== null;
}
