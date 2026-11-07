import { timingSafeEqual } from "node:crypto";
import { apiError, apiOk } from "@/lib/api/response";
import {
  elaboraPagamentiScadutiDettagli,
} from "@/lib/pagamenti/sessioni";
import { riparaEventiWebhookBloccati } from "@/lib/pagamenti/eventi-bloccati";

/**
 * GET /api/cron/pagamenti-scaduti
 *
 * Sweep dei pagamenti scaduti + riparazione degli eventi webhook rimasti
 * bloccati. È registrato come cron Vercel giornaliero (vercel.json) e resta
 * richiamabile dal vecchio scheduler esterno: entrambi sono idempotenti.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expected = Buffer.from(secret);
  const received = Buffer.from(token);

  if (
    !secret ||
    !token ||
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return apiError("UNAUTHORIZED", "Autorizzazione cron non valida.", 401);
  }

  const result = await elaboraPagamentiScadutiDettagli();
  // Indipendente dallo sweep: riporta in stato ritentabile gli eventi
  // webhook fermi da oltre 24 ore (altrimenti invisibili).
  const eventi = await riparaEventiWebhookBloccati();

  if (!result.ok) {
    return apiError("SWEEP_FAILED", "Impossibile completare lo sweep dei pagamenti scaduti.", 503, {
      candidati: result.candidati,
      processati: result.processati,
      falliti: result.falliti,
      eventiWebhookRiparati: eventi.ok ? eventi.riparati : null,
    });
  }

  return apiOk(
    {
      candidati: result.candidati,
      processati: result.processati,
      falliti: result.falliti,
      eventiWebhookRiparati: eventi.ok ? eventi.riparati : null,
    },
    200
  );
}
