import { FAQ_PINO } from "@/lib/assistente/faq";
import { ATTRAZIONI_LUOGHI } from "@/lib/attrazioni-data";
import { TERRITORI } from "@/lib/territori";
import { FILIERE_PRODOTTI, ORDINE_FILIERE } from "@/lib/filiere-prodotti";
import { CATEGORIE, NOMI_MESI, VOCI as VOCI_STAGIONALI } from "@/lib/stagionalita/calendario";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { ContenutoPubblico } from "@/lib/contenuti-pubblici";
import type { EsitoScansione, VoceConoscenza } from "./tipi";
import { vociDaPagine, type PaginaInformativa } from "./fonti";
import { conHash, leggiTutteLePagine, type PaginaLetta } from "./sincronizzazione";

const PAGINA_CONTENUTI = 200;

/**
 * Legge TUTTI i contenuti pubblicati, a pagine, senza il limite di 500.
 * Ogni pagina dichiara il conteggio esatto; `leggiTutteLePagine` lancia errore
 * se una pagina fallisce, se il totale cambia o se le righe lette non
 * coincidono col totale. Una lista parziale non fa mai rimuovere nulla.
 */
async function raccogliContenutiPubblici(): Promise<ContenutoPubblico[]> {
  const db = createAdminSupabaseClient();
  return leggiTutteLePagine<ContenutoPubblico>(async (da, a): Promise<PaginaLetta<ContenutoPubblico>> => {
    const { data, error, count } = await db
      .from("contenuti")
      .select("id, titolo, slug, riassunto, corpo, immagine_url, autore, pubblicato_il, created_at", { count: "exact" })
      .eq("stato", "pubblicato")
      .order("id", { ascending: true })
      .range(da, a);
    if (error) return { righe: [], totale: null, errore: error.message };
    const righe = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      titolo: String(r.titolo ?? ""),
      slug: String(r.slug ?? ""),
      riassunto: (r.riassunto as string | null) ?? null,
      corpo: String(r.corpo ?? ""),
      immagine_url: (r.immagine_url as string | null) ?? null,
      autore: (r.autore as string | null) ?? null,
      pubblicato_il: (r.pubblicato_il as string | null) ?? null,
      created_at: String(r.created_at ?? ""),
    }));
    return { righe, totale: count ?? null };
  }, PAGINA_CONTENUTI);
}

/** Chiave prefisso delle voci di un contenuto (per rimozione/aggiornamento mirato). */
export function prefissoContenuto(slug: string): string {
  return `contenuto:/contenuti/${slug}#`;
}

/**
 * Aggiorna l'indice per UN contenuto dopo creazione/modifica/pubblicazione.
 * Se il contenuto è pubblicato le sue voci sono (ri)scritte; altrimenti
 * vengono rimosse logicamente. Non tocca altre voci. Mai bloccante: in caso
 * di errore lancia, e il chiamante lo registra senza far fallire il salvataggio.
 */
export async function sincronizzaContenuto(c: {
  slug: string;
  titolo: string;
  riassunto: string | null;
  corpo: string;
  stato: string;
}): Promise<void> {
  const db = createAdminSupabaseClient();
  const prefisso = prefissoContenuto(c.slug);
  const ora = new Date().toISOString();

  if (c.stato !== "pubblicato") {
    const { error } = await db
      .from("pino_conoscenza")
      .update({ stato: "rimosso", aggiornato_il: ora })
      .like("chiave", `${prefisso}%`);
    if (error) throw new Error(error.message);
    return;
  }

  const pagina: PaginaInformativa = {
    sezione: "contenuto",
    percorso: `/contenuti/${c.slug}`,
    titolo: c.titolo,
    testi: [c.riassunto ?? "", c.corpo].filter(Boolean),
  };
  const voci = conHash(vociDaPagine([pagina]));
  const righe = voci.map((v) => ({
    chiave: v.chiave,
    sezione: v.sezione,
    fonte_url: v.percorso,
    titolo: v.titolo,
    contenuto: v.testo,
    hash: v.hash,
    stato: "attivo",
    visto_il: ora,
    aggiornato_il: ora,
  }));
  if (righe.length > 0) {
    const { error } = await db.from("pino_conoscenza").upsert(righe, { onConflict: "chiave" });
    if (error) throw new Error(error.message);
  }
  // Blocchi più corti di prima: rimuove logicamente quelli eccedenti.
  const chiaviValide = voci.map((v) => v.chiave);
  const { error: errRimozione } = await db
    .from("pino_conoscenza")
    .update({ stato: "rimosso", aggiornato_il: ora })
    .like("chiave", `${prefisso}%`)
    .not("chiave", "in", `(${chiaviValide.map((k) => `"${k}"`).join(",")})`);
  if (errRimozione) throw new Error(errRimozione.message);
}

