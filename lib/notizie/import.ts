import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { acquisisciFonte } from "./acquisitori";
import type { VoceAcquisita } from "./acquisitori";
import { HOST_WHITELIST, fonteDaDb } from "./fonti";
import { assegnaCategoria, isPertinenteCastrovillari } from "./filtro";
import type { FonteDb, FonteNotizie, NotiziaNormalizzata, RiepilogoImport } from "./types";

/**
 * IMPORT — orchestrazione del job di aggiornamento notizie.
 *
 * Flusso per ogni fonte attiva (con frequenza scaduta):
 *   acquisizione → normalizzazione → filtro Castrovillari → dedup → upsert.
 *
 * V2 (fonti di discovery Google News, `fonte.scoperta = true`):
 * - finestra temporale di 30 giorni: NON si importa mai l'archivio storico;
 * - dedup INTRA-RUN tra le query Google News (stesso titolo ripulito oppure
 *   stesso guid + stessa testata importato una sola volta). Il vincolo DB
 *   `unique(dedup_hash)` resta la rete di sicurezza finale;
 * - `source_name` = testata originale dell'articolo (dal `<source>` di
 *   Google News), non "Google News".
 * Le 5 fonti istituzionali V1 mantengono il comportamento esatto di prima.
 *
 * - `dryRun=true`: NON scrive nel database (utile per test sicuri e per
 *   una verifica manuale dell'endpoint senza toccare dati reali).
 * - BEST-EFFORT: un errore su una fonte non blocca le altre.
 */

/** Finestra temporale per le fonti di discovery (giorni, da oggi). */
export const FINESTRA_DISCOVERY_GIORNI = 30;

/**
 * True se la notizia è fuori dalla finestra di discovery (più vecchia di
 * 30 giorni) o se la data non è disponibile/valida (in quel caso non la si
 * importa: per una fonte di discovery una data assente è inaffidabile).
 * Usata SOLO per le fonti con `scoperta = true`.
 */
export function isFuoriFinestraDiscovery(
  publishedAt: string | null,
  ora = Date.now()
): boolean {
  if (!publishedAt) return true;
  const t = new Date(publishedAt).getTime();
  if (Number.isNaN(t)) return true;
  return ora - t > FINESTRA_DISCOVERY_GIORNI * 24 * 60 * 60 * 1000;
}

/**
 * Chiavi di dedup intra-run per una notizia di discovery: l'hash del titolo
 * ripulito e, se disponibile, la coppia testata+guid (due query Google News
 * che ritrovano lo stesso articolo condividono il guid: verificato). Se una
 * chiave è già stata vista nell'esecuzione la notizia viene saltata.
 */
export function chiaviDedupScoperta(n: NotiziaNormalizzata): string[] {
  const chiavi = [n.dedupHash];
  if (n.sourceName && n.externalId) {
    chiavi.push(`scoperta:${n.sourceName}:${n.externalId}`);
  }
  return chiavi;
}

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
 * Per gli item Google News (discovery) `voce.source` è la testata originale
 * e ha la precedenza su `fonte.nome`.
 */
export function normalizzaVoce(
  fonte: FonteNotizie,
  voce: VoceAcquisita
): NotiziaNormalizzata {
  return {
    fonteId: fonte.id,
    sourceName: voce.source?.trim() || fonte.nome,
    title: voce.title.slice(0, 500),
    excerpt: voce.excerpt ? voce.excerpt.slice(0, 600) : null,
    originalUrl: voce.url,
    externalId: voce.externalId,
    publishedAt: voce.data,
    category: assegnaCategoria(voce.title, voce.excerpt, fonte.categoriaDefault),
    imageUrl: null, // V1/V2: nessuna immagine (non chiaramente riutilizzabile).
    dedupHash: calcolaDedupHash(voce.title),
  };
}

const CAMPI_FONTI_V1 =
  "id, nome, tipo, url_feed, url_lista, url_base, categoria_default, attiva, frequenza_minuti, ultima_esecuzione";

