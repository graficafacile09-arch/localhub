import { inviaEmailConfermaPagamento } from "@/lib/cliente/ordine-email";
import { inviaNotificaNuovoOrdine } from "@/lib/notifiche/whatsapp";
import { inviaNotificaNuovoOrdineNtfy } from "@/lib/notifiche/ntfy";
import { notificaNuovoOrdineAdmin } from "@/lib/amministratore/notifiche";

/**
 * P4 PAYMENT-FIRST — NOTIFICHE DELL'ORDINE ONLINE CONFERMATO.
 *
 * Punto UNICO di notifica per gli ordini ONLINE creati da
 * checkout_intento_conferma (webhook provider): va chiamato SOLO dopo che la
 * RPC è riuscita e la transazione ha fatto COMMIT (ordine + righe + stock
 * convertito + sessione collegata). Copre i 4 canali esistenti:
 *   - email di conferma al cliente (ordine definitivo letto dal DB);
 *   - WhatsApp al negoziante (template/configurazione esistenti);
 *   - ntfy (topic/formato esistenti — P4: per gli online era mancante);
 *   - notifica admin.
 *
 * Ogni canale è best-effort e isolato (mai throw verso il webhook): una
 * notifica fallita NON tocca ordine/pagamento/stock né l'HTTP response —
 * coerentemente con il pattern già usato dal progetto (.catch ovunque).
 *
 * IDEMPOTENZA: l'architettura esistente garantisce un solo ordine
 * (pagamenti_eventi.event_id UNIQUE + checkout_intento_conferma idempotente
 * con lock + ordine_id). Il chiamante aggiunge la guardia
 * `!conferma.giaEsistente`: un secondo evento "paid" dello stesso pagamento
 * trova l'ordine già creato e NON duplica le notifiche.
 */
export async function notificaOrdineOnlineConfermato(
  ordineId: string
): Promise<void> {
  await inviaEmailConfermaPagamento(ordineId).catch(() => {});
  await inviaNotificaNuovoOrdine(ordineId).catch(() => {});
  await inviaNotificaNuovoOrdineNtfy(ordineId).catch(() => {});
  await notificaNuovoOrdineAdmin(ordineId).catch(() => {});
}