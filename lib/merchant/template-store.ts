import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getTemplateById as getSystemTemplateById } from "@/components/merchant/wizard/templates";

async function loadTemplateData(templateId: string): Promise<TemplateData> {
  // System templates are defined statically in the wizard registry; only user
  // templates are stored in the DB (template_negozi) with a uuid id.
  const systemTemplate = getSystemTemplateById(templateId);
  if (systemTemplate) {
    return {
      moduli_attivi: systemTemplate.moduli_attivi,
      ...(systemTemplate.defaultColor ? { colori: systemTemplate.defaultColor } : {}),
    };
  }
  return getTemplateById(templateId);
}

export type TemplateOptions = {
  informazioni: boolean;
  logo: boolean;
  copertina: boolean;
  galleria: boolean;
  prodotti: boolean;
  servizi: boolean;
  offerte: boolean;
  eventi: boolean;
  orari: boolean;
  contatti: boolean;
  social: boolean;
  seo: boolean;
  ai: boolean;
};

export type UserTemplate = {
  id: string;
  nome: string;
  descrizione: string;
  categoria: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export type TemplateData = Record<string, unknown>;

export async function createTemplateFromStore(
  userId: string,
  sourceStoreId: string,
  meta: { nome: string; descrizione: string; categoria: string },
  options: TemplateOptions
): Promise<{ id: string }> {
  const supabase = createAdminSupabaseClient();

  const { data: source, error: srcErr } = await supabase
    .from("negozi")
    .select("*")
    .eq("id", sourceStoreId)
    .single();

  if (srcErr || !source) {
    throw new Error(srcErr?.message ?? "Negozio sorgente non trovato.");
  }

  const srcData = (source.data ?? {}) as Record<string, unknown>;
  const data: TemplateData = {};

  if (options.informazioni) {
    const info: Record<string, unknown> = {};
    if ("descrizione" in source) info.descrizione = source.descrizione;
    if ("descrizione_completa" in source) info.descrizione_completa = source.descrizione_completa;
    if ("parole_chiave" in source) info.parole_chiave = source.parole_chiave;
    if ("colori" in source) info.colori = source.colori;
    if ("sottocategoria" in source) info.sottocategoria = source.sottocategoria;
    if (Object.keys(info).length > 0) data.informazioni = info;
  }

  if (options.logo && source.logo_url) {
    data.logo_url = source.logo_url;
  }

  if (options.copertina && source.copertina_url) {
    data.copertina_url = source.copertina_url;
  }

  if (options.galleria && Array.isArray(source.galleria)) {
    data.galleria = source.galleria;
  }

  if (options.orari && source.orari) {
    data.orari = source.orari;
  }

  if (options.contatti) {
    const contatti: Record<string, unknown> = {};
    for (const k of ["telefono", "email_negozio", "whatsapp", "sito_web", "indirizzo", "provincia", "cap", "coordinate", "mostra_telefono", "mostra_indirizzo", "mostra_orari", "accetta_whatsapp"]) {
      if (k in source) contatti[k] = source[k];
    }
    if (Object.keys(contatti).length > 0) data.contatti = contatti;
  }

  if (options.social) {
    const social: Record<string, unknown> = {};
    for (const k of ["facebook", "instagram", "tiktok", "youtube"]) {
      if (k in source) social[k] = source[k];
    }
    if (Object.keys(social).length > 0) data.social = social;
  }

  if (options.servizi && Array.isArray(source.servizi)) {
    data.servizi = source.servizi;
  }

  if (options.seo) {
    const seo: Record<string, unknown> = {};
    for (const k of ["seo_title", "seo_description", "seo_keywords"]) {
      if (k in source) seo[k] = source[k];
    }
    if (Object.keys(seo).length > 0) data.seo = seo;
  }

  if (options.offerte && srcData.offerte) {
    data.offerte = JSON.parse(JSON.stringify(srcData.offerte));
  }

  if (options.eventi && srcData.eventi) {
    data.eventi = JSON.parse(JSON.stringify(srcData.eventi));
  }

  if (options.ai && srcData.ai_data) {
    data.ai_data = JSON.parse(JSON.stringify(srcData.ai_data));
  }

  if (options.prodotti) {
    const { data: prodotti } = await supabase
      .from("prodotti")
      .select("*")
      .eq("negozio_id", sourceStoreId);

    if (prodotti && prodotti.length > 0) {
      data.prodotti = prodotti.map((p: Record<string, unknown>) => {
        const { id, negozio_id, created_at, updated_at, ...rest } = p;
        return rest;
      });
    }
  }

  const { data: created, error: createErr } = await supabase
    .from("template_negozi")
    .insert({
      owner_user_id: userId,
      nome: meta.nome,
      descrizione: meta.descrizione,
      categoria: meta.categoria || null,
      data,
    })
    .select("id")
    .single();

  if (createErr) {
    throw new Error(createErr.message ?? "Impossibile creare il template.");
  }

  return { id: created.id as string };
}

export async function getTemplates(userId: string): Promise<UserTemplate[]> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("template_negozi")
    .select("id, nome, descrizione, categoria, is_system, created_at, updated_at")
    .or(`owner_user_id.eq.${userId},is_system.eq.true`)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Impossibile caricare i template.");
  }

  return (data ?? []) as UserTemplate[];
}