/**
 * Legge le fonti attive dal database (tabella notizie_fonti).
 *
 * Se la migration V2 (colonna `scoperta`) non è ancora applicata, ripiega
 * sui soli campi V1: le 5 fonti istituzionali continuano a funzionare anche
 * con il vecchio schema (le fonti discovery non vengono lette finché la
 * colonna non esiste). Una volta applicata la migration si leggono anche le
 * fonti Google News.
 */
export async function leggiFontiAttive(db: SupabaseClient): Promise<FonteNotizie[]> {
  const { data, error } = await db
    .from("notizie_fonti")
    .select(`${CAMPI_FONTI_V1}, scoperta`)
    .eq("attiva", true)
    .order("nome", { ascending: true });
  if (!error) {
    return (data ?? []).map((r) => fonteDaDb(r as FonteDb));
  }

  // Schema pre-V2: colonna scoperta assente → rileggi con i soli campi V1.
  console.warn(
    "[notizie] colonna scoperta non disponibile (migration V2 non applicata?):",
    error.message
  );
  const { data: dataV1, error: errorV1 } = await db
    .from("notizie_fonti")
    .select(CAMPI_FONTI_V1)
    .eq("attiva", true)
    .order("nome", { ascending: true });
  if (errorV1) {
    console.error("[notizie] lettura fonti fallita:", errorV1.message);
    return [];
  }
  return (dataV1 ?? []).map((r) =>
    fonteDaDb({ ...(r as FonteDb), scoperta: false })
  );
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
 * Legge le fonti dal DB e delega il lavoro a eseguiImportFonti.
 */
export async function eseguiImportNotizie(options: {
  db: SupabaseClient;
  dryRun?: boolean;
  dettagli?: boolean;
}): Promise<RiepilogoImport> {
  const { db, dryRun = false, dettagli = false } = options;
  const fonti = await leggiFontiAttive(db);
  return eseguiImportFonti({ fonti, db, dryRun, dettagli });
}

/**
 * Core dell'import su una lista esplicita di fonti (usata dal cron con le
 * fonti lette dal DB; riusabile in dry-run offline per i test senza DB).
 * `db` serve solo all'aggiornamento di `ultima_esecuzione` (mai in dry-run).
 */
export async function eseguiImportFonti(options: {
  fonti: FonteNotizie[];
  db?: SupabaseClient | null;
  dryRun?: boolean;
  dettagli?: boolean;
}): Promise<RiepilogoImport> {
  const { fonti, db = null, dryRun = false, dettagli = false } = options;
  const riepilogo: RiepilogoImport = { imported: 0, skipped: 0, errors: 0, perFonte: {} };
  if (dettagli) riepilogo.dettagli = [];

  if (fonti.length === 0) {
    console.warn("[notizie] nessuna fonte attiva configurata");
    return riepilogo;
  }

  // V2: dedup intra-run tra le fonti di discovery (le due query Google News).
  const dedupRunVisti = new Set<string>();

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

      // 3. Normalizzazione + filtro Castrovillari + regole discovery.
      const normalizzate: NotiziaNormalizzata[] = [];
      for (const voce of voci) {
        if (!isPertinenteCastrovillari({ fonteId: fonte.id, title: voce.title, excerpt: voce.excerpt })) {
          esito.skipped += 1;
          continue;
        }
        const n = normalizzaVoce(fonte, voce);

        if (fonte.scoperta) {
          // Finestra temporale di 30 giorni: il primo run non importa l'archivio.
          if (isFuoriFinestraDiscovery(n.publishedAt)) {
            esito.skipped += 1;
            continue;
          }
          // Dedup intra-run tra le due query Google News.
          const giaVista = chiaviDedupScoperta(n).some((k) => dedupRunVisti.has(k));
          if (giaVista) {
            esito.skipped += 1;
            continue;
          }
          for (const chiave of chiaviDedupScoperta(n)) dedupRunVisti.add(chiave);
        }

        normalizzate.push(n);
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

      // In scrittura reale il client Supabase è obbligatorio.
      if (!db) {
        throw new Error("db mancante: import non-dry richiede il client Supabase");
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
