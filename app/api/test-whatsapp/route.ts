import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { normalizzaNumeroWhatsApp } from "@/lib/telefono";
import { inviaNotificaConfigurata } from "@/lib/notifiche/whatsapp";

/**
 * GET /api/test-whatsapp
 *
 * TEST REALE (SOLO admin) — invia un messaggio WhatsApp di prova tramite il
 * message template `nuovo_ordine_incitta`, usando le ENV reali
 * (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID). Utile per verificare
 * che template e token funzionino end-to-end senza toccare gli ordini.
 *
 * Parametri (opzionali):
 *   ?to=393519501328   — numero di destinazione (default: 393519501328)
 *
 * L'endpoint è protetto da requireApiArea("admin"): solo una sessione admin
 * autenticata può triggerare l'invio (mai esposto a chiamate anonime).
 * Best-effort: la risposta è l'esito di Meta, senza mai esporre il token.
 */
export async function GET(request: Request) {
  const { error } = await requireApiArea("admin");
  if (error) return error;

  const url = new URL(request.url);
  const destinatarioRaw = url.searchParams.get("to")?.trim() ?? "393519501328";
  const destinatario = normalizzaNumeroWhatsApp(destinatarioRaw);
  if (!destinatario) {
    return apiError("VALIDATION_ERROR", "Numero di destinazione non valido.", 422);
  }

  const risultato = await inviaNotificaConfigurata(
    {
      enabled: process.env.WHATSAPP_ENABLED !== "false",
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
      apiVersion: process.env.WHATSAPP_API_VERSION ?? "v23.0",
      accettaWhatsapp: true,
      numeroDestinatario: destinatario,
    },
    {
      numero: "TEST-001",
      negozioNome: "InCittà",
      totale: 12.9,
      modalita: "ritiro",
      clienteNome: "Domenico",
      clienteCognome: "Test",
      clienteTelefono: "393519501328",
      ritiroData: "26/08/2026",
      ritiroFascia: "10:00-12:00",
      spedizioneIndirizzo: null,
      spedizioneCap: null,
      spedizioneCitta: null,
      spedizioneProvincia: null,
      righe: [
        {
          nomeProdotto: "Prodotto di test",
          quantita: 2,
        },
      ],
    }
  );

  return apiOk(risultato);
}