/**
 * "RICORDAMI" — persistenza della sessione di autenticazione.
 *
 * Il login (cliente / venditore / amministrazione) condivide un unico
 * meccanismo Supabase Auth gestito da @supabase/ssr: i cookie di sessione
 * (access token + refresh token) vengono scritti con `maxAge` (400 giorni) e
 * quindi sopravvivono al riavvio del browser.
 *
 * Con "Ricordami" NON selezionato trasformiamo quei cookie in cookie di
 * sessione (senza maxAge/expires): il browser li elimina alla chiusura.
 * La scelta viene registrata nel cookie non sensibile "lh_remember", così
 * anche i refresh successivi (middleware) mantengono la stessa persistenza.
 *
 * Questo modulo è puro e privo di import Node.js: può essere usato sia nei
 * route handler sia nel middleware/proxy (runtime edge).
 */

/** Nome del cookie che registra la scelta "Ricordami" ("1" persistente, "0" no). */
export const REMEMBER_COOKIE = "lh_remember";

/** Valore usato per "Ricordami" selezionato (sessione persistente). */
export const REMEMBER_PERSIST = "1";

/** Durata del cookie persistente, allineata al default di @supabase/ssr (400gg). */
const REMEMBER_MAX_AGE = 400 * 24 * 60 * 60;

/**
 * Opzioni del cookie lh_remember:
 * - persistente (maxAge 400gg) quando "Ricordami" è selezionato;
 * - cookie di sessione (senza maxAge) quando NON è selezionato.
 */
export function rememberCookieOptions(persist: boolean) {
  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  return persist ? { ...base, maxAge: REMEMBER_MAX_AGE } : base;
}

/**
 * Rimuove la persistenza (maxAge/expires positivi) da una serie di opzioni
 * cookie, trasformandoli in cookie di sessione. I cookie di cancellazione
 * (maxAge 0) restano invariati.
 */
export function senzaPersistenza(options: Record<string, unknown>) {
  const opts = { ...options };
  if (typeof opts.maxAge === "number" && opts.maxAge > 0) {
    delete opts.maxAge;
    delete opts.expires;
  }
  return opts;
}
