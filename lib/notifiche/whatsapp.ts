/**
 * Notifiche WhatsApp al negoziante (Meta Cloud API / WhatsApp Business
 * Platform).
 *
 * SOLO server-side: importato esclusivamente da codice server
 * (lib/cliente/orders.ts e lib/cliente/ordini-carrello.ts per gli ordini
 * confermati subito; lib/pagamenti/webhook-*.ts per i pagamenti online
 * confermati dal webhook del provider). I token Meta non sono MAI esposti
 * al browser né stampati nei log (Authorization header incluso).
 *
 * Principio fondamentale: la notifica è BEST-EFFORT — non può MAI
 * determinare il successo dell'ordine. Qualunque errore (Meta 4xx/5xx,
 * timeout, rete, configurazione mancante) viene solo loggato e la funzione
 * restituisce uno stato: l'ordine resta salvato e lo stock già decrementato
 * dalla RPC atomica.
 *
 * Template Meta previsto: `nuovo_ordine_incitta` (lingua `it`).
 * Corpo del template da creare in Meta Business Manager (sintassi
 * placeholder di Meta: {{1}} ... {{8}}):
 *
 *   Nuovo ordine #{{1}} — {{2}}
 *   Prodotti:
 *   {{3}}
 *   Totale: €{{4}} · {{5}}
 *   Cliente: {{6}}
 *   Telefono: {{7}}
 *   {{8}}
 *
 * Parametri (uno per segnaposto, SEMPRE presenti — Meta richiede il numero
 * esatto di placeholder; i dati opzionali assenti diventano "—", mai
 * "undefined"/"null"):
 *   1. numero ordine          (es. "LH-000001")
 *   2. nome negozio
 *   3. riepilogo prodotti     (una riga per prodotto, multi-riga: "• X × 2")
 *   4. totale                 (formato italiano: "12,90")
 *   5. modalità               ("Ritiro in negozio" / "Spedizione a domicilio")
 *   6. cliente                ("Nome Cognome")
 *   7. telefono cliente
 *   8. dettaglio consegna     (ritiro: data/fascia · spedizione: indirizzo)
 *
 * ENV richieste (nessuna sotto NEXT_PUBLIC_):
 *   WHATSAPP_ACCESS_TOKEN      — token permanente dell'app Meta (Graph API)
 *   WHATSAPP_PHONE_NUMBER_ID   — ID del numero di telefono abilitato WhatsApp
 *   WHATSAPP_API_VERSION       — es. "v23.0" (opzionale, default v23.0)
 *   WHATSAPP_ENABLED           — "false" per disattivare (opzionale)
 */

import { normalizzaNumeroWhatsApp } from "@/lib/telefono";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/** Nome del message template approvato su Meta (business-initiated). */
export const TEMPLATE_NOME = "nuovo_ordine_incitta";
export const TEMPLATE_LINGUA = "it";

const DEFAULT_API_VERSION = "v23.0";
const DEFAULT_TIMEOUT_MS = 5_000;
/** Numero massimo di righe prodotto mostrate nel riepilogo. */
const MAX_RIGHE_RIEPILOGO = 6;

/** Esito della notifica (mai un'eccezione: l'ordine non deve fallire). */
export type EsitoNotificaWhatsApp =
  | { stato: "inviata"; messageId: string | null }
  | { stato: "skipped"; motivo: string }
  | { stato: "errore"; motivo: string };

export type RigaOrdineNotifica = {
  nomeProdotto: string;
  quantita: number;
};

/** Dati dell'ordine necessari al messaggio (tutti derivati dal DB). */
export type DatiOrdineNotifica = {
  numero: string;
  negozioNome: string;
  totale: number;
  modalita: "ritiro" | "spedizione";
  clienteNome: string;
  clienteCognome: string;
  clienteTelefono: string | null;
  ritiroData: string | null;
  ritiroFascia: string | null;
  spedizioneIndirizzo: string | null;
  spedizioneCap: string | null;
  spedizioneCitta: string | null;
  spedizioneProvincia: string | null;
  righe: RigaOrdineNotifica[];
};

/** Configurazione della notifica (env + dati del negozio). */
export type ConfigWhatsApp = {
  enabled: boolean;
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
  /** true = il negozio accetta di ricevere WhatsApp (negozi.accetta_whatsapp). */
  accettaWhatsapp: boolean;
  /** Numero del negozio: negozi.whatsapp, in fallback negozi.telefono. */
  numeroDestinatario: string;
  timeoutMs?: number;
};

/** Client DB strutturale minimo (per iniettare un fake nei test). */
export type DbLike = {
  from: (tabella: string) => unknown;
};

/** Formatta un importo in euro in formato italiano ("12,90"). */
export function formattaEuro(importo: number): string {
  if (!Number.isFinite(importo)) return "0,00";
  return importo.toFixed(2).replace(".", ",");
}