/** Rimuove logicamente le voci di un contenuto eliminato. */
export async function rimuoviContenuto(slug: string): Promise<void> {
  const db = createAdminSupabaseClient();
  const { error } = await db
    .from("pino_conoscenza")
    .update({ stato: "rimosso", aggiornato_il: new Date().toISOString() })
    .like("chiave", `${prefissoContenuto(slug)}%`);
  if (error) throw new Error(error.message);
}

/**
 * Raccoglie le fonti informative del sito. Ogni sorgente è letta in modo
 * indipendente: se una fallisce, l'intera scansione è marcata come non
 * valida e non produce cancellazioni.
 */
export async function raccogliConoscenza(): Promise<EsitoScansione> {
  try {
    const pagine: PaginaInformativa[] = [];

    for (const t of TERRITORI) {
      pagine.push({
        sezione: "territorio",
        percorso: `/territorio/${t.slug}`,
        titolo: t.nome,
        testi: [t.sommario, ...(t.racconto ?? [])].filter(Boolean),
      });
    }

    FAQ_PINO.forEach((f, i) => {
      pagine.push({
        sezione: "faq",
        percorso: `/faq#${i}`,
        titolo: f.domanda,
        testi: [f.risposta],
      });
    });

    ATTRAZIONI_LUOGHI.forEach((a) => {
      pagine.push({
        sezione: "attrazione",
        percorso: "/attrazioni",
        titolo: a.nome,
        testi: [a.descrizione],
      });
    });

    for (const nome of ORDINE_FILIERE) {
      const regola = FILIERE_PRODOTTI.find((r) => r.nome === nome);
      if (!regola) continue;
      pagine.push({
        sezione: "filiera",
        percorso: "/filiere",
        titolo: nome,
        testi: [`Filiera di prodotti tipici calabresi: ${nome}.`],
      });
    }

    for (const v of VOCI_STAGIONALI) {
      const mesi = v.mesi.map((m) => NOMI_MESI[m - 1]).join(", ");
      const categoria = CATEGORIE.find((c) => c.id === v.categoria)?.titolo ?? "";
      pagine.push({
        sezione: "stagionalita",
        percorso: `/stagionalita#${v.id}`,
        titolo: v.nome,
        testi: [
          `${categoria}. ${v.sintesi}. Mesi: ${mesi}.`,
          v.zone ? `Zone: ${v.zone}.` : "",
          v.nota ?? "",
        ].filter(Boolean),
      });
    }

    const contenuti = await raccogliContenutiPubblici();
    for (const c of contenuti) {
      pagine.push({
        sezione: "contenuto",
        percorso: `/contenuti/${c.slug}`,
        titolo: c.titolo,
        testi: [c.riassunto ?? "", c.corpo ?? ""].filter(Boolean),
      });
    }

    const voci: VoceConoscenza[] = vociDaPagine(pagine);
    if (voci.length === 0) {
      return { ok: false, errore: "nessuna voce raccolta" };
    }
    return { ok: true, completa: true, voci };
  } catch (err) {
    return {
      ok: false,
      errore: err instanceof Error ? err.message : "errore sconosciuto",
    };
  }
}
