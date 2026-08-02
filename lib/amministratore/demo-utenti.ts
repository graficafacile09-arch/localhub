import type { Utente } from "./types";

/**
 * Dati DEMO del modulo Utenti (/amministratore/utenti).
 * Solo pochi record realistici: serviranno a mostrare la grafica finché il
 * modulo non verrà collegato al database (fase successiva).
 */
export const utentiDemo: Utente[] = [
  {
    id: "usr_001",
    nome: "Giulia Ferrari",
    email: "giulia.ferrari@localhub.it",
    ruolo: "amministratore",
    stato: "attivo",
    ultimoAccesso: "2026-08-01T09:42:00.000Z",
    registratoIl: "2025-11-03T10:00:00.000Z",
  },
  {
    id: "usr_002",
    nome: "Marco Bianchi",
    email: "marco.bianchi@localhub.it",
    ruolo: "amministratore",
    stato: "attivo",
    ultimoAccesso: "2026-07-30T17:15:00.000Z",
    registratoIl: "2025-12-10T09:30:00.000Z",
  },
  {
    id: "usr_003",
    nome: "Alessia Romano",
    email: "alessia@panificioromano.it",
    ruolo: "commerciante",
    stato: "attivo",
    ultimoAccesso: "2026-08-02T07:58:00.000Z",
    negozi: 1,
    registratoIl: "2026-01-15T14:20:00.000Z",
  },
  {
    id: "usr_004",
    nome: "Luca Esposito",
    email: "luca.esposito@lucastyle.it",
    ruolo: "commerciante",
    stato: "attivo",
    ultimoAccesso: "2026-07-29T12:05:00.000Z",
    negozi: 2,
    registratoIl: "2026-02-02T11:00:00.000Z",
  },
  {
    id: "usr_005",
    nome: "Sara Conti",
    email: "sara.conti@example.com",
    ruolo: "utente",
    stato: "attivo",
    ultimoAccesso: "2026-07-25T19:33:00.000Z",
    registratoIl: "2026-04-18T16:45:00.000Z",
  },
  {
    id: "usr_006",
    nome: "Davide Greco",
    email: "davide.greco@example.com",
    ruolo: "utente",
    stato: "disattivato",
    ultimoAccesso: "2026-03-12T10:10:00.000Z",
    registratoIl: "2026-03-01T08:00:00.000Z",
  },
];
