import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { toSlug } from "@/lib/slug";

/**
 * CONTENUTI EDITORIALI — helper server-side del pannello Amministratore.
 *
 * Modello minimo per l'area /amministratore/contenuti: articoli con
 * workflow editoriale (bozza / pubblicato / archiviato). Nessun contenuto
 * pubblico nelle URL: questa fase amministra SOLO il back office; una
 * eventuale pagina pubblica verrà collegata in un secondo momento.
 *
 * - tutte le letture/scritture usano il client ADMIN (service role):
 *   nessun accesso client diretto (RLS senza policy);
 * - validazione con whitelist dei campi (mai chiavi arbitrarie);
 * - slug generato dal titolo lato server, UNIVOCO (collisioni → -2, -3, …);
 * - pubblicato_il valorizzato alla prima pubblicazione, azzerato quando il
 *   contenuto torna in bozza, conservato nell'archiviazione;
 * - nessun Trash: l'eliminazione è DEFINITIVA (nessun sistema di cestino
 *   esiste per i contenuti — non ne viene creato uno).
 */

export const STATI_CONTENUTO = ["bozza", "pubblicato", "archiviato"] as const;

export type StatoContenuto = (typeof STATI_CONTENUTO)[number];

export function isStatoContenuto(value: unknown): value is StatoContenuto {
  return (
    typeof value === "string" &&
    (STATI_CONTENUTO as readonly string[]).includes(value)
  );
}

export type ContenutoAdmin = {
  id: string;
  titolo: string;
  slug: string;
  riassunto: string | null;
  corpo: string;
  immagine_url: string | null;
  autore: string | null;
  stato: StatoContenuto;
  pubblicato_il: string | null;
  updated_at: string;
  created_at: string;
};

export type InputContenuto = {
  titolo: string;
  slug?: string;
  riassunto?: string | null;
  corpo: string;
  immagine_url?: string | null;
  autore?: string | null;
  stato?: StatoContenuto;
};

const DB_NON_DISPONIBILE = "Database non disponibile.";

function getDb() {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
}

function assumiContenuto(riga: Record<string, unknown>): ContenutoAdmin {
  return {
    id: String(riga.id),
    titolo: String(riga.titolo ?? ""),
    slug: String(riga.slug ?? ""),
    riassunto: (riga.riassunto as string | null) ?? null,
    corpo: String(riga.corpo ?? ""),
    immagine_url: (riga.immagine_url as string | null) ?? null,
    autore: (riga.autore as string | null) ?? null,
    stato: isStatoContenuto(riga.stato) ? riga.stato : "bozza",
    pubblicato_il: (riga.pubblicato_il as string | null) ?? null,
    updated_at: String(riga.updated_at ?? ""),
    created_at: String(riga.created_at ?? ""),
  };
}

/** Normalizza i campi opzionali di testo (vuoto → null). */
function testoOpzionale(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const t = String(value).trim();
  return t === "" ? null : t;
}

/**
 * Slug UNIVOCO per contenuti (base Normalizzata) con fallback sicuro:
 * collisioni → "-2", "-3", … come per negozi/prodotti. La tabella è
 * verificata via admin client; se il DB non risponde viene usato uno slug
 * con suffisso temporale (mai exception).
 */
async function slugContenutoUnico(base: string, escludiId?: string): Promise<string> {
  const baseSlug = toSlug(base) || "contenuto";
  const db = getDb();
  if (!db) return `${baseSlug}-${Date.now().toString(36)}`;

  let candidato = baseSlug;
  let n = 1;
  while (n < 100) {
    let query = db
      .from("contenuti")
      .select("id", { head: true, count: "exact" })
      .eq("slug", candidato);
    if (escludiId) query = query.neq("id", escludiId);

    const { count, error } = await query;
    if (!error && (!count || count === 0)) return candidato;
    n += 1;
    candidato = `${baseSlug}-${n}`;
  }
  return `${baseSlug}-${Date.now().toString(36)}`;
}

/**
 * Valida i campi di un contenuto (whitelist). `parziale` = update:
 * ogni campo presente viene validato, nessun inserimento di chiavi ignote.
 */
