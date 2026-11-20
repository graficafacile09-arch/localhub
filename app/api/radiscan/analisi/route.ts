import { cercaBarcode } from "@/lib/radiscan/barcode";
import { CODICI_ERRORE, ErroreRadiciScan } from "@/lib/radiscan/errori";
import { creaProviderGemini } from "@/lib/radiscan/gemini";
import { creaHandlerAnalisi } from "@/lib/radiscan/handler";
import { creaMotoreOcrTesseract } from "@/lib/radiscan/ocr";
import { creaRicercaEAmbrosia } from "@/lib/radiscan/ricerca";
import { creaRicercaWebIbrida } from "@/lib/radiscan/web-tavily";
import {
  creaRepositorySupabase,
  type ClientDatiRadiciScan,
} from "@/lib/radiscan/repository";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * RadiciScan — `POST /api/radiscan/analisi`.
 *
 * Questo file è solo cablaggio: la logica vive in `lib/radiscan/handler.ts`
 * ed è testabile senza Next, senza rete e senza database.
 *
 * Sicurezza:
 * - la sessione è verificata sul server con il client SSR (cookie httpOnly);
 *   un id utente inviato dal browser non è mai accettato;
 * - il registro e le quote usano il client service-role, che resta sul server;
 * - nessuna immagine viene conservata o registrata.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// OCR + modello + documenti + web: il budget interno è 55 s.
export const maxDuration = 60;

async function utenteCorrente(): Promise<{ id: string } | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (data?.user?.id) return { id: data.user.id };

  if (error) {
    const messaggio = (error.message ?? "").toLowerCase();
    // Assenza di sessione: si prosegue come anonimi con quota ridotta.
    if (messaggio.includes("session missing") || messaggio.includes("no session")) {
      return null;
    }
    throw new ErroreRadiciScan(
      CODICI_ERRORE.SESSIONE_NON_VALIDA,
      "Sessione non valida."
    );
  }

  return null;
}

export async function POST(request: Request): Promise<Response> {
  const handler = creaHandlerAnalisi({
    utenteCorrente,
    creaRepository: () =>
      creaRepositorySupabase(
        // Confine dell'adapter: il client Supabase reale è strutturalmente
        // compatibile con la forma minima usata da RadiciScan.
        createAdminSupabaseClient() as unknown as ClientDatiRadiciScan
      ),
    creaProvider: () => creaProviderGemini(),
    // La registrazione eAmbrosia resta completa; la lettura degli allegati
    // è limitata al primo documento e a un budget breve, così non blocca
    // il risultato rapido. L'eventuale lettura parziale è dichiarata in UI.
    creaRicerca: () =>
      creaRicercaEAmbrosia({
        lettura: {
          timeoutTotaleMs: 5_000,
          timeoutDocumentoMs: 4_000,
          maxDocumenti: 1,
          maxPagine: 3,
          maxBytes: 3_000_000,
          maxCaratteriTotali: 40_000,
          concorrenza: 1,
        },
      }),
    creaOcr: () => creaMotoreOcrTesseract(),
    // Prima motori keyless rapidi; Tavily interviene soltanto se le fonti
    // gratuite non bastano a sostenere l'identificazione.
    creaWeb: () =>
      creaRicercaWebIbrida({
        maxQuery: 2,
        maxPagine: 3,
        maxFonti: 8,
        timeoutQueryMs: 3_500,
        timeoutPaginaMs: 3_500,
        timeoutRicercaMs: 5_000,
      }),
    creaBarcode: (codice) => cercaBarcode(codice),
    saleQuota: process.env.RADISCAN_QUOTA_SALT ?? null,
    // Segreto HMAC della cache: se assente il riuso è disattivato.
    segretoCache: process.env.RADISCAN_CACHE_SECRET ?? null,
  });

  return handler(request);
}
