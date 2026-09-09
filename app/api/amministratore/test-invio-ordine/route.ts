import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { eseguiTestInvioOrdine } from "@/lib/amministratore/test-invio-ordine";
import { normalizzaNumeroWhatsApp } from "@/lib/telefono";

/**
 * GET /api/amministratore/test-invio-ordine
 *
 * TEST INVIO ORDINE (SOLO admin) — verifica end-to-end le notifiche di un
 * ordine (email + WhatsApp + ntfy + notifica admin) SENZA creare un ordine
 * reale, SENZA modificare lo stock e SENZA generare un pagamento reale.
 *
 * L'endpoint NON tocca il flusso checkout cliente (payment-first invariato):
 * usa un ordine SINTETICO marcato TEST e le stesse funzioni di notifica del
 * flusso ordini. Nessuna credenziale del cliente: i destinatari sono
 * esplicitamente forniti dall'admin e vincolati alle whitelist di test.
 *
 * Parametri (opzionali, entrambi passano dalle whitelist):
 *   ?email=destinatario@esempio.it   — whitelist TEST_EMAIL_ADDRESSES
 *   ?telefono=3935...                — whitelist TEST_WHATSAPP_NUMBERS
 *
 * Risposta: report per canale con esito esatto (cosa è stato eseguito e
 * cosa no) + garanzie strutturali ordineCreato=false, stockModificato=false,
 * pagamentoCreato=false.
 *
 * Sicurezza: requireApiArea("admin") PRIMA di qualunque operazione;
 * whitelist esplicite sui destinatari (mai invii a numeri/email arbitrari);
 * nessun segreto nei log o nella risposta.
 */
export async function GET(request: Request) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const url = new URL(request.url);
  const emailRaw = url.searchParams.get("email")?.trim() ?? "";
  const telefonoRaw = url.searchParams.get("telefono")?.trim() ?? "";

  // ── Email: formato + whitelist TEST_EMAIL_ADDRESSES ─────────────────────
  let email: string | null = null;
  if (emailRaw) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      return apiError("VALIDATION_ERROR", "Indirizzo email non valido.", 422);
    }
    const whitelistEmail = (process.env.TEST_EMAIL_ADDRESSES ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (whitelistEmail.length > 0 && !whitelistEmail.includes(emailRaw.toLowerCase())) {
      return apiError(
        "FORBIDDEN",
        "Destinatario email non autorizzato per il test. Configurare TEST_EMAIL_ADDRESSES.",
        403
      );
    }
    email = emailRaw;
  }

  // ── Telefono: formato + whitelist TEST_WHATSAPP_NUMBERS ─────────────────
  let telefono: string | null = null;
  if (telefonoRaw) {
    const normalizzato = normalizzaNumeroWhatsApp(telefonoRaw);
    if (!normalizzato) {
      return apiError("VALIDATION_ERROR", "Numero WhatsApp non valido.", 422);
    }
    const whitelistTelefono = (process.env.TEST_WHATSAPP_NUMBERS ?? "")
      .split(",")
      .map((n) => normalizzaNumeroWhatsApp(n.trim()))
      .filter(Boolean);
    if (whitelistTelefono.length > 0 && !whitelistTelefono.includes(normalizzato)) {
      return apiError(
        "FORBIDDEN",
        "Destinatario WhatsApp non autorizzato per il test. Configurare TEST_WHATSAPP_NUMBERS.",
        403
      );
    }
    telefono = normalizzato;
  }

  const report = await eseguiTestInvioOrdine({ email, telefono });
  return apiOk(report);
}