import { apiError, apiOk } from "@/lib/api/response";
import { requireApiArea } from "@/lib/auth/session-area";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { deleteImageFromStorage } from "@/lib/supabase/storage";
import {
  registraAttivitaAdmin,
  OPERATION_TYPES,
  TARGET_TYPES,
} from "@/lib/amministratore/activity-log";

/**
 * PRODOTTI — azioni rapide amministrative sul catalogo globale.
 *
 * PATCH  — rinomina rapida + toggle dei flag gestiti dal back office:
 *          - nome              → modifica del nome del prodotto (validato, max 120 caratteri);
 *          - attivo            → attiva/disattiva la pubblicazione;
 *          - prodottoTipico    → vetrina "Prodotti tipici";
 *          - prodottoOfferta   → vetrina "Offerte".
 *          La modifica completa passa dal form condiviso del venditore
 *          (/amministratore/prodotti/[productId]); qui si tocca SOLO la
 *          colonna richiesta, senza alterare gli altri dati del prodotto.
 * DELETE — eliminazione DEFINITIVA di un prodotto (i prodotti non hanno
 *          cestino: nessuna soft-delete nella tabella `prodotti`, coerente
 *          con la gestione del venditore). Anche l'immagine dallo storage
 *          viene rimossa, come nella route merchant.
 *
 * Protezioni (server-side): richiede sessione admin AUTORIZZATA
 * (requireApiArea("admin")), nessun ruolo commerciante/cliente può usarla,
 * e ogni operazione viene registrata in admin_activity_log.
 */

/** Nomi API (client) → colonne DB dei soli flag modificabili qui. */
const FLAG: Record<"attivo" | "prodottoTipico" | "prodottoOfferta", string> = {
  attivo: "attivo",
  prodottoTipico: "prodotto_tipico",
  prodottoOfferta: "prodotto_offerta",
};

const ETICHETTE: Record<keyof typeof FLAG, string> = {
  attivo: "attivo",
  prodottoTipico: "prodotto tipico",
  prodottoOfferta: "prodotto in offerta",
};

async function leggiProdottoEnegozio(productId: string) {
  const db = createAdminSupabaseClient();
  const { data: prodotto, error } = await db
    .from("prodotti")
    .select("id, nome, negozio_id, attivo, prodotto_tipico, prodotto_offerta, immagine_principale")
    .eq("id", productId)
    .maybeSingle();
  if (error || !prodotto) return null;

  let negozioNome: string | null = null;
  if (prodotto.negozio_id) {
    const { data: negozio } = await db
      .from("negozi")
      .select("nome")
      .eq("id", prodotto.negozio_id)
      .maybeSingle();
    negozioNome = (negozio?.nome as string | null) ?? null;
  }

  return {
    id: String(prodotto.id),
    nome: String(prodotto.nome ?? "Prodotto senza nome"),
    negozioId: (prodotto.negozio_id as string | null) ?? null,
    negozioNome,
    attivo: Boolean(prodotto.attivo),
    prodottoTipico: Boolean(prodotto.prodotto_tipico),
    prodottoOfferta: Boolean(prodotto.prodotto_offerta),
    immaginePrincipale: (prodotto.immagine_principale as string | null) ?? null,
  };
}

