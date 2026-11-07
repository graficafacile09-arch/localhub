import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * EVENTI WEBHOOK BLOCCATI — riparazione degli eventi rimasti in limbo.
 *
 * Il lifecycle di `pagamenti_eventi` (migration 20261012) considera
 * ritentabili gli stati `received` ed `error`; `processing` è ritentabile solo
 * dopo la scadenza del lease di 10 minuti, ma perché il recupero avvenga deve
 * arrivare una NUOVA consegna da Stripe. Se Stripe ha esaurito i retry (o
 * l'evento è stato inserito da una prova), la riga resta `processing` per
 * sempre: sembra "in elaborazione" e nessuno la vede.
 *
 * Questa riparazione riporta gli eventi fermi in `error` (stato ritentabile,
 * quindi NON distruttivo: una futura consegna può riacquisirli) con un
 * messaggio esplicito, così l'evento smette di essere invisibile. Gli eventi
 * `received` senza `event_type` (righe di prova mai processabili) vengono
 * chiusi con lo stesso criterio.
 *
 * Best-effort come il resto dei job: non lancia mai eccezioni.
 */

/** Un evento è considerato bloccato dopo 24 ore senza avanzamento. */
export const SOGLIA_EVENTO_BLOCCATO_MS = 24 * 60 * 60_000;

const MESSAGGIO_BLOCCATO =
  "Elaborazione interrotta: evento rimasto senza avanzamento oltre 24 ore. Stato ritentabile, in attesa di riconciliazione.";

export type EsitoRiparazioneEventi = {
  ok: boolean;
  riparati: number;
  errore?: string;
};

export async function riparaEventiWebhookBloccati(
  adesso: number = Date.now()
): Promise<EsitoRiparazioneEventi> {
  const soglia = new Date(adesso - SOGLIA_EVENTO_BLOCCATO_MS).toISOString();
  try {
    const db = createAdminSupabaseClient();
    const { data, error } = await db
      .from("pagamenti_eventi")
      .update({
        status: "error",
        processing_at: null,
        error: MESSAGGIO_BLOCCATO,
      })
      .in("status", ["processing", "received"])
      // `received` usa received_at, `processing` usa processing_at: la
      // condizione OR copre entrambi senza toccare gli eventi appena arrivati.
      .or(
        `and(status.eq.received,received_at.lt.${soglia}),and(status.eq.processing,processing_at.lt.${soglia})`
      )
      .select("id");

    if (error) {
      console.error("[pagamenti] riparazione eventi bloccati fallita:", error.message);
      return { ok: false, riparati: 0, errore: error.message };
    }

    const riparati = (data ?? []).length;
    if (riparati > 0) {
      console.warn(`[pagamenti] ${riparati} eventi webhook bloccati riportati in stato error`);
    }
    return { ok: true, riparati };
  } catch (err) {
    const errore = (err as Error)?.message ?? "errore sconosciuto";
    console.error("[pagamenti] riparazione eventi bloccati fallita:", errore);
    return { ok: false, riparati: 0, errore };
  }
}
