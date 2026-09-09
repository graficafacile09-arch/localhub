/**
 * TEST INVIO ORDINE — servizio dedicato (solo admin).
 *
 * Verifica end-to-end delle NOTIFICHE di un ordine SENZA creare un ordine
 * reale, SENZA modificare lo stock e SENZA generare un pagamento reale.
 *
 * Differenze fondamentali rispetto al flusso ordini cliente:
 *   - NESSUNA scrittura in `ordini` / `ordini_righe`;
 *   - NESSUN decremento/riserva di stock (prodotti/prodotto_varianti);
 *   - NESSUNA sessione/pagamento provider;
 *   - un ordine SINTETICO, chiaramente identificato come TEST
 *     (numero "TEST-…", negozio "NEGOZIO DI TEST"), usato SOLO per
 *     comporre i messaggi dei canali;
 *   - ogni canale è best-effort e isolato (mai throw): il report mostra
 *     ESATTAMENTE cosa è stato eseguito e cosa no, con il motivo.
 *
 * Canali coperti (gli stessi di notificaOrdineOnlineConfermato):
 *   - email (Resend, template conferma pagamento);
 *   - WhatsApp (template `nuovo_ordine_incitta`);
 *   - ntfy (topic ordini);
 *   - notifica admin (admin_notifiche, tipo "ordine_nuovo").
 *
 * Nota sulla notifica admin: viene CREATA davvero in admin_notifiche
 * (è l'unico canale interno), ma con riferimento esplicito [TEST] nel
 * titolo/corpo e NESSUN ordine reale collegato: nessun ordine, nessuno
 * stock, nessun pagamento. È l'unica scrittura dell'intero servizio.
 *
 * Nessun importo/pagamento reale: i dati sintetici non hanno alcun
 * collegamento con clienti/negozi reali (le credenziali del cliente non
 * vengono MAI usate). Il servizio NON bypassa il checkout cliente: la
 * creazione ordine resta SOLO nel flusso cliente (RPC atomica / intento).
 */

import { Resend } from "resend";
import {
  costruisciHtmlConfermaPagamento,
  costruisciOggettoPagamento,
  type DatiEmailOrdine,
} from "@/lib/cliente/ordine-email";
import { creaNotificaAdmin } from "@/lib/amministratore/notifiche";
import {
  inviaNotificaConfigurata,
  type ConfigWhatsApp,
  type DatiOrdineNotifica,
} from "@/lib/notifiche/whatsapp";
import {
  inviaNotificaConfigurataNtfy,
  type ConfigNtfy,
  type DatiOrdineNtfy,
} from "@/lib/notifiche/ntfy";
import { normalizzaNumeroWhatsApp } from "@/lib/telefono";

/** Esito di un singolo canale del test (mai un'eccezione). */
export type EsitoCanaleTestInvio =
  | {
      canale: "email" | "whatsapp" | "ntfy" | "notifica_admin";
      eseguito: boolean;
      stato: "inviato" | "creato" | "saltato" | "errore";
      dettaglio: string;
    }
  | {
      canale: "email" | "whatsapp" | "ntfy" | "notifica_admin";
      eseguito: false;
      stato: "non_eseguito";
      dettaglio: string;
    };

/** Report complessivo del test. */
export type EsitoTestInvioOrdine = {
  ok: boolean;
  idTest: string;
  numeroTest: string;
  // Garanzie strutturali: nessun ordine reale, nessuno stock, nessun pagamento.
  ordineCreato: false;
  stockModificato: false;
  pagamentoCreato: false;
  canali: EsitoCanaleTestInvio[];
  eseguiti: number;
  saltatiONonEseguiti: number;
  errori: number;
};

/** Input del test: destinatari OPZIONALI (whitelist esplicita a valle). */
export type InputTestInvioOrdine = {
  email?: string | null;
  telefono?: string | null;
  /** SOLO TEST: override della funzione di invio email. */
  inviaEmail?: (dati: DatiEmailOrdine, oggetto: string, html: string) => Promise<{ id?: string | null; errore?: string }>;
  /** SOLO TEST: override della funzione WhatsApp. */
  inviaWhatsApp?: (config: ConfigWhatsApp, dati: DatiOrdineNotifica) => Promise<{ stato: string; messageId?: string | null; motivo?: string }>;
  /** SOLO TEST: override della funzione ntfy. */
  inviaNtfy?: (config: ConfigNtfy, dati: DatiOrdineNtfy) => Promise<{ stato: string; messageId?: string | null; motivo?: string }>;
};

/** Numero ordine di test univoco (leggibile, non collisionabile). */
export function numeroOrdineTest(now = new Date()): string {
  const data = now.toISOString().slice(0, 10).replace(/-/g, "");
  const tempo = now.toTimeString().slice(0, 8).replace(/:/g, "");
  return `TEST-${data}-${tempo}`;
}

/** Messaggio sintetico usato SOLO per il test (mai dati reali di clienti). */
const DATI_TEST = {
  negozioNome: "NEGOZIO DI TEST — invio ordine",
  clienteNome: "Cliente",
  clienteCognome: "Test",
  clienteTelefono: "3930000000",
  prodotto: "Prodotto di test",
};

