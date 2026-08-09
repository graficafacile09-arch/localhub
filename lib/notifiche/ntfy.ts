/**
 * Notifiche ntfy per i nuovi ordini (canale gratuito).
 *
 * SOLO server-side: importato esclusivamente da codice server
 * (lib/cliente/orders.ts → app/api/cliente/ordini). Nessun token o dato
 * sensibile viene esposto al browser. Il topic ntfy è pubblico per chi lo
 * conosce: il messaggio contiene solo i dati necessari alla gestione
 * dell'ordine (mai password, token o dati di pagamento completi).
 *
 * Principio fondamentale: la notifica è BEST-EFFORT — non può MAI
 * determinare il successo dell'ordine. Qualunque errore (HTTP 4xx/5xx,
 * timeout, rete, configurazione mancante) viene solo loggato e la funzione
 * restituisce uno stato: l'ordine resta salvato e lo stock già decrementato
 * dalla RPC atomica.
 *
 * Il flusso WhatsApp/Meta resta intatto e disponibile per il futuro:
 * questo helper è un canale aggiuntivo, indipendente.
 *
 * ENV richieste (nessuna sotto NEXT_PUBLIC_):
 *   NTFY_ENABLED          — "false" per disattivare (opzionale, default attivo)
 *   NTFY_SERVER_URL       — es. https://ntfy.sh (opzionale, default https://ntfy.sh)
 *   NTFY_ORDERS_TOPIC     — topic della notifica (obbligatorio per inviare)
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/** Timeout di default per la chiamata a ntfy (millisecondi). */
const DEFAULT_TIMEOUT_MS = 5_000;
/** Numero massimo di righe prodotto mostrate nel riepilogo. */
const MAX_RIGHE_RIEPILOGO = 6;
/** Priorità ntfy per gli ordini ("high" = 4, su scala 1-5). */
const PRIORITA_ORDINE = "high";

/** Esito della notifica (mai un'eccezione: l'ordine non deve fallire). */
export type EsitoNotificaNtfy =
  | { stato: "sent"; messageId: string | null }
  | { stato: "skipped"; motivo: string }
  | { stato: "error"; motivo: string };

export type RigaOrdineNtfy = {
  nomeProdotto: string;
  quantita: number;
};

/** Dati dell'ordine necessari al messaggio (tutti derivati dal DB). */
export type DatiOrdineNtfy = {
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
  note: string | null;
  righe: RigaOrdineNtfy[];
};

/** Configurazione della notifica (dalle ENV server-side). */
export type ConfigNtfy = {
  enabled: boolean;
  serverUrl: string;
  topic: string;
  timeoutMs?: number;
};

/** Client DB strutturale minimo (per iniettare un fake nei test). */
export type DbLike = {
  from: (tabella: string) => unknown;
};

/** Formatta un importo in euro in formato italiano ("12,90"). */
export function formattaEuroNtfy(importo: number): string {
  if (!Number.isFinite(importo)) return "0,00";
  return importo.toFixed(2).replace(".", ",");
}

/** Riepilogo prodotti compatibile con ordini a più righe. */
export function costruisciRiepilogoProdottiNtfy(righe: RigaOrdineNtfy[]): string {
  if (!Array.isArray(righe) || righe.length === 0) return "• (nessun prodotto)";
  const visibili = righe.slice(0, MAX_RIGHE_RIEPILOGO);
  const righeTesto = visibili.map(
    (r) => `• ${(r.nomeProdotto || "Prodotto").trim()} × ${Number(r.quantita) || 1}`
  );
  const extra = righe.length - visibili.length;
  if (extra > 0) righeTesto.push(`…e altri ${extra} prodotti`);
  return righeTesto.join("\n");
}

/** Riga del cliente: nome completo + telefono (solo se presenti). */
function rigaCliente(dati: DatiOrdineNtfy): string[] {
  const righe: string[] = [];
  const cliente = `${dati.clienteNome || ""} ${dati.clienteCognome || ""}`.trim();
  if (cliente) righe.push(`👤 Cliente: ${cliente}`);
  const telefono = (dati.clienteTelefono || "").trim();
  if (telefono) righe.push(`📞 Telefono: ${telefono}`);
  return righe;
}

