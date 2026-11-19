import { fonteDocumentata, type FonteUfficiale } from "./fonti";
import { VERSIONE_PROMPT } from "./prompt";
import { LIVELLI, type EsitoAnalisi, type Livello } from "./tipi";

/**
 * RadiciScan — cache autonoma.
 *
 * Rispecchia il vincolo della migration 20261118: chiave primaria
 * `(impronta_immagine, versione_prompt)`, scadenza predefinita 30 giorni,
 * nessuna immagine memorizzata.
 *
 * Cambiare il prompt cambia la versione e quindi la chiave: un esito
 * prodotto da istruzioni precedenti non può essere servito.
 *
 * Un esito `verificato` non è però eterno: la fonte che lo sostiene può
 * essere disattivata o modificata. Per questo la riga conserva `fonteId` e,
 * prima di riusare un verificato, `cacheVerificataAncoraValida` confronta i
 * metadati correnti con quelli registrati nell'esito.
 */

export const TTL_CACHE_GIORNI = 30;
export const TTL_CACHE_MS = TTL_CACHE_GIORNI * 24 * 60 * 60 * 1000;

const RE_IMPRONTA = /^[0-9a-f]{16}$/;
const MAX_VERSIONE_PROMPT = 64;

export interface ChiaveCache {
  improntaImmagine: string;
  versionePrompt: string;
}

export interface RigaCache {
  improntaImmagine: string;
  versionePrompt: string;
  livello: Livello;
  esito: unknown;
  /** Fonte che sostiene l'esito verificato; `null` per gli altri livelli. */
  fonteId: string | null;
  creatoIl: string;
  scadeIl: string;
}

export function creaChiaveCache(
  improntaImmagine: string,
  versionePrompt: string = VERSIONE_PROMPT
): ChiaveCache {
  if (!RE_IMPRONTA.test(improntaImmagine)) {
    throw new Error("Impronta immagine non valida: attesi 16 caratteri esadecimali.");
  }
  const versione = versionePrompt.trim();
  if (versione.length < 1 || versione.length > MAX_VERSIONE_PROMPT) {
    throw new Error("Versione prompt non valida: attesi 1-64 caratteri.");
  }
  return { improntaImmagine, versionePrompt: versione };
}

export function scadenzaCache(adesso: Date): string {
  return new Date(adesso.getTime() + TTL_CACHE_MS).toISOString();
}

export function cacheValida(riga: Pick<RigaCache, "scadeIl">, adesso: Date): boolean {
  const scadenza = new Date(riga.scadeIl).getTime();
  return Number.isFinite(scadenza) && scadenza > adesso.getTime();
}

function esitoRiusabile(valore: unknown): valore is EsitoAnalisi {
  if (valore === null || typeof valore !== "object" || Array.isArray(valore)) {
    return false;
  }
  const esito = valore as Record<string, unknown>;
  return (
    typeof esito.livello === "string" &&
    (LIVELLI as readonly string[]).includes(esito.livello) &&
    typeof esito.versionePrompt === "string"
  );
}

/**
 * Sceglie un esito riutilizzabile: stessa impronta, stessa versione del
 * prompt, non scaduto e strutturalmente valido. Altrimenti null.
 */
export function selezionaEsitoInCache(
  righe: readonly RigaCache[],
  chiave: ChiaveCache,
  adesso: Date
): EsitoAnalisi | null {
  for (const riga of righe) {
    if (riga.improntaImmagine !== chiave.improntaImmagine) continue;
    if (riga.versionePrompt !== chiave.versionePrompt) continue;
    if (!cacheValida(riga, adesso)) continue;
    if (!esitoRiusabile(riga.esito)) continue;
    if (riga.esito.versionePrompt !== chiave.versionePrompt) continue;
    return riga.esito;
  }
  return null;
}

function stessoValore(a: string | null, b: string | null): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

/**
 * Un verificato in cache resta valido solo se la fonte esiste ancora, è
 * attiva e documentata, e tutti i metadati registrati nell'esito coincidono
 * con quelli correnti. In caso contrario il chiamante deve trattare la cache
 * come non valida e rifare l'analisi.
 */
export function cacheVerificataAncoraValida(
  esito: EsitoAnalisi,
  registro: readonly FonteUfficiale[]
): boolean {
  if (esito.livello !== "verificato") return true;

  const atteso = esito.verifica.fonte;
  if (!esito.fonteId || !atteso || atteso.id !== esito.fonteId) return false;
  if (!esito.denominazioneVerificata) return false;

  const fonte = registro.find((voce) => voce.id === esito.fonteId);
  if (!fonte || !fonteDocumentata(fonte)) return false;

  return (
    stessoValore(fonte.denominazione, atteso.denominazione) &&
    stessoValore(fonte.denominazione, esito.denominazioneVerificata) &&
    fonte.schemaQualita === atteso.schemaQualita &&
    stessoValore(fonte.territorio, atteso.territorio) &&
    stessoValore(fonte.urlUfficiale, atteso.urlUfficiale) &&
    stessoValore(fonte.riferimentoNormativo, atteso.riferimentoNormativo) &&
    stessoValore(fonte.consultataIl, atteso.consultataIl)
  );
}

/** Riga pronta per l'upsert: nessun campo immagine, solo hash ed esito. */
export function creaRigaCache(
  chiave: ChiaveCache,
  esito: EsitoAnalisi,
  adesso: Date
): RigaCache {
  return {
    improntaImmagine: chiave.improntaImmagine,
    versionePrompt: chiave.versionePrompt,
    livello: esito.livello,
    esito,
    fonteId: esito.fonteId,
    creatoIl: adesso.toISOString(),
    scadeIl: scadenzaCache(adesso),
  };
}
