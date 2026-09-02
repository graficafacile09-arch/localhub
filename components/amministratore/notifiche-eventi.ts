/**
 * Costanti condivise del modulo Notifiche amministratore.
 *
 * Nome dell'evento window usato per propagare il conteggio "non lette"
 * dal modulo alla sidebar amministratore DOPO un'azione di lettura
 * (nessun polling, nessun Realtime: solo un aggiornamento puntuale).
 */
export const EVENTO_AGGIORNA_NOTIFICHE = "admin-notifiche-unread";