/** Riepilogo prodotti compatibile con ordini a più righe. */
export function costruisciRiepilogoProdotti(righe: RigaOrdineNotifica[]): string {
  if (!Array.isArray(righe) || righe.length === 0) return "—";
  const visibili = righe.slice(0, MAX_RIGHE_RIEPILOGO);
  const righeTesto = visibili.map(
    (r) => `• ${(r.nomeProdotto || "Prodotto").trim()} × ${Number(r.quantita) || 1}`
  );
  const extra = righe.length - visibili.length;
  if (extra > 0) righeTesto.push(`…e altri ${extra} prodotti`);
  return righeTesto.join("\n");
}

/** Dettaglio consegna: ritiro (data/fascia) oppure spedizione (indirizzo). */
export function costruisciDettaglioConsegna(dati: DatiOrdineNotifica): string {
  if (dati.modalita === "spedizione") {
    const parti = [
      dati.spedizioneIndirizzo,
      dati.spedizioneCap,
      dati.spedizioneCitta,
      dati.spedizioneProvincia,
    ].filter((v): v is string => Boolean(v && v.trim()));
    return parti.length ? `Spedizione a: ${parti.join(", ")}` : "—";
  }
  const partiRitiro: string[] = [];
  if (dati.ritiroData) partiRitiro.push(dati.ritiroData);
  if (dati.ritiroFascia) partiRitiro.push(dati.ritiroFascia);
  return partiRitiro.length ? `Ritiro: ${partiRitiro.join(" — ")}` : "—";
}

/** Costruisce il payload del message template (8 parametri, mai vuoti inutili). */
export function costruisciPayloadTemplate(
  dati: DatiOrdineNotifica,
  numeroDestinatario: string
): Record<string, unknown> {
  const cliente = `${dati.clienteNome || ""} ${dati.clienteCognome || ""}`.trim() || "—";
  return {
    messaging_product: "whatsapp",
    to: numeroDestinatario,
    type: "template",
    template: {
      name: TEMPLATE_NOME,
      language: { code: TEMPLATE_LINGUA },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: dati.numero || "—" },
            { type: "text", text: dati.negozioNome || "—" },
            { type: "text", text: costruisciRiepilogoProdotti(dati.righe) },
            { type: "text", text: formattaEuro(dati.totale) },
            {
              type: "text",
              text: dati.modalita === "ritiro" ? "Ritiro in negozio" : "Spedizione a domicilio",
            },
            { type: "text", text: cliente },
            { type: "text", text: (dati.clienteTelefono || "").trim() || "—" },
            { type: "text", text: costruisciDettaglioConsegna(dati) },
          ],
        },
      ],
    },
  };
}

/** Estrae codice/messaggio dall'errore Meta (mai token; troncato). */
function estraiErroreMeta(corpo: string, status: number): string {
  try {
    const parsed = JSON.parse(corpo) as { error?: { code?: number; message?: string } };
    const codice = parsed?.error?.code;
    const messaggio = parsed?.error?.message ?? "";
    const dettaglio = messaggio.trim().slice(0, 200);
    return `code=${codice ?? "?"} msg="${dettaglio || "(nessun dettaglio)"}"`;
  } catch {
    const grezzo = (corpo || "").trim().slice(0, 120);
    return grezzo ? `http_${status} "${grezzo}"` : `http_${status} senza corpo`;
  }
}

/**
 * Invio effettivo (core puro, testabile con fetch mockata).
 * Applica le guardie e NON lancia MAI eccezioni.
 */
export async function inviaNotificaConfigurata(
  config: ConfigWhatsApp,
  dati: DatiOrdineNotifica,
  fetchImpl: typeof fetch = fetch
): Promise<EsitoNotificaWhatsApp> {
  // ── Guardie (nessuna può far fallire l'ordine) ───────────────────────────
  const salta = (motivo: string): EsitoNotificaWhatsApp => {
    console.log(`[whatsapp] ordine ${dati.numero}: notifica saltata (${motivo})`);
    return { stato: "skipped", motivo };
  };

  if (config.enabled === false) return salta("whatsapp_disabilitato");
  if (!config.accessToken || !config.phoneNumberId) {
    return salta("configurazione_mancante");
  }
  if (config.accettaWhatsapp === false) return salta("accetta_whatsapp_false");

  const destinatario = normalizzaNumeroWhatsApp(config.numeroDestinatario);
  if (!destinatario) return salta("numero_non_disponibile");

  // ── Costruzione richiesta (il token va SOLO nell'header, mai nei log) ────
  const apiVersion = config.apiVersion || DEFAULT_API_VERSION;
  const url = `https://graph.facebook.com/${apiVersion}/${config.phoneNumberId}/messages`;
  const payload = costruisciPayloadTemplate(dati, destinatario);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const corpo = await res.text().catch(() => "");

    if (res.ok) {
      let messageId: string | null = null;
      try {
        const parsed = JSON.parse(corpo) as { messages?: Array<{ id?: string }> };
        messageId = parsed?.messages?.[0]?.id ?? null;
      } catch {
        // corpo non JSON: la risposta 2xx resta comunque un successo
      }
      console.log(`[whatsapp] ordine ${dati.numero}: notifica inviata (HTTP ${res.status})`);
      return { stato: "inviata", messageId };
    }

    console.error(
      `[whatsapp] ordine ${dati.numero}: Meta ha risposto HTTP ${res.status} — ${estraiErroreMeta(corpo, res.status)}`
    );
    return { stato: "errore", motivo: `meta_http_${res.status}` };
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error)?.name === "AbortError") {
      console.error(`[whatsapp] ordine ${dati.numero}: timeout dopo ${timeoutMs}ms`);
      return { stato: "errore", motivo: "timeout" };
    }
    console.error(
      `[whatsapp] ordine ${dati.numero}: errore di rete: ${(err as Error)?.message ?? "sconosciuto"}`
    );
    return { stato: "errore", motivo: "rete" };
  }
}

