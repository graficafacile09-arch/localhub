import { apiError, apiOk } from "@/lib/api/response";
import { creaOrdine, type CreaOrdineInput } from "@/lib/cliente/orders";

/**
 * API Ordini — Area Clienti.
 *
 * POST /api/cliente/ordini
 * Crea un ordine realmente salvato su Supabase (ordini + ordini_righe).
 *
 * Il checkout è pubblico (nessuna sessione richiesta): l'acquisto avviene
 * dalla pagina prodotto senza login. Il payload contiene i dati del cliente
 * e la chiave di idempotenza generata dal client (anti doppio invio).
 *
 * Validazioni lato server:
 *   - input ben formato;
 *   - negozio esiste, attivo, non cestinato;
 *   - prodotto esiste, attivo e appartiene al negozio;
 *   - prezzo e disponibilità letti DAL DATABASE;
 *   - totale calcolato dal server (mai fidarsi del client).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  // Validazione esplicita dei valori: mai default silenziosi su valori non
  // validi (un input sbagliato va rifiutato, non riadattato).
  const modalita: "ritiro" | "spedizione" | null =
    body.modalita === "ritiro" ? "ritiro" : body.modalita === "spedizione" ? "spedizione" : null;
  if (!modalita) {
    return apiError("VALIDATION_ERROR", "Modalità di consegna non valida.", 422);
  }
  const clienteRaw = (body.cliente ?? {}) as Record<string, unknown>;
  const ritiroRaw = (body.ritiro ?? {}) as Record<string, unknown>;
  const spedizioneRaw = (body.spedizione ?? {}) as Record<string, unknown>;

  if (
    spedizioneRaw.metodoSpedizione !== undefined &&
    spedizioneRaw.metodoSpedizione !== "standard" &&
    spedizioneRaw.metodoSpedizione !== "express"
  ) {
    return apiError("VALIDATION_ERROR", "Metodo di spedizione non valido.", 422);
  }
  if (
    spedizioneRaw.metodoPagamento !== undefined &&
    spedizioneRaw.metodoPagamento !== "carta" &&
    spedizioneRaw.metodoPagamento !== "paypal" &&
    spedizioneRaw.metodoPagamento !== "bonifico"
  ) {
    return apiError("VALIDATION_ERROR", "Metodo di pagamento non valido.", 422);
  }

  const input: CreaOrdineInput = {
    idempotencyKey:
      typeof body.idempotencyKey === "string" ? body.idempotencyKey : "",
    prodottoId:
      typeof body.prodottoId === "string" || typeof body.prodottoId === "number"
        ? String(body.prodottoId)
        : "",
    quantita: Number(body.quantita),
    modalita,
    cliente: {
      nome: typeof clienteRaw.nome === "string" ? clienteRaw.nome : "",
      cognome: typeof clienteRaw.cognome === "string" ? clienteRaw.cognome : "",
      telefono:
        typeof clienteRaw.telefono === "string" ? clienteRaw.telefono : null,
      email: typeof clienteRaw.email === "string" ? clienteRaw.email : null,
    },
    ritiro:
      modalita === "spedizione"
        ? null
        : {
            data: typeof ritiroRaw.data === "string" ? ritiroRaw.data : null,
            fascia: typeof ritiroRaw.fascia === "string" ? ritiroRaw.fascia : null,
          },
    spedizione:
      modalita === "spedizione"
        ? {
            indirizzo: typeof spedizioneRaw.indirizzo === "string" ? spedizioneRaw.indirizzo : "",
            cap: typeof spedizioneRaw.cap === "string" ? spedizioneRaw.cap : "",
            citta: typeof spedizioneRaw.citta === "string" ? spedizioneRaw.citta : "",
            provincia: typeof spedizioneRaw.provincia === "string" ? spedizioneRaw.provincia : "",
            note: typeof spedizioneRaw.note === "string" ? spedizioneRaw.note : null,
            metodoSpedizione:
              spedizioneRaw.metodoSpedizione === "express" ? "express" : "standard",
            metodoPagamento:
              spedizioneRaw.metodoPagamento === "paypal"
                ? "paypal"
                : spedizioneRaw.metodoPagamento === "bonifico"
                  ? "bonifico"
                  : "carta",
          }
        : null,
    note: typeof body.note === "string" ? body.note : null,
  };

  const esito = await creaOrdine(input);

  if (!esito.ok) {
    return apiError(esito.codice, esito.errore, esito.status);
  }

  return apiOk({ ordine: esito.ordine, giaEsistente: esito.giaEsistente }, esito.giaEsistente ? 200 : 201);
}
