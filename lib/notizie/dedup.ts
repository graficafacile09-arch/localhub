import { createHash } from "node:crypto";

/**
 * DEDUP — identificatori stabili di una notizia (P1).
 *
 * La causa storica dei duplicati era un'unica chiave basata SOLO sul titolo
 * (`dedup_hash`): quando una fonte (es. Google News) faceva mutare titolo,
 * guid o URL dello stesso articolo, nessun controllo scattava e la notizia
 * veniva reinserita a ogni esecuzione del cron.
 *
 * Qui si definiscono TRE chiavi complementari, ciascuna con un vincolo
 * UNIQUE dedicato nel database:
 *
 *   - url_hash           → SHA-256 della URL canonica normalizzata (vedi
 *     normalizzaUrlCanonica). Blocca lo stesso articolo quando cambia solo
 *     il titolo o i parametri di tracking.
 *   - ext_hash           → SHA-256 di "source_name | external_id". Blocca lo
 *     stesso articolo ritrovato da più fonti (es. le due query Google News)
 *     o riproposto dalla stessa fonte con lo stesso guid.
 *   - titolo_fonte_hash  → SHA-256 di "source_name | titolo normalizzato"
 *     (con rimozione del suffisso "- / · / • <testata>"). È l'hash
 *     deterministico di fallback che intercetta lo stesso articolo quando
 *     Google muta insieme guid E URL e il titolo cambia solo leggermente.
 *
 * IMPORTANTE: queste funzioni sono lo SPECCHIO ESATTO della normalizzazione
 * SQL usata nel backfill della migration 20261002_p1_notizie_deduplicazione.sql.
 * Se una di esse cambia, va aggiornata anche la migration (e viceversa):
 * il backfill deve produrre gli stessi hash dell'inserimento via RPC.
 */

/** Parametri di tracking rimossi dalla URL canonica (elenco conservativo). */
const PARAMETRI_TRACKING =
  "oc|utm_source|utm_medium|utm_campaign|utm_term|utm_content|fbclid|gclid|gclsrc|" +
  "ref|ref_src|mkt_tok|mc_cid|mc_eid|yclid|twclid|igshid|msclkid|" +
  "pk_source|pk_medium|pk_campaign|pk_keyword|pk_content";

/** Regex condivisa per la rimozione dei parametri di tracking. */
const RE_PARAMETRI_TRACKING = new RegExp(
  `([?&])(${PARAMETRI_TRACKING})=[^&#]*`,
  "gi"
);

/**
 * Normalizza una URL in forma canonica per la dedup:
 * - trim + lowercase;
 * - rimozione del frammento (#...);
 * - rimozione dei parametri di tracking (il separatore ?/& viene CONSERVATO,
 *   poi i separatori vengono ricollassati: `?&` → `?`, `&&` → `&`);
 * - rimozione di ?/& finali;
 * - rimozione dello slash finale di pathname (prima di ?, # o fine).
 *
 * Specchio SQL: `_p1_normalizza_url` nella migration P1.
 */
export function normalizzaUrlCanonica(raw: string): string {
  let s = String(raw ?? "").trim().toLowerCase();
  const hashIdx = s.indexOf("#");
  if (hashIdx !== -1) s = s.slice(0, hashIdx);
  s = s.replace(RE_PARAMETRI_TRACKING, "$1");
  s = s.replace(/\?&+/g, "?").replace(/&{2,}/g, "&");
  s = s.replace(/[?&]+$/g, "");
  s = s.replace(/\/(?=[?#]|$)/g, "");
  return s;
}

/** SHA-256 della URL canonica (chiave `url_hash`). */
export function calcolaUrlHash(url: string): string {
  return createHash("sha256").update(normalizzaUrlCanonica(url)).digest("hex");
}

/**
 * SHA-256 di "source_name | external_id" (chiave `ext_hash`).
 * Ritorna null quando l'external_id manca (nessuna chiave da vincolare).
 * Specchio SQL: backfill P1 (`digest(lower(trim(source_name)) || '|' || trim(external_id), 'sha256')`).
 */
export function calcolaExtHash(
  sourceName: string,
  externalId: string | null
): string | null {
  if (!externalId || !externalId.trim()) return null;
  const src = String(sourceName ?? "").trim().toLowerCase();
  return createHash("sha256")
    .update(`${src}|${externalId.trim()}`)
    .digest("hex");
}

/** Mappa accenti 1:1 (identica alla `translate` SQL del backfill P1). */
const MAPPA_ACCENTI_IN =
  "àáâãäåāăąçćĉċčèéêëēĕėęìíîïīĩñńòóôõöōŏőùúûüūũýÿžźżđøðł";
const MAPPA_ACCENTI_OUT =
  "aaaaaaaaacccccceeeeeeeeiiiiiiinnoooooooouuuuuuuyyzzzdodl";

/**
 * Normalizza un titolo in forma ridotta per l'hash:
 * lowercase → ß/æ/œ/þ → mappa accenti 1:1 → solo [a-z0-9] (spazio come
 * separatore) → trim.
 * Specchio SQL: `_p1_normalizza_titolo` nella migration P1.
 */
export function normalizzaTitolo(title: string): string {
  let s = String(title ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/þ/g, "th");
  s = s
    .split("")
    .map((c) => {
      const i = MAPPA_ACCENTI_IN.indexOf(c);
      return i >= 0 ? MAPPA_ACCENTI_OUT[i] : c;
    })
    .join("");
  return s.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Rimuove dal titolo il suffisso della testata: " - <testata>",
 * " · <testata>", " • <testata>" (case-insensitive, solo in coda).
 * Specchio SQL: `regexp_replace(lower(title), '\s*(?:-|·|•)\s*' || lower(src) || '\s*$', '', 'i')`.
 */
export function rimuoviSuffissoTestata(
  title: string,
  sourceName: string | null | undefined
): string {
  const t = String(title ?? "").trim();
  const src = sourceName?.trim();
  if (!t || !src) return t;
  const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\s*(?:-|·|•)\\s*${escaped}\\s*$`, "i");
  return t.replace(re, "").trim();
}

/**
 * SHA-256 di "source_name | titolo normalizzato" (chiave `titolo_fonte_hash`).
 * Il suffisso della testata viene rimosso prima dell'hash, così lo stesso
 * articolo è riconosciuto anche se il feed cambia il formato del suffisso.
 */
export function calcolaTitoloFonteHash(
  sourceName: string,
  title: string
): string {
  const src = String(sourceName ?? "").trim().toLowerCase();
  const titolo = normalizzaTitolo(rimuoviSuffissoTestata(title, sourceName));
  return createHash("sha256").update(`${src}|${titolo}`).digest("hex");
}