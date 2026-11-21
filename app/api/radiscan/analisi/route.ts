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
// Percorso rapido: riconoscimento visivo + verifica sul registro ufficiale.
export const maxDuration = 30;

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
    // La ricerca eAmbrosia resta nel percorso principale: è la verifica ufficiale
    // necessaria per lo stato della denominazione. La lettura dei PDF è esclusa
    // dal percorso sincrono per non trattenere il riconoscimento.
    creaRicerca: () => creaRicercaEAmbrosia({ lettura: false }),
    // OCR e ricerca web tornano come verifiche ausiliarie: partono in parallelo
    // al riconoscimento e non determinano da sole il successo dell'analisi.
    creaOcr: () => creaMotoreOcrTesseract(),
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