/** Riga della consegna: ritiro (data/fascia) oppure spedizione (indirizzo). */
function rigaConsegna(dati: DatiOrdineNtfy): string[] {
  if (dati.modalita === "spedizione") {
    const parti = [
      dati.spedizioneIndirizzo,
      dati.spedizioneCap,
      dati.spedizioneCitta,
      dati.spedizioneProvincia,
    ].filter((v): v is string => Boolean(v && v.trim()));
    return parti.length ? [`📍 Indirizzo: ${parti.join(", ")}`] : [];
  }
  const partiRitiro: string[] = [];
  if (dati.ritiroData) partiRitiro.push(dati.ritiroData);
  if (dati.ritiroFascia) partiRitiro.push(dati.ritiroFascia);
  return partiRitiro.length ? [`📅 Ritiro: ${partiRitiro.join(" — ")}`] : [];
}

/**
 * Costruisce il corpo del messaggio (formato leggibile e professionale).
 * I valori mancanti vengono omessi: mai stringhe "undefined"/"null".
 */
export function costruisciMessaggioNtfy(dati: DatiOrdineNtfy): string {
  const righe: string[] = [];
  righe.push(`🛍️ NUOVO ORDINE #${(dati.numero || "").trim() || "—"}`);
  righe.push("");
  righe.push(`🏪 ${(dati.negozioNome || "").trim() || "Negozio"}`);
  righe.push("");
  righe.push("📦 Prodotti:");
  righe.push(costruisciRiepilogoProdottiNtfy(dati.righe));
  righe.push("");
  righe.push(`💰 Totale: €${formattaEuroNtfy(dati.totale)}`);
  righe.push("");
  righe.push(`🚚 Modalità: ${dati.modalita === "spedizione" ? "Spedizione" : "Ritiro"}`);
  righe.push("");
  righe.push(...rigaConsegna(dati));
  const cliente = rigaCliente(dati);
  if (cliente.length) {
    righe.push("");
    righe.push(...cliente);
  }
  const note = (dati.note || "").trim();
  if (note) {
    righe.push("");
    righe.push(`📝 Note: ${note}`);
  }
  return righe.join("\n");
}

/**
 * Invio effettivo (core puro, testabile con fetch mockata).
 * Applica le guardie e NON lancia MAI eccezioni.
 */
export async function inviaNotificaConfigurataNtfy(
  config: ConfigNtfy,
  dati: DatiOrdineNtfy,
  fetchImpl: typeof fetch = fetch
): Promise<EsitoNotificaNtfy> {
  // ── Guardie (nessuna può far fallire l'ordine) ───────────────────────────
  const salta = (motivo: string): EsitoNotificaNtfy => {
    console.log(`[ntfy] ordine ${dati.numero || "?"}: notifica saltata (${motivo})`);
    return { stato: "skipped", motivo };
  };

  if (config.enabled === false) return salta("ntfy_disabilitato");
  const topic = (config.topic || "").trim().replace(/^\/+/, "");
  if (!topic) return salta("configurazione_mancante");
  const serverUrl = (config.serverUrl || "").trim().replace(/\/+$/, "");
  if (!serverUrl) return salta("configurazione_mancante");

  const url = `${serverUrl}/${topic}`;
  const corpo = costruisciMessaggioNtfy(dati);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Title": `🛍️ Nuovo ordine ${(dati.numero || "").trim() || ""}`.trim(),
        "X-Priority": PRIORITA_ORDINE,
        "X-Tags": "shopping_cart",
      },
      body: corpo,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const risposta = await res.text().catch(() => "");

    if (res.ok) {
      let messageId: string | null = null;
      try {
        const parsed = JSON.parse(risposta) as { id?: string };
        messageId = parsed?.id ?? null;
      } catch {
        // corpo non JSON: la risposta 2xx resta comunque un successo
      }
      console.log(`[ntfy] ordine ${dati.numero || "?"}: notifica inviata (HTTP ${res.status})`);
      return { stato: "sent", messageId };
    }

    console.error(
      `[ntfy] ordine ${dati.numero || "?"}: ntfy ha risposto HTTP ${res.status} (${(risposta || "").trim().slice(0, 120)})`
    );
    return { stato: "error", motivo: `ntfy_http_${res.status}` };
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error)?.name === "AbortError") {
      console.error(`[ntfy] ordine ${dati.numero || "?"}: timeout dopo ${timeoutMs}ms`);
      return { stato: "error", motivo: "timeout" };
    }
    console.error(
      `[ntfy] ordine ${dati.numero || "?"}: errore di rete: ${(err as Error)?.message ?? "sconosciuto"}`
    );
    return { stato: "error", motivo: "rete" };
  }
}

