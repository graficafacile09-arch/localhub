import { LIVELLI, type Livello } from "./tipi";
import type { ChiaveCache, RigaCache } from "./cache";
import { SCHEMI_QUALITA, type FonteUfficiale } from "./fonti";
import { consumaQuota, type EsitoQuota, type ModalitaQuota } from "./quote";

/**
 * RadiciScan — repository server.
 *
 * Unico punto in cui il nucleo parla con Supabase. La route gli passa il
 * client service-role (mai il browser): registro, cache, log e RPC quote
 * vivono tutti qui.
 *
 * Le tabelle sono quelle della migration 20261118; nessun oggetto del
 * percorso venditori viene letto o scritto.
 */

export interface RigaAnalisi {
  richiestaId: string;
  modalita: ModalitaQuota;
  utenteId: string | null;
  improntaImmagine: string | null;
  livello: Livello;
  esito: unknown;
  fonteId: string | null;
  denominazioneVerificata: string | null;
  provider: string;
  modello: string;
  durataMs: number | null;
  esitoTecnico: "ok" | "errore" | "quota" | "timeout";
  codiceErrore: string | null;
  sessioneAnonimaHash: string | null;
}

export interface RepositoryRadiciScan {
  leggiRegistro(): Promise<FonteUfficiale[]>;
  leggiCache(chiave: ChiaveCache, adesso: Date): Promise<RigaCache | null>;
  scriviCache(riga: RigaCache): Promise<void>;
  registraAnalisi(riga: RigaAnalisi): Promise<void>;
  consumaQuota(chiave: string, modalita: ModalitaQuota): Promise<EsitoQuota>;
}

// ─── Forma minima del client Supabase usata da RadiciScan ──────────────────