export function validaCampiContenuto(
  body: Record<string, unknown>,
  opts: { parziale?: boolean } = {}
):
  | { ok: true; input: Partial<InputContenuto> & { titolo?: string; corpo?: string } }
  | { ok: false; errore: string } {
  const input: Partial<InputContenuto> = {};
  const parziale = opts.parziale === true;

  if ("titolo" in body) {
    const titolo = typeof body.titolo === "string" ? body.titolo.trim() : "";
    if (!titolo) return { ok: false, errore: "Il titolo è obbligatorio." };
    if (titolo.length > 150) return { ok: false, errore: "Il titolo non può superare 150 caratteri." };
    input.titolo = titolo;
  } else if (!parziale) {
    return { ok: false, errore: "Il titolo è obbligatorio." };
  }

  if ("slug" in body && body.slug !== undefined && body.slug !== null) {
    const slug = String(body.slug).trim().toLowerCase();
    const slugNormalizzato = toSlug(slug);
    if (!slugNormalizzato || slugNormalizzato !== slug) {
      return { ok: false, errore: "Lo slug deve essere un testo valido (solo lettere, numeri e trattini)." };
    }
    input.slug = slugNormalizzato;
  }

  if ("riassunto" in body) {
    const riassunto = testoOpzionale(body.riassunto);
    if (riassunto && riassunto.length > 400) {
      return { ok: false, errore: "Il riassunto non può superare 400 caratteri." };
    }
    input.riassunto = riassunto;
  }

  if ("corpo" in body) {
    const corpo = typeof body.corpo === "string" ? body.corpo.trim() : "";
    if (!corpo) return { ok: false, errore: "Il testo del contenuto è obbligatorio." };
    input.corpo = corpo;
  } else if (!parziale) {
    return { ok: false, errore: "Il testo del contenuto è obbligatorio." };
  }

  if ("immagine_url" in body) {
    const url = testoOpzionale(body.immagine_url);
    if (url && !/^https?:\/\//.test(url)) {
      return { ok: false, errore: "L'URL dell'immagine deve iniziare con http(s)://." };
    }
    input.immagine_url = url;
  }

  if ("autore" in body) {
    const autore = testoOpzionale(body.autore);
    if (autore && autore.length > 120) {
      return { ok: false, errore: "L'autore non può superare 120 caratteri." };
    }
    input.autore = autore;
  }

  if ("stato" in body) {
    if (!isStatoContenuto(body.stato)) {
      return { ok: false, errore: "Stato non valido." };
    }
    input.stato = body.stato;
  }

  if (Object.keys(input).length === 0) {
    return { ok: false, errore: "Nessun campo valido da salvare." };
  }

  return { ok: true, input };
}

