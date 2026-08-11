/**
 * PAGAMENTI — CONFIG NEGOZIO (FASE F1, solo server).
 *
 * Legge la configurazione Stripe di un negozio da `negozio_pagamenti`
 * passando ESCLUSIVAMENTE dalla RPC `pagamenti_credenziali_leggi`
 * (security definer, service-role) con decifratura (`p_decifra = true`):
 * - la chiave PAYMENTS_ENCRYPTION_KEY arriva da process.env (mai dal
 *   browser, mai nel codice, mai nei log);
 * - i secret NON vengono mai esposti da API pubbliche;
 * - negozio NON configurato / inattivo / senza secret → `null` (fail-closed:
 *   il checkout mostra "Carta non disponibile" invece di un errore opaco).
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { CredenzialiGateway } from "./types";

/** Configurazione Stripe di un negozio, risolta SERVER-SIDE. */
export type ConfigStripeNegozio = {
  negozioId: string;
  testMode: boolean;
  /** Secret key Stripe (sk_... o pk_... in test_mode): MAI esposta al client. */
  secretKey: string;
  /** Webhook signing secret (whsec_...): MAI esposta al client. */
  webhookSecret: string;
};

type EsitoRpcLettura = {
  ok?: boolean;
  presente?: boolean;
  attivo?: boolean;
  test_mode?: boolean;
  client_id?: string | null;
  payee_email?: string | null;
  iban?: string | null;
  has_secret?: boolean;
  secret?: string | null;
  webhook_secret?: string | null;
  codice?: string;
  messaggio?: string;
};

/** Chiave di cifratura: SOLO server-side, SOLO se realmente necessaria. */
function chiaveCifraturaOrNull(): string | null {
  const key = process.env.PAYMENTS_ENCRYPTION_KEY;
  if (!key || key.trim().length === 0) return null;
  return key.trim();
}

/**
 * Legge e decifra la configurazione Stripe del negozio (service-role).
 * Ritorna `null` se: RPC in errore, negozio non presente, provider non
 * attivo, secret assente oppure chiave di cifratura mancante (fail-closed).
 * Il webhook secret è opzionale (richiesto solo per ricevere webhook):
 * senza, la configurazione NON viene considerata pronta per il checkout.
 */
export async function getConfigStripeNegozio(
  negozioId: string
): Promise<ConfigStripeNegozio | null> {
  if (!negozioId) return null;
  const chiave = chiaveCifraturaOrNull();

  let data: unknown;
  try {
    const db = createAdminSupabaseClient();
    const { data: rpcData, error } = await db.rpc("pagamenti_credenziali_leggi", {
      p_negozio_id: negozioId,
      p_provider: "stripe",
      p_decifra: true,
      p_chiave: chiave,
    });
    if (error) {
      console.error(`[pagamenti] lettura config stripe (negozio ${negozioId}): ${error.message}`);
      return null;
    }
    data = rpcData;
  } catch (e) {
    console.error("[pagamenti] lettura config stripe: impossibile inizializzare il client admin");
    return null;
  }

  const esito = (data ?? null) as EsitoRpcLettura | null;
  if (!esito || esito.ok !== true || esito.presente !== true || esito.attivo !== true) {
    return null;
  }

  const secretKey =
    typeof esito.secret === "string" && esito.secret.trim() ? esito.secret.trim() : null;
  const webhookSecret =
    typeof esito.webhook_secret === "string" && esito.webhook_secret.trim()
      ? esito.webhook_secret.trim()
      : null;

  // Fail-closed: senza secret key il gateway non può operare.
  if (!secretKey) return null;

  return {
    negozioId,
    testMode: esito.test_mode !== false,
    secretKey,
    webhookSecret: webhookSecret ?? "",
  };
}

/**
 * TRUE se il negozio può realmente accettare pagamenti con carta (Stripe
 * configurato, attivo e con secret). Usato dal checkout per mostrare il
 * metodo "Carta" SOLO quando funziona davvero.
 */
export async function isStripeProntoPerNegozio(negozioId: string): Promise<boolean> {
  const cfg = await getConfigStripeNegozio(negozioId);
  // Serve anche il webhook secret: senza non possiamo confermare il pagamento.
  return !!cfg && cfg.webhookSecret.length > 0;
}

/**
 * Credenziali per il gateway (interfaccia CredenzialiGateway).
 * SOLO server-side; mai inviate al client.
 */
export function credenzialiGatewayDaConfig(cfg: ConfigStripeNegozio): CredenzialiGateway {
  return {
    secret: cfg.secretKey,
    testMode: cfg.testMode,
  };
}

/**
 * TRUE se il prodotto appartiene a un negozio che può accettare carte
 * (Stripe configurato e attivo). PRE-FLIGHT usato da POST /api/cliente/ordini
 * PRIMA di creare l'ordine: il client non può mai scegliere "carta" per un
 * negozio non pronto (defense in depth; la UI già filtra i metodi).
 */
export async function cartaDisponibilePerProdotto(prodottoId: string): Promise<boolean> {
  if (!prodottoId || !/^\d+$/.test(String(prodottoId))) return false;
  try {
    const db = createAdminSupabaseClient();
    const { data } = await db
      .from("prodotti")
      .select("negozio_id")
      .eq("id", Number(prodottoId))
      .single();
    if (!data?.negozio_id) return false;
    return await isStripeProntoPerNegozio(String(data.negozio_id));
  } catch {
    return false;
  }
}