/** Opzioni per i test (iniezione di db e fetch). */
export type OpzioniNotifica = {
  db?: DbLike;
  fetchImpl?: typeof fetch;
};

/**
 * Notifica WhatsApp al negoziante per un ordine appena creato.
 *
 * Recupera ordine + righe + negozio dal DB, applica le guardie e invia il
 * message template. MAI throw: ogni problema viene loggato e restituito
 * come stato, lasciando l'ordine intatto.
 */
export async function inviaNotificaNuovoOrdine(
  ordineId: string,
  opts: OpzioniNotifica = {}
): Promise<EsitoNotificaWhatsApp> {
  try {
    const db = (opts.db ?? createAdminSupabaseClient()) as {
      // Il client Supabase reale è tipizzato; il fake di test resta libero.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      from: (t: string) => any;
    };

    // ── Recupero dati negozio/ordine ───────────────────────────────────────
    const { data: ordine, error: errOrdine } = await db
      .from("ordini")
      .select("*")
      .eq("id", ordineId)
      .single();
    if (errOrdine || !ordine) {
      console.error(
        `[whatsapp] ordine ${ordineId}: ordine non trovato (${errOrdine?.message ?? "null"})`
      );
      return { stato: "errore", motivo: "ordine_non_trovato" };
    }

    const { data: righe, error: errRighe } = await db
      .from("ordini_righe")
      .select("*")
      .eq("ordine_id", ordineId)
      .order("created_at", { ascending: true });
    if (errRighe) {
      // Le righe mancanti non bloccano la notifica: si invia il riepilogo
      // con le sole informazioni disponibili, loggando il problema.
      console.error(`[whatsapp] ordine ${ordineId}: lettura righe fallita: ${errRighe.message}`);
    }

    const { data: negozio, error: errNegozio } = await db
      .from("negozi")
      .select("whatsapp, telefono, accetta_whatsapp")
      .eq("id", String(ordine.negozio_id))
      .single();
    if (errNegozio || !negozio) {
      console.error(
        `[whatsapp] ordine ${ordineId}: negozio non trovato (${errNegozio?.message ?? "null"})`
      );
      return { stato: "errore", motivo: "negozio_non_trovato" };
    }

    // ── Configurazione da ENV (mai NEXT_PUBLIC_, mai nei log) ──────────────
    const config: ConfigWhatsApp = {
      enabled: process.env.WHATSAPP_ENABLED !== "false",
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
      apiVersion: process.env.WHATSAPP_API_VERSION ?? DEFAULT_API_VERSION,
      accettaWhatsapp: (negozio.accetta_whatsapp ?? true) !== false,
      // Guardia 3-4: whatsapp del negozio, fallback al telefono
      numeroDestinatario: String(negozio.whatsapp || negozio.telefono || ""),
    };

    const dati: DatiOrdineNotifica = {
      numero: String(ordine.numero ?? ""),
      negozioNome: String(ordine.negozio_nome ?? ""),
      totale: Number(ordine.totale ?? 0),
      modalita: ordine.modalita === "spedizione" ? "spedizione" : "ritiro",
      clienteNome: String(ordine.cliente_nome ?? ""),
      clienteCognome: String(ordine.cliente_cognome ?? ""),
      clienteTelefono: ordine.cliente_telefono ?? null,
      ritiroData: ordine.ritiro_data ?? null,
      ritiroFascia: ordine.ritiro_fascia ?? null,
      spedizioneIndirizzo: ordine.spedizione_indirizzo ?? null,
      spedizioneCap: ordine.spedizione_cap ?? null,
      spedizioneCitta: ordine.spedizione_citta ?? null,
      spedizioneProvincia: ordine.spedizione_provincia ?? null,
      righe: (righe ?? []).map((r: Record<string, unknown>) => ({
        nomeProdotto: String(r.nome_prodotto ?? ""),
        quantita: Number(r.quantita ?? 1),
      })),
    };

    return await inviaNotificaConfigurata(config, dati, opts.fetchImpl);
  } catch (err) {
    console.error(
      `[whatsapp] ordine ${ordineId}: errore imprevisto: ${(err as Error)?.message ?? "sconosciuto"}`
    );
    return { stato: "errore", motivo: "imprevisto" };
  }
}
