import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  createTemplateFromStore,
  type TemplateOptions,
  type UserTemplate,
} from "@/lib/merchant/template-store";

/**
 * Template di PIATTAFORMA — funzione di amministrazione.
 * L'amministratore può creare (da un negozio sorgente), modificare ed
 * eliminare QUALSIASI template; i commercianti possono solo sceglierli
 * durante la creazione del negozio (o applicarli al proprio).
 */

/** Tutti i template presenti sulla piattaforma. */
export async function getTutteTemplate(): Promise<UserTemplate[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("template_negozi")
    .select("id, nome, descrizione, categoria, is_system, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Impossibile caricare i template.");
  }

  return (data ?? []) as UserTemplate[];
}

/** Crea un template di piattaforma da un negozio sorgente. */
export async function creaTemplateAdmin(
  adminId: string,
  sourceStoreId: string,
  meta: { nome: string; descrizione: string; categoria: string },
  options: TemplateOptions
): Promise<{ id: string }> {
  return createTemplateFromStore(adminId, sourceStoreId, meta, options);
}

/** Aggiorna un template (nessun filtro proprietario: l'admin gestisce tutto). */
export async function aggiornaTemplateAdmin(
  templateId: string,
  updates: { nome?: string; descrizione?: string; categoria?: string }
): Promise<void> {
  const supabase = createAdminSupabaseClient();
  const payload: Record<string, unknown> = {};
  if (updates.nome !== undefined) payload.nome = updates.nome;
  if (updates.descrizione !== undefined) payload.descrizione = updates.descrizione;
  if (updates.categoria !== undefined) payload.categoria = updates.categoria;

  const { error } = await supabase
    .from("template_negozi")
    .update(payload)
    .eq("id", templateId)
    .eq("is_system", false);

  if (error) {
    throw new Error(error.message ?? "Impossibile aggiornare il template.");
  }
}

/** Elimina un template (i template di sistema non sono eliminabili). */
export async function eliminaTemplateAdmin(templateId: string): Promise<void> {
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("template_negozi")
    .delete()
    .eq("id", templateId)
    .eq("is_system", false);

  if (error) {
    throw new Error(error.message ?? "Impossibile eliminare il template.");
  }
}