export async function getTemplateById(templateId: string): Promise<TemplateData> {
  const supabase = createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("template_negozi")
    .select("data")
    .eq("id", templateId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Template non trovato.");
  }

  return data.data as TemplateData;
}

export async function updateTemplate(
  templateId: string,
  userId: string,
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
    .eq("owner_user_id", userId);

  if (error) {
    throw new Error(error.message ?? "Impossibile aggiornare il template.");
  }
}

export async function deleteTemplate(templateId: string, userId: string): Promise<void> {
  const supabase = createAdminSupabaseClient();

  const { error } = await supabase
    .from("template_negozi")
    .delete()
    .eq("id", templateId)
    .eq("owner_user_id", userId);

  if (error) {
    throw new Error(error.message ?? "Impossibile eliminare il template.");
  }
}

export async function createStoreFromTemplate(
  userId: string,
  templateId: string,
  newStore: { nome: string; slug: string; categoria: string; sottocategoria?: string; citta: string }
): Promise<{ id: string }> {
  const supabase = createAdminSupabaseClient();

  const template = await loadTemplateData(templateId);
  const d = template as Record<string, unknown>;

  const { data: created, error: createErr } = await supabase
    .from("negozi")
    .insert({
      owner_user_id: userId,
      nome: newStore.nome,
      slug: newStore.slug,
      categoria: newStore.categoria,
      sottocategoria: newStore.sottocategoria ?? null,
      citta: newStore.citta,
      attivo: false,
      version: 1,
    })
    .select("id")
    .single();

  if (createErr) {
    throw new Error(createErr.message ?? "Impossibile creare il negozio.");
  }

  const newId = created.id as string;
  const updateFields: Record<string, unknown> = {};

  // Moduli attivi / colori del template
  if (d.moduli_attivi !== undefined) updateFields.moduli_attivi = d.moduli_attivi;
  if (d.colori !== undefined) updateFields.colori = d.colori;

  // Informazioni
  const info = d.informazioni as Record<string, unknown> | undefined;
  if (info) {
    if (info.descrizione !== undefined) updateFields.descrizione = info.descrizione;
    if (info.descrizione_completa !== undefined) updateFields.descrizione_completa = info.descrizione_completa;
    if (info.parole_chiave !== undefined) updateFields.parole_chiave = info.parole_chiave;
    if (info.colori !== undefined) updateFields.colori = info.colori;
    if (info.sottocategoria !== undefined && !updateFields.sottocategoria) updateFields.sottocategoria = info.sottocategoria;
  }

  // Logo / Copertina / Galleria
  if (d.logo_url) updateFields.logo_url = d.logo_url;
  if (d.copertina_url) updateFields.copertina_url = d.copertina_url;
  if (Array.isArray(d.galleria)) updateFields.galleria = d.galleria;

  // Orari
  if (d.orari) updateFields.orari = d.orari;

  // Contatti
  const contatti = d.contatti as Record<string, unknown> | undefined;
  if (contatti) {
    for (const k of ["telefono", "email_negozio", "whatsapp", "sito_web", "indirizzo", "provincia", "cap", "coordinate", "mostra_telefono", "mostra_indirizzo", "mostra_orari", "accetta_whatsapp"]) {
      if (k in contatti) updateFields[k] = contatti[k];
    }
  }

  // Social
  const social = d.social as Record<string, unknown> | undefined;
  if (social) {
    for (const k of ["facebook", "instagram", "tiktok", "youtube"]) {
      if (k in social) updateFields[k] = social[k];
    }
  }

  // Servizi
  if (Array.isArray(d.servizi)) updateFields.servizi = d.servizi;

  // SEO
  const seo = d.seo as Record<string, unknown> | undefined;
  if (seo) {
    if (seo.seo_title !== undefined) updateFields.seo_title = seo.seo_title;
    if (seo.seo_description !== undefined) updateFields.seo_description = seo.seo_description;
    if (seo.seo_keywords !== undefined) updateFields.seo_keywords = seo.seo_keywords;
  }

  // Offerte, Eventi, AI (data jsonb)
  const mergedData: Record<string, unknown> = {};
  if (d.offerte) mergedData.offerte = JSON.parse(JSON.stringify(d.offerte));
  if (d.eventi) mergedData.eventi = JSON.parse(JSON.stringify(d.eventi));
  if (d.ai_data) mergedData.ai_data = JSON.parse(JSON.stringify(d.ai_data));
  if (Object.keys(mergedData).length > 0) {
    updateFields.data = mergedData;
  }

  if (Object.keys(updateFields).length > 0) {
    const { error: updErr } = await supabase
      .from("negozi")
      .update(updateFields)
      .eq("id", newId);

    if (updErr) {
      await supabase.from("negozi").delete().eq("id", newId);
      throw new Error(updErr.message ?? "Impossibile applicare i dati del template.");
    }
  }

  // Prodotti
  if (Array.isArray(d.prodotti) && d.prodotti.length > 0) {
    const newProdotti = (d.prodotti as Record<string, unknown>[]).map((p) => ({
      ...p,
      negozio_id: newId,
    }));

    const { error: prodErr } = await supabase
      .from("prodotti")
      .insert(newProdotti);

    if (prodErr) {
      console.error("Errore copia prodotti da template:", prodErr.message);
    }
  }

  // Media references
  const mediaUrls: string[] = [];
  if (d.logo_url) mediaUrls.push(d.logo_url as string);
  if (d.copertina_url) mediaUrls.push(d.copertina_url as string);
  if (Array.isArray(d.galleria)) {
    mediaUrls.push(...(d.galleria as string[]).filter(Boolean));
  }

  if (mediaUrls.length > 0) {
    const storagePrefix = `/object/public/store-images/`;
    const mediaRows = mediaUrls
      .map((url: string) => {
        const idx = url.indexOf(storagePrefix);
        if (idx === -1) return null;
        const filePath = url.slice(idx + storagePrefix.length).split("?")[0];
        const nome = filePath.split("/").pop() ?? "immagine";
        return {
          negozio_id: newId,
          file_path: filePath,
          public_url: url,
          nome,
          mime_type: "image/jpeg",
          file_size: 0,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (mediaRows.length > 0) {
      await supabase.from("media").insert(mediaRows);
    }
  }

  return { id: newId };
}

export async function applyTemplateToStore(
  storeId: string,
  templateId: string
): Promise<void> {
  const supabase = createAdminSupabaseClient();

  const template = await loadTemplateData(templateId);
  const d = template as Record<string, unknown>;

  const updateFields: Record<string, unknown> = {};

  if (d.moduli_attivi !== undefined) updateFields.moduli_attivi = d.moduli_attivi;
  if (d.colori !== undefined) updateFields.colori = d.colori;

  const info = d.informazioni as Record<string, unknown> | undefined;
  if (info) {
    if (info.descrizione !== undefined) updateFields.descrizione = info.descrizione;
    if (info.descrizione_completa !== undefined) updateFields.descrizione_completa = info.descrizione_completa;
    if (info.parole_chiave !== undefined) updateFields.parole_chiave = info.parole_chiave;
    if (info.colori !== undefined) updateFields.colori = info.colori;
    if (info.sottocategoria !== undefined) updateFields.sottocategoria = info.sottocategoria;
  }

  if (d.logo_url) updateFields.logo_url = d.logo_url;
  if (d.copertina_url) updateFields.copertina_url = d.copertina_url;
  if (Array.isArray(d.galleria)) updateFields.galleria = d.galleria;

  if (d.orari) updateFields.orari = d.orari;

  const contatti = d.contatti as Record<string, unknown> | undefined;
  if (contatti) {
    for (const k of ["telefono", "email_negozio", "whatsapp", "sito_web", "indirizzo", "provincia", "cap", "coordinate", "mostra_telefono", "mostra_indirizzo", "mostra_orari", "accetta_whatsapp"]) {
      if (k in contatti) updateFields[k] = contatti[k];
    }
  }

  const social = d.social as Record<string, unknown> | undefined;
  if (social) {
    for (const k of ["facebook", "instagram", "tiktok", "youtube"]) {
      if (k in social) updateFields[k] = social[k];
    }
  }

  if (Array.isArray(d.servizi)) updateFields.servizi = d.servizi;

  const seo = d.seo as Record<string, unknown> | undefined;
  if (seo) {
    if (seo.seo_title !== undefined) updateFields.seo_title = seo.seo_title;
    if (seo.seo_description !== undefined) updateFields.seo_description = seo.seo_description;
    if (seo.seo_keywords !== undefined) updateFields.seo_keywords = seo.seo_keywords;
  }

  const mergedData: Record<string, unknown> = {};
  if (d.offerte) mergedData.offerte = JSON.parse(JSON.stringify(d.offerte));
  if (d.eventi) mergedData.eventi = JSON.parse(JSON.stringify(d.eventi));
  if (d.ai_data) mergedData.ai_data = JSON.parse(JSON.stringify(d.ai_data));
  if (Object.keys(mergedData).length > 0) {
    updateFields.data = mergedData;
  }

  if (Object.keys(updateFields).length > 0) {
    const { error: updErr } = await supabase
      .from("negozi")
      .update(updateFields)
      .eq("id", storeId);

    if (updErr) {
      throw new Error(updErr.message ?? "Impossibile applicare il template.");
    }
  }

  if (Array.isArray(d.prodotti) && d.prodotti.length > 0) {
    await supabase.from("prodotti").delete().eq("negozio_id", storeId);

    const newProdotti = (d.prodotti as Record<string, unknown>[]).map((p) => {
      const { id, negozio_id, created_at, updated_at, ...rest } = p;
      return rest;
    });

    const { error: prodErr } = await supabase
      .from("prodotti")
      .insert(newProdotti.map((p) => ({ ...p, negozio_id: storeId })));

    if (prodErr) {
      console.error("Errore applicazione prodotti da template:", prodErr.message);
    }
  }

  const mediaUrls: string[] = [];
  if (d.logo_url) mediaUrls.push(d.logo_url as string);
  if (d.copertina_url) mediaUrls.push(d.copertina_url as string);
  if (Array.isArray(d.galleria)) {
    mediaUrls.push(...(d.galleria as string[]).filter(Boolean));
  }

  if (mediaUrls.length > 0) {
    const storagePrefix = `/object/public/store-images/`;
    const mediaRows = mediaUrls
      .map((url: string) => {
        const idx = url.indexOf(storagePrefix);
        if (idx === -1) return null;
        const filePath = url.slice(idx + storagePrefix.length).split("?")[0];
        const nome = filePath.split("/").pop() ?? "immagine";
        return {
          negozio_id: storeId,
          file_path: filePath,
          public_url: url,
          nome,
          mime_type: "image/jpeg",
          file_size: 0,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (mediaRows.length > 0) {
      await supabase.from("media").delete().eq("negozio_id", storeId);
      await supabase.from("media").insert(mediaRows);
    }
  }
}