/** Timeout dell'invio email Resend nel test (come il flusso ordini). */
const RESEND_TIMEOUT_MS = 8_000;

function conTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout dopo ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Invio email di test con Resend (default; sostituibile nei test). */
async function inviaEmailResendTest(
  dati: DatiEmailOrdine,
  oggetto: string,
  html: string
): Promise<{ id?: string | null; errore?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { errore: "RESEND_API_KEY non configurata" };
  const from = process.env.RESEND_FROM_EMAIL ?? "InCittà <onboarding@resend.dev>";
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await conTimeout(
      resend.emails.send({ from, to: dati.email, subject: oggetto, html }),
      RESEND_TIMEOUT_MS
    );
    if (error) return { errore: `Resend: ${error.message}` };
    return { id: data?.id ?? null };
  } catch (e) {
    return { errore: e instanceof Error ? e.message : "errore di rete" };
  }
}

/** Invio WhatsApp di test con la stessa funzione del flusso ordini. */
async function inviaWhatsAppTest(
  config: ConfigWhatsApp,
  dati: DatiOrdineNotifica
): Promise<{ stato: string; messageId?: string | null; motivo?: string }> {
  const esito = await inviaNotificaConfigurata(config, dati);
  return {
    stato: esito.stato,
    messageId: esito.stato === "inviata" ? esito.messageId : undefined,
    motivo: esito.stato !== "inviata" ? esito.motivo : undefined,
  };
}

/** Invio ntfy di test con la stessa funzione del flusso ordini. */
async function inviaNtfyTest(
  config: ConfigNtfy,
  dati: DatiOrdineNtfy
): Promise<{ stato: string; messageId?: string | null; motivo?: string }> {
  const esito = await inviaNotificaConfigurataNtfy(config, dati);
  return {
    stato: esito.stato,
    messageId: esito.stato === "sent" ? esito.messageId : undefined,
    motivo: esito.stato !== "sent" ? esito.motivo : undefined,
  };
}

/**
 * Esegue il TEST INVIO ORDINE (solo admin — l'autorizzazione è a valle
 * nella route). Compone i messaggi con dati SINTETICI e chiama i canali
 * reali. MAI ordini/stock/pagamenti: garanzie strutturali nel report.
 */