export interface ClientDatiRadiciScan {
  rpc(
    nome: string,
    parametri: Record<string, string>
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  from(tabella: string): TabellaRadiciScan;
}

export interface TabellaRadiciScan {
  select(colonne: string): SelettoreRadiciScan;
  insert(valori: Record<string, unknown>): PromiseLike<{
    error: { message?: string; code?: string } | null;
  }>;
  upsert(
    valori: Record<string, unknown>,
    opzioni: { onConflict: string }
  ): PromiseLike<{ error: { message?: string } | null }>;
}

/** Risposta di una query di selezione (riga singola o elenco). */
export interface RispostaSelezione {
  data: unknown;
  error: { message?: string } | null;
}

// `PromiseLike` è indispensabile: il builder Supabase è un thenable e il
// repository lo attende direttamente per leggere il registro.
export interface SelettoreRadiciScan extends PromiseLike<RispostaSelezione> {
  eq(colonna: string, valore: string | boolean): SelettoreRadiciScan;
  gt(colonna: string, valore: string): SelettoreRadiciScan;
  maybeSingle(): PromiseLike<RispostaSelezione>;
}

const COLONNE_FONTI =
  "id, slug, denominazione, tipo_atto, schema_qualita, territorio, ente, url_ufficiale, riferimento_normativo, consultata_il, attiva";

const COLONNE_CACHE =
  "impronta_immagine, versione_prompt, livello, esito, fonte_id, creato_il, scade_il";

function testo(valore: unknown): string | null {
  return typeof valore === "string" && valore.trim() !== "" ? valore : null;
}

function mappaFonte(riga: unknown): FonteUfficiale | null {
  if (riga === null || typeof riga !== "object") return null;
  const r = riga as Record<string, unknown>;

  const id = testo(r.id);
  const slug = testo(r.slug);
  const denominazione = testo(r.denominazione);
  const tipoAtto = testo(r.tipo_atto);
  const ente = testo(r.ente);
  const urlUfficiale = testo(r.url_ufficiale);
  const riferimentoNormativo = testo(r.riferimento_normativo);
  const consultataIl = testo(r.consultata_il);

  if (
    !id ||
    !slug ||
    !denominazione ||
    (tipoAtto !== "registro" && tipoAtto !== "denominazione") ||
    !ente ||
    !urlUfficiale ||
    !riferimentoNormativo ||
    !consultataIl
  ) {
    return null;
  }

  const schema = testo(r.schema_qualita);
  if (schema && !(SCHEMI_QUALITA as readonly string[]).includes(schema)) return null;

  return {
    id,
    slug,
    denominazione,
    tipoAtto,
    schemaQualita: schema as FonteUfficiale["schemaQualita"],
    territorio: testo(r.territorio),
    ente,
    urlUfficiale,
    riferimentoNormativo,
    consultataIl,
    attiva: r.attiva === true,
  };
}

function mappaCache(riga: unknown): RigaCache | null {
  if (riga === null || typeof riga !== "object") return null;
  const r = riga as Record<string, unknown>;

  const impronta = testo(r.impronta_immagine);
  const versione = testo(r.versione_prompt);
  const livello = testo(r.livello);
  const creatoIl = testo(r.creato_il);
  const scadeIl = testo(r.scade_il);

  if (
    !impronta ||
    !versione ||
    !livello ||
    !(LIVELLI as readonly string[]).includes(livello) ||
    !creatoIl ||
    !scadeIl
  ) {
    return null;
  }

  return {
    improntaImmagine: impronta,
    versionePrompt: versione,
    livello: livello as Livello,
    esito: r.esito,
    fonteId: testo(r.fonte_id),
    creatoIl,
    scadeIl,
  };
}

function rigaAnalisiSql(riga: RigaAnalisi): Record<string, unknown> {
  return {
    richiesta_id: riga.richiestaId,
    modalita: riga.modalita,
    utente_id: riga.utenteId,
    impronta_immagine: riga.improntaImmagine,
    livello: riga.livello,
    esito: riga.esito,
    fonte_id: riga.fonteId,
    denominazione_verificata: riga.denominazioneVerificata,
    provider: riga.provider,
    modello: riga.modello,
    durata_ms: riga.durataMs,
    esito_tecnico: riga.esitoTecnico,
    codice_errore: riga.codiceErrore,
    sessione_anonima_hash: riga.sessioneAnonimaHash,
  };
}

/** Costruisce il repository sul client service-role già esistente nel progetto. */
export function creaRepositorySupabase(client: ClientDatiRadiciScan): RepositoryRadiciScan {
  return {
    async leggiRegistro() {
      const { data, error } = await client
        .from("radiscan_fonti")
        .select(COLONNE_FONTI)
        .eq("attiva", true);

      if (error) throw new Error("Registro non disponibile.");
      if (!Array.isArray(data)) return [];

      return data
        .map(mappaFonte)
        .filter((fonte): fonte is FonteUfficiale => fonte !== null);
    },

    async leggiCache(chiave, adesso) {
      const { data, error } = await client
        .from("radiscan_cache")
        .select(COLONNE_CACHE)
        .eq("impronta_immagine", chiave.improntaImmagine)
        .eq("versione_prompt", chiave.versionePrompt)
        .gt("scade_il", adesso.toISOString())
        .maybeSingle();

      if (error) throw new Error("Cache non disponibile.");
      return mappaCache(data);
    },

    async scriviCache(riga) {
      const { error } = await client.from("radiscan_cache").upsert(
        {
          impronta_immagine: riga.improntaImmagine,
          versione_prompt: riga.versionePrompt,
          livello: riga.livello,
          esito: riga.esito,
          // Richiesto dai vincoli 2A: un verificato deve indicare la fonte,
          // gli altri livelli restano a null.
          fonte_id: riga.fonteId,
          creato_il: riga.creatoIl,
          scade_il: riga.scadeIl,
        },
        { onConflict: "impronta_immagine,versione_prompt" }
      );
      if (error) throw new Error("Scrittura cache non riuscita.");
    },

    async registraAnalisi(riga) {
      const valori = rigaAnalisiSql(riga);
      const { error } = await client.from("radiscan_analisi").insert(valori);
      if (!error) return;

      // Compatibilità durante il passaggio: se la migration dello storico non
      // è ancora applicata, non interrompere le analisi già funzionanti.
      // In quel caso la registrazione resta nel formato precedente e lo storico
      // anonimo diventa disponibile dopo l'applicazione della migration.
      const colonnaAssente =
        (error.code === "42703" || error.code === "PGRST204") &&
        (error.message ?? "").includes("sessione_anonima_hash");
      if (colonnaAssente) {
        const { sessione_anonima_hash: _nonUsato, ...valoriCompatibili } = valori;
        const fallback = await client
          .from("radiscan_analisi")
          .insert(valoriCompatibili);
        if (!fallback.error) return;
      }
      throw new Error("Registrazione analisi non riuscita.");
    },

    async consumaQuota(chiave, modalita) {
      return consumaQuota({
        chiave,
        modalita,
        rpc: async (nome, parametri) => {
          const { data, error } = await client.rpc(nome, parametri);
          return { data, error };
        },
      });
    },
  };
}
