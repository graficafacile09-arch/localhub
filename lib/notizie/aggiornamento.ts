import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { eseguiImportFonti, frequenzaScaduta, leggiFontiAttive } from "./import";

/**
 * AGGIORNAMENTO DI SICUREZZA — ripartenza automatica dell'aggregatore.
 *
 * L'import notizie dipende da uno scheduler esterno (cron-job.org); se quel
 * job viene disattivato — come accaduto quando la manutenzione ha risposto
 * 503 all'endpoint per giorni — il database resta fermo e la pagina /notizie
 * mostra notizie vecchie anche molto tempo dopo il ripristino del servizio.
 *
 * Questa funzione viene richiamata dalla pagina /notizie dentro `after()`:
 * controlla se qualche fonte attiva ha la frequenza scaduta e, solo in quel
 * caso, esegue l'import. Il costo è nullo quando le notizie sono già fresche
 * (una sola query sulle fonti), mentre un eventuale aggiornamento avviene
 * dopo la risposta HTTP, senza rallentare il visitatore.
 *
 * Non lancia mai eccezioni: è un'auto-riparazione best-effort.
 */

/** Distanza minima tra due tentativi nella stessa istanza del server. */
const INTERVALLO_MINIMO_MS = 10 * 60 * 1000;

let ultimoTentativo = 0;

export async function aggiornaNotizieSeNecessario(): Promise<void> {
  const adesso = Date.now();
  if (adesso - ultimoTentativo < INTERVALLO_MINIMO_MS) return;
  // Segna subito il tentativo: evita raffiche di import concorrenti.
  ultimoTentativo = adesso;

  try {
    const db = createAdminSupabaseClient();
    const fonti = await leggiFontiAttive(db);
    const scadute = fonti.filter((fonte) =>
      frequenzaScaduta(fonte, fonte.ultimaEsecuzione ?? null)
    );
    if (scadute.length === 0) return;

    const riepilogo = await eseguiImportFonti({ fonti: scadute, db });
    if (riepilogo.imported > 0 || riepilogo.errors > 0) {
      console.log(
        `[notizie] aggiornamento automatico: ${riepilogo.imported} nuove, ` +
          `${riepilogo.duplicati} duplicati, ${riepilogo.errors} errori`
      );
    }
  } catch (err) {
    console.error(
      "[notizie] aggiornamento automatico fallito:",
      (err as Error)?.message ?? err
    );
  }
}
