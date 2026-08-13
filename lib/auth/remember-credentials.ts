/**
 * "RICORDAMI" — ripristino delle credenziali nel form di login.
 *
 * Quando l'utente spunta "Ricordami" e accede, salviamo in `localStorage`
 * SOLO l'email e la password digitate, così al ritorno sulla pagina di login
 * (es. dopo il logout) i campi vengono ricompilati automaticamente.
 *
 * NOTA: riguarda ESCLUSIVAMENTE il form, non la sessione. La sessione di
 * autenticazione (Supabase) resta invariata e il logout continua a funzionare
 * normalmente. Il dato non viene MAI inviato al database.
 *
 * Sicurezza: la password viene conservata in chiaro nel localStorage del
 * browser (accessibile solo da questo stesso sito). Si pulisce quando l'utente
 * accede senza "Ricordami" o lo disattiva esplicitamente.
 */

const STORAGE_KEY = "lh_ricordami_credenziali";

export type CredenzialiRicordate = {
  email: string;
  password: string;
};

export function leggiCredenzialiRicordate(): CredenzialiRicordate | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CredenzialiRicordate>;
    if (typeof parsed.email === "string" && typeof parsed.password === "string") {
      return { email: parsed.email, password: parsed.password };
    }
  } catch {
    /* localStorage non disponibile o dato corrotto → nessuna credenziale */
  }
  return null;
}

export function salvaCredenzialiRicordate(credenziali: CredenzialiRicordate) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(credenziali));
  } catch {
    /* localStorage non disponibile → nessun salvataggio */
  }
}

export function cancellaCredenzialiRicordate() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
