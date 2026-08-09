import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type DuplicateOptions = {
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

export type NewStoreInput = {
  nome: string;
  slug: string;
  categoria?: string;
  sottocategoria?: string;
  citta?: string;
};

type NegozioRow = Record<string, unknown>;

type ProdottoRow = Record<string, unknown>;

export async function duplicateStore(
  userId: string,
  sourceStoreId: string,
  newStore: NewStoreInput,
  options: DuplicateOptions
): Promise<{ id: string }> {
  const supabase = createAdminSupabaseClient();

  // 1. Recupera sorgente
  const { data: source, error: srcErr } = await supabase
    .from("negozi")
    .select("*")
    .eq("id", sourceStoreId)
    .single();

  if (srcErr || !source) {
    throw new Error(srcErr?.message ?? "Negozio sorgente non trovato.");
  }

  // 2. Crea nuovo negozio
  const baseFields: Record<string, unknown> = {
    owner_user_id: userId,
    nome: newStore.nome,
    slug: newStore.slug,
    categoria: newStore.categoria ?? source.categoria ?? null,
    sottocategoria: newStore.sottocategoria ?? source.sottocategoria ?? null,
    citta: newStore.citta ?? source.citta ?? null,
    attivo: true,
    version: 1,
  };

  const { data: created, error: createErr } = await supabase
    .from("negozi")
    .insert(baseFields)
    .select("id")
    .single();

  if (createErr || !created) {
    throw new Error(createErr?.message ?? "Impossibile creare il nuovo negozio.");
  }

  const newId = created.id as string;
  const updateFields: Record<string, unknown> = {};

  // 3. Informazioni
  if (options.informazioni) {
    if ("descrizione" in source) updateFields.descrizione = source.descrizione;
    if ("descrizione_completa" in source) updateFields.descrizione_completa = source.descrizione_completa;
    if ("parole_chiave" in source) updateFields.parole_chiave = source.parole_chiave;
    if ("categoria" in source) updateFields.categoria = source.categoria;
    if ("sottocategoria" in source) updateFields.sottocategoria = source.sottocategoria;
    if ("colori" in source) updateFields.colori = source.colori;
  }

  // 4. Logo — riutilizza URL
  if (options.logo && source.logo_url) {
    updateFields.logo_url = source.logo_url;
  }

  // 5. Copertina — riutilizza URL
  if (options.copertina && source.copertina_url) {
    updateFields.copertina_url = source.copertina_url;
  }

  // 6. Galleria — riutilizza URL
  if (options.galleria && source.galleria) {
    updateFields.galleria = source.galleria;
  }

  // 7. Orari
  if (options.orari && source.orari) {
    updateFields.orari = source.orari;
  }

  // 8. Contatti
  if (options.contatti) {
    if ("telefono" in source) updateFields.telefono = source.telefono;
    if ("email_negozio" in source) updateFields.email_negozio = source.email_negozio;
    if ("whatsapp" in source) updateFields.whatsapp = source.whatsapp;
    if ("sito_web" in source) updateFields.sito_web = source.sito_web;
    if ("indirizzo" in source) updateFields.indirizzo = source.indirizzo;
    if ("provincia" in source) updateFields.provincia = source.provincia;
    if ("cap" in source) updateFields.cap = source.cap;
    if ("coordinate" in source) updateFields.coordinate = source.coordinate;
    if ("mostra_telefono" in source) updateFields.mostra_telefono = source.mostra_telefono;
    if ("mostra_indirizzo" in source) updateFields.mostra_indirizzo = source.mostra_indirizzo;
    if ("mostra_orari" in source) updateFields.mostra_orari = source.mostra_orari;
    if ("accetta_whatsapp" in source) updateFields.accetta_whatsapp = source.accetta_whatsapp;
  }

  // 9. Social
  if (options.social) {
    if ("facebook" in source) updateFields.facebook = source.facebook;
    if ("instagram" in source) updateFields.instagram = source.instagram;
    if ("tiktok" in source) updateFields.tiktok = source.tiktok;
    if ("youtube" in source) updateFields.youtube = source.youtube;
  }

  // 10. Servizi
  if (options.servizi && source.servizi) {
    updateFields.servizi = source.servizi;
  }

  // 11. SEO — copia ma aggiorna slug e URL canonica
  if (options.seo) {
    if ("seo_title" in source) updateFields.seo_title = source.seo_title;
    if ("seo_description" in source) updateFields.seo_description = source.seo_description;
    if ("seo_keywords" in source) updateFields.seo_keywords = source.seo_keywords;
  }

  // 12. AI, Offerte, Eventi — dentro data JSONB
  const mergedData: Record<string, unknown> = {};
  const srcData = (source.data ?? {}) as Record<string, unknown>;

  if (options.offerte && srcData.offerte) {
    mergedData.offerte = JSON.parse(JSON.stringify(srcData.offerte));
  }

  if (options.eventi && srcData.eventi) {
    mergedData.eventi = JSON.parse(JSON.stringify(srcData.eventi));
  }

  if (options.ai && srcData.ai_data) {
    mergedData.ai_data = JSON.parse(JSON.stringify(srcData.ai_data));
  }

  if (Object.keys(mergedData).length > 0) {
    updateFields.data = mergedData;
  }

  // 13. Moduli attivi
  if ("moduli_attivi" in source) {
    updateFields.moduli_attivi = source.moduli_attivi;
  }

  // Applica aggiornamenti
  if (Object.keys(updateFields).length > 0) {
    const { error: updErr } = await supabase
      .from("negozi")
      .update(updateFields)
      .eq("id", newId);

    if (updErr) {
      await supabase.from("negozi").delete().eq("id", newId);
      throw new Error(updErr.message ?? "Impossibile aggiornare il nuovo negozio.");
    }
  }

  // 14. Prodotti — copia con nuovi ID
  if (options.prodotti) {
    const { data: prodotti } = await supabase
      .from("prodotti")
      .select("*")
      .eq("negozio_id", sourceStoreId);

    if (prodotti && prodotti.length > 0) {
      const newProdotti = prodotti.map((p: ProdottoRow) => {
        const { id, negozio_id, created_at, updated_at, ...rest } = p;
        return {
          ...rest,
          negozio_id: newId,
        };
      });

      const { error: prodErr } = await supabase
        .from("prodotti")
        .insert(newProdotti);

      if (prodErr) {
        console.error("Errore copia prodotti:", prodErr.message);
      }
    }
  }

  // 15. Media — crea riferimenti nel media table per immagini riutilizzate
  const mediaUrls: string[] = [];

  if (options.logo && source.logo_url) mediaUrls.push(source.logo_url as string);
  if (options.copertina && source.copertina_url) mediaUrls.push(source.copertina_url as string);
  if (options.galleria && Array.isArray(source.galleria)) {
    mediaUrls.push(...(source.galleria as string[]).filter(Boolean));
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
      const { error: mediaErr } = await supabase
        .from("media")
        .insert(mediaRows);

      if (mediaErr) {
        console.error("Errore copia media:", mediaErr.message);
      }
    }
  }

  return { id: newId };
}
