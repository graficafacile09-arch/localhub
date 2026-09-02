import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { acquisisciFonte } from "./acquisitori";
import { HOST_WHITELIST, fonteDaDb } from "./fonti";
import { assegnaCategoria, isPertinenteCastrovillari } from "./filtro";
import type { FonteDb, FonteNotizie, NotiziaNormalizzata, RiepilogoImport } from "./types";

/**
 * IMPORT — orchestrazione del job di aggiornamento notizie.
 *
 * Flusso per ogni fonte attiva (con frequenza scaduta):
 *   acquisizione → normalizzazione → filtro Castrovillari → dedup → upsert.
 *
 * - `dryRun=true`: NON scrive nel database (utile per test sicuri e per
 *   una verifica manuale dell'endpoint senza toccare dati reali).
 * - BEST-EFFORT: un errore su una fonte non blocca le altre.
 */

/** Calcola l'hash di dedup: SHA-256 del titolo normalizzato. */
export function calcolaDedupHash(title: string): string {
  const normalizzato = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalizzato).digest("hex");
}

/**
 * Normalizza una voce acquisita nel formato interno (NotiziaNormalizzata).
 * L'excerpt è limitato a poche centinaia di caratteri: mai testi integrali.
 */
export function normalizzaVoce(
  fonte: FonteNotizie,
  voce: { title: string; url: string; excerpt: string | null; data: string | null; externalId: string | null }
): NotiziaNormalizzata {
  return {
    fonteId: fonte.id,
    sourceName: fonte.nome,
    title: voce.title.slice(0, 500),
    excerpt: voce.excerpt ? voce.excerpt.slice(0, 600) : null,
    originalUrl: voce.url,
    externalId: voce.externalId,
    publishedAt: voce.data,
    category: assegnaCategoria(voce.title, voce.excerpt, fonte.categoriaDefault),
    imageUrl: null, // V1: nessuna immagine dalle fonti (non chiaramente riutilizzabile).
    dedupHash: calcolaDedupHash(voce.title),
  };
}

/** Legge le fonti attive dal database (tabella notizie_fonti). */
export async function leggiFontiAttive(db: SupabaseClient): Promise<FonteNotizie[]> {
  const { data, error } = await db
    .from("notizie_fonti")
    .select("id, nome, tipo, url_feed, url_lista, url_base, categoria_default, attiva, frequenza_minuti, ultima_esecuzione")
    .eq("attiva", true)
    .order("nome", { ascending: true });

  if (error) {
    console.error("[notizie] lettura fonti fallita:", error.message);
    return [];
  }
  return (data ?? []).map((r) => fonteDaDb(r as FonteDb));
}

/** True se la frequenza della fonte è scaduta (o mai eseguita). */
export function frequenzaScaduta(fonte: FonteNotizie, ultimaEsecuzione: string | null): boolean {
  if (!ultimaEsecuzione) return true;
  const last = new Date(ultimaEsecuzione).getTime();
  if (Number.isNaN(last)) return true;
  return Date.now() - last >= fonte.frequenzaMinuti * 60_000;
}

/**
 * Esegue l'import completo per le fonti attive con frequenza scaduta.
 * Ritorna SEMPRE un riepilogo (mai throw).
 */
export async function eseguiImportNotizie(options: {
  db: SupabaseClient;
  dryRun?: boolean;
  dettagli?: boolean;
}): Promise<RiepilogoImport> {
  const { db, dryRun = false, dettagli = false } = options;
  const riepilogo: RiepilogoImport = { imported: 0, skipped: 0, errors: 0, perFonte: {} };
  if (dettagli) riepilogo.dettagli = [];

  const fonti = await leggiFontiAttive(db);
  if (fonti.length === 0) {
    console.warn("[notizie] nessuna fonte attiva configurata");
    return riepilogo;
  }

  for (const fonte of fonti) {
    const esito: RiepilogoImport["perFonte"][string] = { imported: 0, skipped: 0 };
    riepilogo.perFonte[fonte.nome] = esito;

    try {
      // 1. Frequenza minima rispettata (ultima_esecuzione dalla fonte letta).
      if (!frequenzaScaduta(fonte, fonte.ultimaEsecuzione ?? null)) {
        esito.skipped += 1; // fonte già aggiornata di recente
        continue;
      }

      // 2. Acquisizione.
      const voci = await acquisisciFonte(fonte, HOST_WHITELIST);
      if (voci.length === 0) {
        esito.skipped += 1;
        console.warn(`[notizie] ${fonte.nome}: nessuna voce acquisita`);
        continue;
      }

      // 3. Normalizzazione + filtro Castrovillari.
      const normalizzate: NotiziaNormalizzata[] = [];
      for (const voce of voci) {
        if (!isPertinenteCastrovillari({ fonteId: fonte.id, title: voce.title, excerpt: voce.excerpt })) {
          esito.skipped += 1;
          continue;
        }
        normalizzate.push(normalizzaVoce(fonte, voce));
      }

      if (normalizzate.length === 0) {
        esito.skipped += 1;
        continue;
      }

      // 4. Upsert con dedup (unique fonte_id+external_id e dedup_hash).
      if (dryRun) {
        esito.imported += normalizzate.length;
        riepilogo.imported += normalizzate.length;
        if (dettagli) {
          for (const n of normalizzate) riepilogo.dettagli!.push(`[${fonte.nome}] ${n.title}`);
        }
        continue;
      }

      const righe = normalizzate.map((n) => ({
        fonte_id: n.fonteId,
        source_name: n.sourceName,
        title: n.title,
        excerpt: n.excerpt,
        original_url: n.originalUrl,
        external_id: n.externalId,
        published_at: n.publishedAt,
        category: n.category,
        image_url: n.imageUrl,
        dedup_hash: n.dedupHash,
        stato: "published",
      }));

      const { error } = await upsertNotizie(db, righe);
      if (error) {
        throw new Error(`upsert fallito: ${error.message}`);
      }
      esito.imported += normalizzate.length;
      riepilogo.imported += normalizzate.length;
      if (dettagli) {
        for (const n of normalizzate) riepilogo.dettagli!.push(`[${fonte.nome}] ${n.title}`);
      }

      // Aggiorna l'ultima esecuzione della fonte.
      const { error: errUpd } = await db
        .from("notizie_fonti")
        .update({ ultima_esecuzione: new Date().toISOString() })
        .eq("id", fonte.id);
      if (errUpd) {
        console.error(`[notizie] aggiornamento ultima_esecuzione ${fonte.nome} fallito:`, errUpd.message);
      }
    } catch (err) {
      esito.error = (err as Error)?.message ?? "errore sconosciuto";
      esito.errors = (esito.errors ?? 0) + 1;
      riepilogo.errors += 1;
      console.error(`[notizie] errore fonte ${fonte.nome}:`, esito.error);
    }
  }

  return riepilogo;
}

/**
 * Upsert delle notizie con dedup:
 * - external_id null (feed senza guid): univocità garantita da dedup_hash;
 * - stesso titolo normalizzato da fonti diverse: dedup_hash lo blocca.
 */
export async function upsertNotizie(
  db: SupabaseClient,
  righe: unknown[]
): Promise<{ error: { message: string } | null }> {
  // upsert con ignoreDuplicates: se dedup_hash esiste già (stessa notizia
  // da questa o da un'altra fonte) la riga viene ignorata, non sovrascritta.
  return db.from("notizie").upsert(righe, {
    onConflict: "dedup_hash",
    ignoreDuplicates: true,
  });
}