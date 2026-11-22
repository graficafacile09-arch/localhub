import { cercaBarcode } from "@/lib/radiscan/barcode";
import {
  cookieSessioneRadiciScan,
  creaTokenSessioneRadiciScan,
  hashTokenSessioneRadiciScan,
  leggiTokenSessioneRadiciScan,
} from "@/lib/radiscan/sessione-anonima";
import { CODICI_ERRORE, ErroreRadiciScan } from "@/lib/radiscan/errori";
import { creaProviderVisionProdotti } from "@/lib/radiscan/provider-vision-prodotti";
import { creaHandlerAnalisi } from "@/lib/radiscan/handler";
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
// Il timeout interno dell'handler è 18 s, così una richiesta lenta chiude con
// 504 JSON prima che la piattaforma uccida la funzione a 30 s.
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
  const tokenEsistente = leggiTokenSessioneRadiciScan(request);
  const tokenSessione = tokenEsistente ?? creaTokenSessioneRadiciScan();
  const sessioneHash = hashTokenSessioneRadiciScan(tokenSessione);
  const handler = creaHandlerAnalisi({
    utenteCorrente,
    creaRepository: () =>
      creaRepositorySupabase(
        // Confine dell'adapter: il client Supabase reale è strutturalmente
        // compatibile con la forma minima usata da RadiciScan.
        createAdminSupabaseClient() as unknown as ClientDatiRadiciScan
      ),
    creaProvider: () => creaProviderVisionProdotti(),
    // eAmbrosia: si amplia il tempo della ricerca e si legge la documentazione
    // ufficiale entro un budget separato, compatibile con i 18 s dell'handler.
    // Prima il disciplinare, poi il riepilogo italiano; gli altri riepiloghi
    // restano consultabili dal link ufficiale ma non rallentano la scansione.
    creaRicerca: () =>
      creaRicercaEAmbrosia({
        // Le chiamate `namelike` impiegano circa 7 s: 9 s lasciano margine
        // senza superare i 18 s dell'handler con la lettura documentale.
        timeoutMs: 9_000,
        lettura: {
          timeoutTotaleMs: 6_500,
          timeoutDocumentoMs: 5_500,
          maxDocumenti: 2,
          maxPagine: 40,
          maxBytes: 15_000_000,
          maxCaratteriTotali: 180_000,
          concorrenza: 2,
        },
      }),
    creaWeb: () => creaRicercaWebIbrida(),
    // Ricerca web multifonte in parallelo a eAmbrosia: prima motori gratuiti,
    // Tavily solo se configurato e se i risultati gratuiti non bastano.
    // Il riconoscimento visivo resta indipendente e invariato.
    creaBarcode: (codice) => cercaBarcode(codice),
    saleQuota: process.env.RADISCAN_QUOTA_SALT ?? null,
    // Segreto HMAC della cache: se assente il riuso è disattivato.
    segretoCache: process.env.RADISCAN_CACHE_SECRET ?? null,
    sessioneAnonimaHash: () => sessioneHash,
  });

  const risposta = await handler(request);
  if (tokenEsistente) return risposta;

  const intestazioni = new Headers(risposta.headers);
  intestazioni.append("Set-Cookie", cookieSessioneRadiciScan(tokenSessione));
  return new Response(risposta.body, {
    status: risposta.status,
    statusText: risposta.statusText,
    headers: intestazioni,
  });
}
