/**
 * VERIFICA SU WHATSAPP — pulsante nella prenotazione del cliente.
 *
 * Test PURI (senza browser, come gli altri .spec.ts puri del repo): la scelta
 * di mostrare il pulsante è `linkWhatsAppVerificaPrenotazione(...) !== ""`
 * (nel componente il pulsante è renderizzato SOLO quando il link non è vuoto).
 *
 * Verifica:
 *  1. prenotazione con numero WhatsApp → link presente (pulsante visibile);
 *  2. numero WhatsApp mancante → link vuoto (pulsante assente);
 *  3. numero corretto (normalizzazione E.164 europea);
 *  4. messaggio contiene numero prenotazione, servizio, data e ora;
 *  5. URL correttamente URL-encoded;
 *  6. prenotazione di un ALTRO negozio → si usa il numero di quel negozio,
 *     mai un numero fisso globale.
 */
import { test, expect } from "@playwright/test";
import {
  formattaDataItaliana,
  linkWhatsAppVerificaPrenotazione,
  messaggioVerificaPrenotazione,
} from "@/lib/prenotazione-verifica-whatsapp";

const DATI = {
  numero: "PR-123",
  servizio: "Visita",
  giorno: "2026-09-15",
  ora: "10:30",
};

test("1. prenotazione con numero WhatsApp → il link è presente (pulsante visibile)", () => {
  const url = linkWhatsAppVerificaPrenotazione("333 1234567", DATI);
  expect(url).not.toBe("");
  expect(url).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
});

test("2. numero WhatsApp mancante → link vuoto (pulsante assente)", () => {
  expect(linkWhatsAppVerificaPrenotazione("", DATI)).toBe("");
  expect(linkWhatsAppVerificaPrenotazione(null, DATI)).toBe("");
  expect(linkWhatsAppVerificaPrenotazione(undefined, DATI)).toBe("");
  expect(linkWhatsAppVerificaPrenotazione("   ", DATI)).toBe("");
});

test("3. numero corretto: normalizzazione E.164 italiana nel link", () => {
  // +39 333 1234567 → 393331234567
  expect(linkWhatsAppVerificaPrenotazione("+39 333 1234567", DATI)).toMatch(
    /^https:\/\/wa\.me\/393331234567\?text=/
  );
  // 333 1234567 (senza prefisso) → viene aggiunto 39
  const url = linkWhatsAppVerificaPrenotazione("333 1234567", DATI);
  const numero = new URL(url).pathname.slice(1);
  expect(numero).toBe("393331234567");
});

test("4. messaggio contiene numero prenotazione, servizio, data e ora", () => {
  const msg = messaggioVerificaPrenotazione(DATI);
  expect(msg).toContain("Prenotazione: PR-123");
  expect(msg).toContain("Servizio: Visita");
  expect(msg).toContain("Data: 15/09/2026");
  expect(msg).toContain("Ora: 10:30");
});

test("5. URL del messaggio correttamente encoded", () => {
  const url = linkWhatsAppVerificaPrenotazione("333 1234567", DATI);
  // testo RAW dal query string (searchParams.get decodifica già: qui serve
  // il valore percent-encoded per verificare l'encoding).
  const textParam = url.slice(url.indexOf("?text=") + 6);
  // decodeURIComponent dà il messaggio esatto (spazi, accenti, a-capo).
  const decoded = decodeURIComponent(textParam);
  expect(decoded).toBe(messaggioVerificaPrenotazione(DATI));
  // il parametro non contiene caratteri che su WhatsApp verrebbero letti male:
  // spazi e newline devono essere percent-encoded.
  expect(textParam).not.toContain(" ");
  expect(textParam).toContain("%0A"); // a-capo tra le righe
});

test("6. prenotazione di un ALTRO negozio → usa il numero del negozio corrente (mai un numero fisso)", () => {
  const accento = linkWhatsAppVerificaPrenotazione("+39 340 9998877", DATI);
  const negozioB = linkWhatsAppVerificaPrenotazione("+39 341 1112233", DATI);
  // due negozi diversi → due numeri diversi nel link
  expect(accento).toMatch(/wa\.me\/393409998877\?/);
  expect(negozioB).toMatch(/wa\.me\/393411112233\?/);
  expect(accento).not.toBe(negozioB);
  // nessun numero hardcoded globale: il link segue sempre il numero passato
  expect(negozioB).not.toBe(accento);
});

test("7. formattaDataItaliana converte YYYY-MM-DD in DD/MM/YYYY", () => {
  expect(formattaDataItaliana("2026-09-15")).toBe("15/09/2026");
  expect(formattaDataItaliana("2026-01-05")).toBe("05/01/2026");
  expect(formattaDataItaliana("")).toBe("");
  expect(formattaDataItaliana("datanonvalida")).toBe("datanonvalida");
});