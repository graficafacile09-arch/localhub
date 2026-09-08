import { apiError, apiOk } from "@/lib/api/response";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { orderAccessCookieName } from "@/lib/cliente/order-access";
import { caricaIntentoRetry, intentoAutorizzato } from "@/lib/pagamenti/sessioni";

/**
 * GET /api/pagamenti/sessioni/[checkoutId]
 *
 * Stato minimo di un checkout PAYMENT-FIRST (intento senza ordine) per la UX
 * della pagina risultato (polling webhook ritardato, P5). Restituisce SOLO i
 * dati necessari alla pagina: status, provider e ordine collegato (se la
 * conferma P2 è avvenuta). MAI checkout_payload, secret, credenziali o dati
 * sensibili.
 *
 * Autorizzazione (fail-closed): proprietario autenticato (clienteUserId dello
 * snapshot) OPPURE token guest firmato e scoped a questo checkout (cookie
 * httpOnly impostato dal checkout, o ?token= della return URL).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ checkoutId: string }> }
) {
  const { checkoutId } = await context.params;

  const intento = await caricaIntentoRetry(checkoutId);
  if (!intento) {
    return apiError("CHECKOUT_NON_TROVATO", "Checkout non trovato.", 404);
  }

  const utente = await getCurrentUser();
  const token = (await cookies()).get(orderAccessCookieName(checkoutId))?.value ?? null;
  const autorizzato = await intentoAutorizzato(checkoutId, {
    userId: utente?.id ?? null,
    token: utente ? null : token,
  });
  if (!autorizzato) {
    return apiError("CHECKOUT_NON_TROVATO", "Checkout non trovato.", 404);
  }

  return apiOk({
    checkout: {
      status: intento.status,
      provider: intento.provider,
      ordineId: intento.ordineId,
    },
  });
}