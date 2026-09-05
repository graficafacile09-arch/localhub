import { timingSafeEqual } from "node:crypto";
import { apiError, apiOk } from "@/lib/api/response";
import {
  elaboraPagamentiScadutiDettagli,
} from "@/lib/pagamenti/sessioni";

/**
 * GET /api/cron/pagamenti-scaduti
 *
 * Independent payment-expiration sweep. This endpoint is intentionally not
 * registered as a Vercel cron: it is called by the existing external scheduler.
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
  if (!result.ok) {
    return apiError("SWEEP_FAILED", "Impossibile completare lo sweep dei pagamenti scaduti.", 503, {
      candidati: result.candidati,
      processati: result.processati,
      falliti: result.falliti,
    });
  }

  return apiOk(
    {
      candidati: result.candidati,
      processati: result.processati,
      falliti: result.falliti,
    },
    200
  );
}
