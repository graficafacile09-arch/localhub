import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * IMPOSTAZIONI PIATTAFORMA — fonte UNICA per la configurazione pubblica.
 *
 * Archivio chiave-valore nella tabella public.piattaforma_settings.
 * Contiene SOLO configurazione pubblica: nessun secret, token o chiave API.
 * Valori assenti o non pubblicati → fallback, mai eccezioni.
 *
 * Chiavi modificabili SOLO quelle in CHIAVI_SALVABILI (whitelist): il client
 * non può inviare chiavi arbitrarie né toccare valori che vivono in env vars.
 */
export const CHIAVI_SALVABILI = {
  site_name: "nome piattaforma",
  site_tagline: "sottotitolo",
  city_name: "città / territorio",
  public_email: "email pubblica",
  public_phone: "telefono pubblico",
  footer_text: "testo footer",
} as const;

export type ChiaveSalvabile = keyof typeof CHIAVI_SALVABILI;

export type ImpostazionePiattaforma = {
  chiave: string;
  valore: string | null;
  tipo: string;
  descrizione: string | null;
  pubblico: boolean;
};

const DB_NON_DISPONIBILE = "Database non disponibile.";

const getDb = () => {
  try {
    return createAdminSupabaseClient();
  } catch {
    return null;
  }
};

function toMappa(righe: ImpostazionePiattaforma[] | undefined): Record<string, string | null> {
  const mappa: Record<string, string | null> = {};
  for (const riga of righe ?? []) {
    mappa[riga.chiave] = riga.valore ?? "";
  }
  return mappa;
}

/** Legge una singola impostazione; null se assente o DB non disponibile. */
export async function getImpostazione(chiave: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  const { data, error } = await db
    .from("piattaforma_settings")
    .select("valore")
    .eq("chiave", chiave)
    .maybeSingle();

  if (error || !data) return null;
  return (data.valore as string | null) ?? null;
}

/** Tutte le impostazioni PUBBLICHE, come mappa chiave → valore. */
export async function getImpostazioniPubbliche(): Promise<Record<string, string | null>> {
  const db = getDb();
  if (!db) return {};

  const { data, error } = await db
    .from("piattaforma_settings")
    .select("chiave, valore")
    .eq("pubblico", true);

  if (error) return {};
  return toMappa(data as ImpostazionePiattaforma[]);
}

/** Tutte le impostazioni per il pannello admin (con metadati). */
export async function getImpostazioniAdmin(): Promise<ImpostazionePiattaforma[]> {
  const db = getDb();
  if (!db) return [];

  const { data, error } = await db
    .from("piattaforma_settings")
    .select("*")
    .order("chiave", { ascending: true });

  if (error) return [];
  return (data as ImpostazionePiattaforma[]) ?? [];
}

/**
 * Aggiorna SOLO le chiavi della whitelist. Il campo viene trimmato e le
 * righe mancanti non vengono create: se una chiave whitelist non esiste nel
 * DB non viene scritta (risulterà fallback lato pubblico).
 */
export async function aggiornaImpostazioni(
  valori: Record<string, string>
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const db = getDb();
  if (!db) {
    return { ok: false, errore: DB_NON_DISPONIBILE };
  }

  const voci = Object.entries(valori)
    .filter(([chiave]) => chiave in CHIAVI_SALVABILI)
    .map(([chiave, valore]) => ({ chiave, valore: String(valore ?? "").trim() }));

  if (voci.length === 0) {
    return { ok: false, errore: "Nessuna impostazione ammessa da aggiornare." };
  }

  for (const voce of voci) {
    const { error } = await db
      .from("piattaforma_settings")
      .update({ valore: voce.valore })
      .eq("chiave", voce.chiave);
    if (error) {
      return { ok: false, errore: error.message };
    }
  }

  return { ok: true };
}