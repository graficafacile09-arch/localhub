import { createHash, randomBytes } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minuti

/**
 * Genera un token casuale di 32 byte (256 bit) in hex: 64 caratteri.
 * L'hash SHA-256 del token ha anch'esso 64 caratteri hex.
 */
export function generaTokenReset(): string {
  return randomBytes(32).toString("hex");
}

/** Hash SHA-256 del token: nel DB viene salvato SOLO questo. */
export function hashaTokenReset(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function tokenValido(token: string): boolean {
  return typeof token === "string" && /^[0-9a-f]{64}$/.test(token);
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Cerca l'id utente di un account per EMAIL esatta (case-insensitive).
 * Restituisce null se l'account non esiste. Invocata dall'admin client
 * (service_role) che può eseguire la funzione security definer.
 */
export async function trovaUserIdPerEmail(email: string): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("get_user_id_by_email", {
    p_email: email,
  });

  if (error) {
    console.error("[password-reset] get_user_id_by_email:", error.message);
    return null;
  }

  return (data as string | null) ?? null;
}

/**
 * R1: invalida immediatamente tutti i token precedenti dello stesso utente.
 * Vengono marcati come usati (ritirati) prima di crearne uno nuovo: non può
 * mai esistere più di un token valido per lo stesso account.
 */
export async function invalidaTokenPrecedenti(userId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  await admin
    .from("reset_tokens")
    .update({ used_at: nowIso() })
    .eq("user_id", userId)
    .is("used_at", null);
}

/**
 * Crea un nuovo token per l'utente e ne salva SOLO l'hash (con scadenza).
 * Ritorna il token in chiaro da mettere nel link dell'email.
 */
export async function creaTokenReset(userId: string): Promise<string> {
  const admin = createAdminSupabaseClient();
  const token = generaTokenReset();
  const { error } = await admin.from("reset_tokens").insert({
    user_id: userId,
    token_hash: hashaTokenReset(token),
    expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
  });

  if (error) {
    throw new Error(`impossibile creare il token: ${error.message}`);
  }

  return token;
}

export type EsitoValidazioneToken =
  | { valido: true; userId: string }
  | { valido: false; motivo: "inesistente" | "scaduto" | "usato" | "non_valido" };

/**
 * Valida un token SOLO in lettura (per la pagina): non lo consuma.
 * La validazione definitiva avviene in `consumaToken` durante il POST.
 */
export async function validaToken(token: string): Promise<EsitoValidazioneToken> {
  if (!tokenValido(token)) {
    return { valido: false, motivo: "non_valido" };
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("reset_tokens")
    .select("user_id, used_at, expires_at")
    .eq("token_hash", hashaTokenReset(token))
    .maybeSingle();

  if (error) {
    console.error("[password-reset] select token:", error.message);
    return { valido: false, motivo: "inesistente" };
  }
  if (!data) {
    return { valido: false, motivo: "inesistente" };
  }
  if (data.used_at) {
    return { valido: false, motivo: "usato" };
  }
  if (new Date(data.expires_at) <= new Date()) {
    return { valido: false, motivo: "scaduto" };
  }

  return { valido: true, userId: data.user_id as string };
}

/**
 * R2: consuma ATOMICAMENTE il token (single UPDATE nella funzione SQL).
 * Restituisce la userId se il token è valido+non usato+non scaduto,
 * altrimenti null. Dopo un utilizzo corretto il token è 'usato' con lo stesso
 * UPDATE (stessa "transazione"): nessuna finestra per un riuso concorrente.
 */
export async function consumaToken(token: string): Promise<string | null> {
  if (!tokenValido(token)) {
    return null;
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("consume_reset_token", {
    p_token_hash: hashaTokenReset(token),
  });

  if (error) {
    console.error("[password-reset] consuma_token:", error.message);
    return null;
  }

  return (data as string | null) ?? null;
}