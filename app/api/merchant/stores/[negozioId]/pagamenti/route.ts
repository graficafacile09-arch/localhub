import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { canManageStore } from "@/lib/merchant/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getPaymentsEncryptionKey,
  isMetodoPagamentoValido,
  isProviderPagamentoValido,
  PROVIDER_PAGAMENTO_VALIDI,
  METODI_PAGAMENTO_VALIDI,
  credenzialiPubbliche,
} from "@/lib/pagamenti/crypto";
import type { CredenzialiPubbliche } from "@/lib/pagamenti/crypto";

/**
 * GET/PUT /api/merchant/stores/[negozioId]/pagamenti
 *
 * Configurazione metodi/provider di pagamento del negozio.
 *
 * SICUREZZA:
 *   - accesso SOLO al proprietario del negozio (canManageStore + RLS);
 *   - i secret NON vengono MAI restituiti: GET risponde solo con dati
 *     pubblici/configurativi + has_secret;
 *   - la scrittura dei secret passa dalla RPC `pagamenti_credenziali_salva`
 *     (security definer, service-role, cifratura pgp_sym_encrypt con la
 *     chiave PAYMENTS_ENCRYPTION_KEY letta SOLO server-side);
 *   - un secret omesso nel PUT NON viene modificato (write-only, mai
 *     riletto/riscritto in chiaro);
 *   - allowlist rigorosa di provider e metodi.
 */

/** Body accettato dal PUT (campi consentiti per la configurazione). */
type BodyPagamenti = {
  pagamenti?: Array<{
    provider: unknown;
    attivo?: unknown;
    test_mode?: unknown;
    client_id?: unknown;
    payee_email?: unknown;
    iban?: unknown;
    secret?: unknown;
    webhook_secret?: unknown;
  }>;
  metodi?: Array<{
    metodo: unknown;
    attivo?: unknown;
    ordine_mostra?: unknown;
  }>;
};