export async function eseguiTestInvioOrdine(
  input: InputTestInvioOrdine = {}
): Promise<EsitoTestInvioOrdine> {
  const idTest = crypto.randomUUID();
  const numeroTest = numeroOrdineTest();
  const canali: EsitoCanaleTestInvio[] = [];
  const inviaEmail = input.inviaEmail ?? inviaEmailResendTest;
  const inviaWhatsApp = input.inviaWhatsApp ?? inviaWhatsAppTest;
  const inviaNtfy = input.inviaNtfy ?? inviaNtfyTest;

  const destinatarioEmail = (input.email ?? "").trim();
  const destinatarioTelefono = normalizzaNumeroWhatsApp(input.telefono ?? "");

  // ── 1. EMAIL ────────────────────────────────────────────────────────────
  if (!destinatarioEmail) {
    canali.push({
      canale: "email",
      eseguito: false,
      stato: "non_eseguito",
      dettaglio: "Nessun destinatario email indicato (?email=…).",
    });
  } else {
    const datiEmail: DatiEmailOrdine = {
      id: idTest,
      numero: numeroTest,
      stato: "confermato",
      totale: 12.9,
      costoSpedizione: 0,
      createdAt: new Date().toISOString(),
      modalita: "ritiro",
      negozioNome: DATI_TEST.negozioNome,
      email: destinatarioEmail,
      metodoPagamento: "carta",
      ritiroData: new Date().toISOString().slice(0, 10),
      ritiroFascia: "10:00-12:00",
      spedizioneIndirizzo: null,
      spedizioneCap: null,
      spedizioneCitta: null,
      spedizioneProvincia: null,
      spedizioneNote: null,
      note: "EMAIL DI TEST — nessun ordine reale.",
      righe: [
        {
          nomeProdotto: DATI_TEST.prodotto,
          prezzoUnitario: 12.9,
          quantita: 1,
          varianteNome: null,
        },
      ],
    };
    const esito = await inviaEmail(
      datiEmail,
      costruisciOggettoPagamento(datiEmail),
      costruisciHtmlConfermaPagamento(datiEmail)
    );
    if (esito.errore) {
      canali.push({
        canale: "email",
        eseguito: true,
        stato: "errore",
        dettaglio: esito.errore,
      });
    } else {
      canali.push({
        canale: "email",
        eseguito: true,
        stato: "inviato",
        dettaglio: esito.id ? `Inviata (messageId ${esito.id}).` : "Inviata.",
      });
    }
  }

  // ── 2. WHATSAPP ─────────────────────────────────────────────────────────
  if (!destinatarioTelefono) {
    canali.push({
      canale: "whatsapp",
      eseguito: false,
      stato: "non_eseguito",
      dettaglio: "Nessun destinatario WhatsApp indicato (?telefono=…).",
    });
  } else {
    const config: ConfigWhatsApp = {
      enabled: process.env.WHATSAPP_ENABLED !== "false",
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
      apiVersion: process.env.WHATSAPP_API_VERSION ?? "v23.0",
      accettaWhatsapp: true,
      numeroDestinatario: destinatarioTelefono,
    };
    const dati: DatiOrdineNotifica = {
      numero: numeroTest,
      negozioNome: DATI_TEST.negozioNome,
      totale: 12.9,
      modalita: "ritiro",
      clienteNome: DATI_TEST.clienteNome,
      clienteCognome: DATI_TEST.clienteCognome,
      clienteTelefono: DATI_TEST.clienteTelefono,
      ritiroData: new Date().toISOString().slice(0, 10),
      ritiroFascia: "10:00-12:00",
      spedizioneIndirizzo: null,
      spedizioneCap: null,
      spedizioneCitta: null,
      spedizioneProvincia: null,
      righe: [{ nomeProdotto: DATI_TEST.prodotto, quantita: 1 }],
    };
    const esito = await inviaWhatsApp(config, dati);
    if (esito.stato === "inviata") {
      canali.push({
        canale: "whatsapp",
        eseguito: true,
        stato: "inviato",
        dettaglio: esito.messageId
          ? `Messaggio inviato (messageId ${esito.messageId}).`
          : "Messaggio inviato.",
      });
    } else if (esito.stato === "skipped") {
      canali.push({
        canale: "whatsapp",
        eseguito: true,
        stato: "saltato",
        dettaglio: `Non inviato: ${esito.motivo ?? "skip"}.`,
      });
    } else {
      canali.push({
        canale: "whatsapp",
        eseguito: true,
        stato: "errore",
        dettaglio: `Errore: ${esito.motivo ?? "invio fallito"}.`,
      });
    }
  }

  // ── 3. NTFY ─────────────────────────────────────────────────────────────
  const configNtfy: ConfigNtfy = {
    enabled: process.env.NTFY_ENABLED !== "false",
    serverUrl: process.env.NTFY_SERVER_URL ?? "https://ntfy.sh",
    topic: process.env.NTFY_ORDERS_TOPIC ?? "",
  };
  const datiNtfy: DatiOrdineNtfy = {
    numero: numeroTest,
    negozioNome: DATI_TEST.negozioNome,
    totale: 12.9,
    modalita: "ritiro",
    clienteNome: DATI_TEST.clienteNome,
    clienteCognome: DATI_TEST.clienteCognome,
    clienteTelefono: DATI_TEST.clienteTelefono,
    ritiroData: new Date().toISOString().slice(0, 10),
    ritiroFascia: "10:00-12:00",
    spedizioneIndirizzo: null,
    spedizioneCap: null,
    spedizioneCitta: null,
    spedizioneProvincia: null,
    note: "NOTIFICA DI TEST — nessun ordine reale.",
    righe: [{ nomeProdotto: DATI_TEST.prodotto, quantita: 1 }],
  };
  const esitoNtfy = await inviaNtfy(configNtfy, datiNtfy);
  if (esitoNtfy.stato === "sent") {
    canali.push({
      canale: "ntfy",
      eseguito: true,
      stato: "inviato",
      dettaglio: esitoNtfy.messageId
        ? `Notifica inviata (messageId ${esitoNtfy.messageId}).`
        : "Notifica inviata.",
    });
  } else if (esitoNtfy.stato === "skipped") {
    canali.push({
      canale: "ntfy",
      eseguito: true,
      stato: "saltato",
      dettaglio: `Non inviata: ${esitoNtfy.motivo ?? "skip"}.`,
    });
  } else {
    canali.push({
      canale: "ntfy",
      eseguito: true,
      stato: "errore",
      dettaglio: `Errore: ${esitoNtfy.motivo ?? "invio fallito"}.`,
    });
  }

  // ── 4. NOTIFICA ADMIN (unica scrittura: admin_notifiche, marcata TEST) ──
  const creata = await creaNotificaAdmin({
    tipo: "ordine_nuovo",
    titolo: "[TEST] Invio ordine — verifica notifiche",
    corpo: `Test invio ordine ${numeroTest} — nessun ordine reale, nessuno stock, nessun pagamento.`,
    gravita: "info",
    href: null,
  });
  canali.push({
    canale: "notifica_admin",
    eseguito: true,
    stato: creata ? "creato" : "errore",
    dettaglio: creata
      ? "Notifica admin creata (marcata [TEST], nessun ordine reale collegato)."
      : "Creazione notifica admin fallita (admin_notifiche).",
  });

  const eseguiti = canali.filter((c) => c.eseguito).length;
  const errori = canali.filter((c) => c.stato === "errore").length;
  const saltatiONonEseguiti = canali.filter(
    (c) => c.stato === "saltato" || c.stato === "non_eseguito"
  ).length;

  return {
    ok: errori === 0,
    idTest,
    numeroTest,
    ordineCreato: false,
    stockModificato: false,
    pagamentoCreato: false,
    canali,
    eseguiti,
    saltatiONonEseguiti,
    errori,
  };
}