export type RisultatoListaContenuti = {
  contenuti: ContenutoAdmin[];
  totale: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

/** Elenco contenuti (admin) — più recenti prima, paginato. */
export async function getContenutiAdmin(
  filtri: { ricerca?: string; stato?: StatoContenuto; page?: number; pageSize?: number } = {}
): Promise<RisultatoListaContenuti> {
  const page = Math.max(1, filtri.page ?? 1);
  const pageSize = Math.min(Math.max(1, filtri.pageSize ?? 20), 100);
  const offset = (page - 1) * pageSize;

  const db = getDb();
  if (!db) {
    return { contenuti: [], totale: 0, page, pageSize, hasMore: false };
  }

  try {
    let query = db.from("contenuti").select("id", { count: "exact" });
    if (filtri.stato) query = query.eq("stato", filtri.stato);
    if (filtri.ricerca) {
      query = query.or(`titolo.ilike.%${filtri.ricerca}%,riassunto.ilike.%${filtri.ricerca}%,autore.ilike.%${filtri.ricerca}%`);
    }

    const { data: righeId, count: totale, error: errConteggio } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (errConteggio) {
      console.error("[contenuti-admin] elenco fallito:", errConteggio.message);
      return { contenuti: [], totale: 0, page, pageSize, hasMore: false };
    }

    const ids = (righeId ?? []).map((r) => String((r as Record<string, unknown>).id));
    let contenuti: ContenutoAdmin[] = [];
    if (ids.length > 0) {
      const { data, error } = await db.from("contenuti").select("*").in("id", ids);
      if (!error && data) {
        contenuti = (data as Record<string, unknown>[])
          .map((riga) => assumiContenuto(riga))
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
      } else if (error) {
        console.error("[contenuti-admin] dettagli elenco falliti:", error.message);
      }
    }

    return {
      contenuti,
      totale: totale ?? 0,
      page,
      pageSize,
      hasMore: offset + ids.length < (totale ?? 0),
    };
  } catch (err) {
    console.error(
      "[contenuti-admin] elenco fallito:",
      err instanceof Error ? err.message : String(err)
    );
    return { contenuti: [], totale: 0, page, pageSize, hasMore: false };
  }
}

/** Singolo contenuto per admin (null se assente o errore). */
export async function getContenutoAdminById(id: string): Promise<ContenutoAdmin | null> {
  const db = getDb();
  if (!db) return null;
  if (!id) return null;

  try {
    const { data, error } = await db
      .from("contenuti")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return assumiContenuto(data as Record<string, unknown>);
  } catch (err) {
    console.error(
      "[contenuti-admin] lettura fallita:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/** Crea un contenuto (admin). Slug auto-se unico se non fornito. */
export async function creaContenutoAdmin(
  input: Partial<InputContenuto> & { titolo: string; corpo: string }
): Promise<{ ok: true; data: ContenutoAdmin } | { ok: false; errore: string }> {
  const db = getDb();
  if (!db) return { ok: false, errore: DB_NON_DISPONIBILE };

  try {
    const slug = input.slug ?? (await slugContenutoUnico(input.titolo));
    const stato = isStatoContenuto(input.stato) ? input.stato : "bozza";
    const pubblicato_il =
      stato === "pubblicato" ? new Date().toISOString() : null;

    const { data, error } = await db
      .from("contenuti")
      .insert({
        titolo: input.titolo,
        slug,
        riassunto: input.riassunto ?? null,
        corpo: input.corpo,
        immagine_url: input.immagine_url ?? null,
        autore: input.autore ?? null,
        stato,
        pubblicato_il,
      })
      .select("*")
      .single();

    if (error || !data) {
      return { ok: false, errore: error?.message ?? "Impossibile creare il contenuto." };
    }
    return { ok: true, data: assumiContenuto(data as Record<string, unknown>) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return { ok: false, errore: message };
  }
}

/**
 * Aggiorna un contenuto (admin, whitelist). Gestisce la data di
 * pubblicazione in modo coerente col workflow: prima pubblicazione → ora;
 * ritorno in bozza → azzerata; archiviazione → conservata.
 */
export async function aggiornaContenutoAdmin(
  id: string,
  input: Partial<InputContenuto>
): Promise<{ ok: true; data: ContenutoAdmin } | { ok: false; errore: string }> {
  const db = getDb();
  if (!db) return { ok: false, errore: DB_NON_DISPONIBILE };

  try {
    const corrente = await getContenutoAdminById(id);
    if (!corrente) return { ok: false, errore: "Contenuto non trovato." };

    const patch: Record<string, unknown> = {};

    if (input.titolo !== undefined) patch.titolo = input.titolo;
    if (input.corpo !== undefined) patch.corpo = input.corpo;
    if (input.riassunto !== undefined) patch.riassunto = input.riassunto;
    if (input.immagine_url !== undefined) patch.immagine_url = input.immagine_url;
    if (input.autore !== undefined) patch.autore = input.autore;

    // Slug: se richiesto (esplicito) o se il titolo cambia e lo slug era
    // quello auto-generato, si rigenera mantenendo l'unicità.
    if (input.slug !== undefined) {
      patch.slug = await slugContenutoUnico(input.slug, id);
    } else if (input.titolo !== undefined && input.titolo !== corrente.titolo) {
      const slugAttualeBase = toSlug(corrente.titolo);
      if (corrente.slug === slugAttualeBase || corrente.slug.startsWith(`${slugAttualeBase}-`)) {
        patch.slug = await slugContenutoUnico(input.titolo, id);
      }
    }

    if (input.stato !== undefined && input.stato !== corrente.stato) {
      patch.stato = input.stato;
      if (input.stato === "pubblicato" && !corrente.pubblicato_il) {
        patch.pubblicato_il = new Date().toISOString();
      } else if (input.stato === "bozza") {
        patch.pubblicato_il = null;
      }
    }

    if (Object.keys(patch).length === 0) {
      return { ok: false, errore: "Nessun campo da aggiornare." };
    }

    const { data, error } = await db
      .from("contenuti")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      return { ok: false, errore: error?.message ?? "Impossibile aggiornare il contenuto." };
    }
    return { ok: true, data: assumiContenuto(data as Record<string, unknown>) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return { ok: false, errore: message };
  }
}

/** Eliminazione DEFINITIVA di un contenuto (nessun trash per i contenuti). */
export async function eliminaContenutoAdmin(
  id: string
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const db = getDb();
  if (!db) return { ok: false, errore: DB_NON_DISPONIBILE };

  try {
    const { error } = await db.from("contenuti").delete().eq("id", id);
    if (error) {
      return { ok: false, errore: error.message ?? "Impossibile eliminare il contenuto." };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return { ok: false, errore: message };
  }
}