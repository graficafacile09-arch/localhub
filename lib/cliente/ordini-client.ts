"use client";

/**
 * Helper client per la creazione di un ordine.
 * Usato da RitiroForm e SpedizioneForm.
 * Il payload è tipizzato e rispecchia CreaOrdineInput di lib/cliente/orders.
 */

export type ClienteCheckoutPayload = {
  nome: string;
  cognome: string;
  telefono?: string | null;
  email?: string | null;
};

export type CreaOrdinePayload = {
  idempotencyKey: string;
  prodottoId: string;
  /** Variante selezionata (FASE E4): solo trasportata, validata dal server. */
  varianteId?: string | null;
  quantita: number;
  modalita: "ritiro" | "spedizione";
  cliente: ClienteCheckoutPayload;
  ritiro?: { data?: string | null; fascia?: string | null } | null;
  spedizione?: {
    indirizzo: string;
    cap: string;
    citta: string;
    provincia: string;
    note?: string | null;
    metodoSpedizione: "standard" | "express";
    metodoPagamento: "carta" | "paypal" | "bonifico";
  } | null;
  note?: string | null;
};

export type EsitoApi =
  | {
      ok: true;
      ordineId: string;
      numero: string;
      giaEsistente: boolean;
      /** FASE F1: presente quando il checkout deve aprire Stripe (metodo carta). */
      pagamento?: { redirectUrl?: string } | null;
    }
  | {
      ok: false;
      errore: string;
      codice: string;
    };

/** Genera una chiave di idempotenza una sola volta per sessione di acquisto. */
export function nuovaChiaveIdempotenza(): string {
  return crypto.randomUUID();
}

/**
 * Invia il POST di creazione ordine.
 * Non lancia eccezioni: ritorna sempre un oggetto EsitoApi.
 */
export async function creaOrdineViaApi(payload: CreaOrdinePayload): Promise<EsitoApi> {
  try {
    const res = await fetch("/api/cliente/ordini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        varianteId: payload.varianteId ?? null,
      }),
    });

    const json = (await res.json()) as {
      success?: boolean;
      data?: {
        ordine?: { id?: string; numero?: string };
        giaEsistente?: boolean;
        pagamento?: { redirectUrl?: string } | null;
      };
      error?: { code?: string; message?: string };
    };

    if (!res.ok || !json.success || !json.data?.ordine?.id) {
      return {
        ok: false,
        errore: json.error?.message ?? "Impossibile creare l'ordine. Riprova.",
        codice: json.error?.code ?? "ERROR",
      };
    }

    return {
      ok: true,
      ordineId: String(json.data.ordine.id),
      numero: String(json.data.ordine.numero ?? ""),
      giaEsistente: !!json.data.giaEsistente,
      pagamento: json.data.pagamento ?? null,
    };
  } catch {
    return { ok: false, errore: "Errore di rete. Controlla la connessione.", codice: "NETWORK_ERROR" };
  }
}