/** Opzioni per i test (iniezione di db e fetch). */
export type OpzioniNotificaNtfy = {
  db?: DbLike;
  fetchImpl?: typeof fetch;
};

/**
 * Notifica ntfy al negoziante per un ordine appena creato.
 *
 * Recupera ordine + righe dal DB, applica le guardie e invia il messaggio.
 * MAI throw: ogni problema viene loggato e restituito come stato, lasciando
 * l'ordine intatto (lo stock è già stato decrementato dalla RPC atomica).
 * Il nome del negozio è già snapshot su ordini.negozio_nome: nessuna lettura
 * aggiuntiva della tabella negozi.
 */
export async function inviaNotificaNuovoOrdineNtfy(
  ordineId: string,
  opts: OpzioniNotificaNtfy = {}
): Promise<EsitoNotificaNtfy> {
  try {
    const db = (opts.db ?? createAdminSupabaseClient()) as {
      from: (t: string) => any;
    };

    // ── Recupero dati ordine ────────────────────────────────────────────────
    const { data: ordine, error: errOrdine } = await db
      .from("ordini")
      .select("*")
      .eq("id", ordineId)
      .single();
    if (errOrdine || !ordine) {
      console.error(
        `[ntfy] ordine ${ordineId}: ordine non trovato (${errOrdine?.message ?? "null"})`
      );
      return { stato: "error", motivo: "ordine_non_trovato" };
    }

    const { data: righe, error: errRighe } = await db
      .from("ordini_righe")
      .select("*")
      .eq("ordine_id", ordineId)
      .order("created_at", { ascending: true });
    if (errRighe) {
      // Le righe mancanti non bloccano la notifica: si invia il riepilogo
      // con le sole informazioni disponibili, loggando il problema.
      console.error(`[ntfy] ordine ${ordineId}: lettura righe fallita: ${errRighe.message}`);
    }

    // ── Configurazione da ENV (mai NEXT_PUBLIC_, il topic mai nei log) ──────
    const config: ConfigNtfy = {
      enabled: process.env.NTFY_ENABLED !== "false",
      serverUrl: process.env.NTFY_SERVER_URL ?? "https://ntfy.sh",
      topic: process.env.NTFY_ORDERS_TOPIC ?? "",
    };

    const dati: DatiOrdineNtfy = {
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
      note: (ordine.note || (ordine.modalita === "spedizione" ? ordine.spedizione_note : null)) ?? null,
      righe: (righe ?? []).map((r: Record<string, unknown>) => ({
        nomeProdotto: String(r.nome_prodotto ?? ""),
        quantita: Number(r.quantita ?? 1),
      })),
    };

    return await inviaNotificaConfigurataNtfy(config, dati, opts.fetchImpl);
  } catch (err) {
    console.error(
      `[ntfy] ordine ${ordineId}: errore imprevisto: ${(err as Error)?.message ?? "sconosciuto"}`
    );
    return { stato: "error", motivo: "imprevisto" };
  }
}