const MAX_LUNGH = {
  client_id: 200,
  payee_email: 200,
  iban: 60,
  secret: 500,
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const user = sessione.user;

  const { negozioId } = await context.params;
  const allowed = await canManageStore(user.id, negozioId);
  if (!allowed) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  const supabase = createAdminSupabaseClient();

  // ── Provider: per ognuno dell'allowlist legge la config (senza secret) ──
  const providerRisultati: Array<
    CredenzialiPubbliche & { presente: boolean }
  > = [];

  for (const provider of PROVIDER_PAGAMENTO_VALIDI) {
    const { data, error } = await supabase.rpc("pagamenti_credenziali_leggi", {
      p_negozio_id: negozioId,
      p_provider: provider,
      p_decifra: false,
      p_chiave: null,
    });

    if (error) {
      console.error(`[api-merchant-pagamenti] lettura provider ${provider}: ${error.message}`);
      providerRisultati.push({
        provider,
        presente: false,
        attivo: false,
        test_mode: true,
        client_id: null,
        payee_email: null,
        iban: null,
        has_secret: false,
      });
      continue;
    }

    const esito = data as { ok?: boolean; presente?: boolean } | null;
    const presente = esito?.ok === true && esito.presente === true;
    const pubblici = credenzialiPubbliche(
      presente
        ? (data as Record<string, unknown>)
        : { provider }
    );
    providerRisultati.push({
      provider,
      presente,
      attivo: pubblici?.attivo ?? false,
      test_mode: pubblici?.test_mode ?? true,
      client_id: pubblici?.client_id ?? null,
      payee_email: pubblici?.payee_email ?? null,
      iban: pubblici?.iban ?? null,
      has_secret: pubblici?.has_secret ?? false,
    });
  }

  // ── Metodi attivi per il checkout ─────────────────────────────────────
  const { data: metodiRow } = await supabase
    .from("negozio_metodi_pagamento")
    .select("metodo, attivo, ordine_mostra")
    .eq("negozio_id", negozioId)
    .order("ordine_mostra", { ascending: true });

  const metodiPresenti = new Map<string, { attivo: boolean; ordine_mostra: number }>();
  for (const m of metodiRow ?? []) {
    if (isMetodoPagamentoValido(m.metodo)) {
      metodiPresenti.set(m.metodo, {
        attivo: m.attivo === true,
        ordine_mostra: Number(m.ordine_mostra ?? 0),
      });
    }
  }

  // Ogni metodo dell'allowlist è sempre presente (attivo = false di default).
  const metodi = METODI_PAGAMENTO_VALIDI.map((metodo, index) => {
    const esistente = metodiPresenti.get(metodo);
    return {
      metodo,
      attivo: esistente?.attivo ?? false,
      ordine_mostra: esistente?.ordine_mostra ?? index,
    };
  });

  return apiOk({ pagamenti: providerRisultati, metodi });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ negozioId: string }> }
) {
  const { sessione, error: errArea } = await requireApiArea("merchant");
  if (errArea) return errArea;
  const user = sessione.user;

  const { negozioId } = await context.params;
  const allowed = await canManageStore(user.id, negozioId);
  if (!allowed) return apiError("FORBIDDEN", "Non puoi gestire questo negozio.", 403);

  let body: BodyPagamenti;
  try {
    body = (await request.json()) as BodyPagamenti;
  } catch {
    return apiError("VALIDATION_ERROR", "Body JSON non valido.", 400);
  }

  // La chiave è richiesta SOLO per scrivere secret: se serve, la legge qui
  // (mai al client). Fail-closed: senza chiave non si salvano secret.
  const { pagamenti = [], metodi = [] } = body;

  if (!Array.isArray(pagamenti)) {
    return apiError("VALIDATION_ERROR", "Campo 'pagamenti' non valido.", 422);
  }

  const supabase = createAdminSupabaseClient();

  // ── 1. Credenziali provider (RPC service-role, cifratura server-side) ──
  for (const entry of pagamenti) {
    if (!entry || typeof entry !== "object") {
      return apiError("VALIDATION_ERROR", "Configurazione provider non valida.", 422);
    }
    const provider = entry.provider;
    if (!isProviderPagamentoValido(provider)) {
      return apiError("VALIDATION_ERROR", `Provider non valido: ${String(provider)}`, 422);
    }

    const haSecretNuovo =
      (typeof entry.secret === "string" && entry.secret.trim().length > 0) ||
      (typeof entry.webhook_secret === "string" && entry.webhook_secret.trim().length > 0);

    let chiave: string | null = null;
    if (haSecretNuovo) {
      try {
        chiave = getPaymentsEncryptionKey();
      } catch {
        return apiError(
          "CHIAVE_NON_CONFIGURATA",
          "Chiave di cifratura non configurata: non è possibile salvare secret.",
          500
        );
      }
    }

    const clientId =
      typeof entry.client_id === "string" ? entry.client_id.trim().slice(0, MAX_LUNGH.client_id) || null : null;
    const payeeEmail =
      typeof entry.payee_email === "string" ? entry.payee_email.trim().slice(0, MAX_LUNGH.payee_email) || null : null;
    const iban =
      typeof entry.iban === "string" ? entry.iban.trim().slice(0, MAX_LUNGH.iban) || null : null;
    const secret =
      typeof entry.secret === "string" && entry.secret.trim().length > 0
        ? entry.secret.trim().slice(0, MAX_LUNGH.secret)
        : null;
    const webhookSecret =
      typeof entry.webhook_secret === "string" && entry.webhook_secret.trim().length > 0
        ? entry.webhook_secret.trim().slice(0, MAX_LUNGH.secret)
        : null;

    // Campi omessi (undefined) → null: la RPC li preserva (update parziale
    // non deve mai azzerare attivo/test_mode già salvati).
    const attivo = entry.attivo === undefined ? null : entry.attivo === true;
    const testMode =
      provider === "bonifico"
        ? null
        : entry.test_mode === undefined
          ? null
          : entry.test_mode !== false;

    const { data, error } = await supabase.rpc("pagamenti_credenziali_salva", {
      p_negozio_id: negozioId,
      p_provider: provider,
      p_attivo: attivo,
      p_test_mode: testMode,
      p_client_id: provider === "bonifico" ? null : clientId,
      p_payee_email: payeeEmail,
      p_iban: iban,
      p_secret: secret,
      p_webhook_secret: webhookSecret,
      p_chiave: chiave,
    });

    if (error) {
      console.error(`[api-merchant-pagamenti] salvataggio provider ${provider}: ${error.message}`);
      return apiError("SAVE_FAILED", "Impossibile salvare la configurazione.", 500);
    }
    const esito = data as { ok?: boolean; codice?: string; messaggio?: string } | null;
    if (!esito || esito.ok !== true) {
      const codice = String(esito?.codice ?? "SAVE_FAILED");
      const messaggio = String(esito?.messaggio ?? "Impossibile salvare la configurazione.");
      const status = codice === "CHIAVE_MANCANTE" ? 500 : 422;
      return apiError(codice, messaggio, status);
    }
  }

  // ── 2. Metodi attivi per il checkout (upsert) ─────────────────────────
  if (Array.isArray(metodi)) {
    for (const entry of metodi) {
      if (!entry || typeof entry !== "object") {
        return apiError("VALIDATION_ERROR", "Configurazione metodo non valida.", 422);
      }
      const metodo = entry.metodo;
      if (!isMetodoPagamentoValido(metodo)) {
        return apiError("VALIDATION_ERROR", `Metodo non valido: ${String(metodo)}`, 422);
      }
      const ordineMostra =
        typeof entry.ordine_mostra === "number" && Number.isInteger(entry.ordine_mostra)
          ? Math.min(Math.max(entry.ordine_mostra, 0), 99)
          : 0;

      const { error: upsertError } = await supabase.from("negozio_metodi_pagamento").upsert(
        {
          negozio_id: negozioId,
          metodo,
          attivo: entry.attivo === true,
          ordine_mostra: ordineMostra,
        },
        { onConflict: "negozio_id,metodo" }
      );

      if (upsertError) {
        console.error(`[api-merchant-pagamenti] upsert metodo ${metodo}: ${upsertError.message}`);
        return apiError("SAVE_FAILED", "Impossibile salvare i metodi di pagamento.", 500);
      }
    }
  }

  return apiOk({ saved: true });
}