/** PATCH — aggiornamento rapido del nome e dei SOLI flag amministrativi. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ productId: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const db = createAdminSupabaseClient();
  const { productId } = await context.params;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("VALIDATION_ERROR", "Corpo della richiesta non valido.", 422);
  }

  // Nome prodotto: unica modifica testuale ammessa da questa route rapida.
  // Lo slug NON viene rigenerato: i link pubblici del prodotto restano validi.
  let nuovoNome: string | undefined;
  if (body.nome !== undefined) {
    if (typeof body.nome !== "string") {
      return apiError("VALIDATION_ERROR", "Il nome del prodotto deve essere una stringa.", 422);
    }
    const pulito = body.nome.trim().replace(/\s+/g, " ");
    if (pulito.length < 2) {
      return apiError("VALIDATION_ERROR", "Il nome del prodotto deve avere almeno 2 caratteri.", 422);
    }
    if (pulito.length > 120) {
      return apiError("VALIDATION_ERROR", "Il nome del prodotto non può superare 120 caratteri.", 422);
    }
    nuovoNome = pulito;
  }

  // Solo i flag noti sono modificabili; ogni altra chiave viene ignorata.
  const aggiornamenti: Partial<Record<string, boolean>> = {};
  for (const [chiave, colonna] of Object.entries(FLAG)) {
    if (body[chiave] === undefined) continue;
    if (typeof body[chiave] !== "boolean") {
      return apiError("VALIDATION_ERROR", `Il campo ${chiave} deve essere booleano.`, 422);
    }
    aggiornamenti[colonna] = body[chiave] as boolean;
  }

  if (Object.keys(aggiornamenti).length === 0 && nuovoNome === undefined) {
    return apiError("VALIDATION_ERROR", "Nessun flag valido da aggiornare.", 422);
  }

  const prodotto = await leggiProdottoEnegozio(productId);
  if (!prodotto) return apiError("NOT_FOUND", "Prodotto non trovato.", 404);

  // Variazioni effettive (per il log e per non scrivere valori identici).
  const prima = {
    attivo: prodotto.attivo,
    prodottoTipico: prodotto.prodottoTipico,
    prodottoOfferta: prodotto.prodottoOfferta,
  };
  const nomeCambia = nuovoNome !== undefined && nuovoNome !== prodotto.nome;
  const variazioni: string[] = [];
  if (nomeCambia) {
    variazioni.push(`nome: «${prodotto.nome}» → «${nuovoNome}»`);
  }
  for (const [chiave, colonna] of Object.entries(FLAG) as [keyof typeof FLAG, string][]) {
    const nuovoValore = aggiornamenti[colonna];
    if (nuovoValore === undefined) continue;
    if (nuovoValore === prima[chiave]) continue;
    variazioni.push(
      `${ETICHETTE[chiave]}: ${nuovoValore ? "sì" : "no"}`
    );
  }

  if (variazioni.length === 0) {
    return apiError("VALIDATION_ERROR", "Nessuna modifica effettiva da applicare.", 422);
  }

  const modifiche: Record<string, unknown> = { ...aggiornamenti };
  if (nomeCambia) modifiche.nome = nuovoNome;

  const { error: updateError } = await db
    .from("prodotti")
    .update({ ...modifiche, updated_at: new Date().toISOString() })
    .eq("id", productId);

  if (updateError) {
    return apiError("UPDATE_FAILED", updateError.message ?? "Impossibile aggiornare il prodotto.", 500);
  }

  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.PRODOTTO_MODIFICATO,
    targetType: TARGET_TYPES.PRODOTTO,
    targetId: productId,
    targetName: prodotto.nome,
    negozioId: prodotto.negozioId,
    negozioNome: prodotto.negozioNome,
    result: "success",
    detail: { azione: "modifica rapida", variazioni },
  });

  // Ritorna SOLO gli aggiornamenti applicati (chiavi API del client): la UI
  // li fonde nel record locale senza bisogno di una nuova lettura.
  const risposta: Record<string, boolean | string> = {};
  if (nomeCambia) risposta.nome = String(nuovoNome);
  for (const [chiave, colonna] of Object.entries(FLAG) as [keyof typeof FLAG, string][]) {
    const valore = aggiornamenti[colonna];
    if (valore !== undefined) risposta[chiave] = valore;
  }
  return apiOk({ productId, aggiornamenti: risposta });
}

/** DELETE — eliminazione definitiva (nessun cestino prodotti). */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ productId: string }> }
) {
  const { sessione, error } = await requireApiArea("admin");
  if (error) return error;

  const db = createAdminSupabaseClient();
  const { productId } = await context.params;

  const prodotto = await leggiProdottoEnegozio(productId);
  if (!prodotto) return apiError("NOT_FOUND", "Prodotto non trovato.", 404);

  // Rimuove anche l'immagine dallo storage (coerente con la route merchant).
  await deleteImageFromStorage(prodotto.immaginePrincipale);

  const { error: deleteError } = await db
    .from("prodotti")
    .delete()
    .eq("id", productId);

  if (deleteError) {
    return apiError("DELETE_FAILED", deleteError.message ?? "Impossibile eliminare il prodotto.", 500);
  }

  await registraAttivitaAdmin({
    adminUserId: sessione.user.id,
    adminEmail: sessione.user.email ?? "",
    operationType: OPERATION_TYPES.PRODOTTO_ELIMINATO,
    targetType: TARGET_TYPES.PRODOTTO,
    targetId: productId,
    targetName: prodotto.nome,
    negozioId: prodotto.negozioId,
    negozioNome: prodotto.negozioNome,
    result: "success",
    detail: { azione: "eliminato definitivamente" },
  });

  return apiOk({ deleted: true, productId });
}
