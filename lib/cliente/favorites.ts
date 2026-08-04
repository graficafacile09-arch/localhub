import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { utenteHaRuoli } from "@/lib/auth/roles";
import { getNegozio, getProdotto } from "@/lib/negozi";
import { getNegozioCardImmagine } from "@/lib/negozi-card-immagini";
import { getProdottoImmagine } from "@/lib/prodotti-immagini";
import type {
  ClientePreferito,
  ClientePreferitoInput,
  PreferitiFiltri,
  TipoPreferito,
} from "./types";

/**
 * Servizio Preferiti dell'Area Clienti — FASE 3.
 *
 * I preferiti sono un componente STRUTTURALE della piattaforma: ogni riga
 * salva un riferimento alla fonte reale (negozi.id uuid oppure prodotti.id
 * bigint, in riferimento_id come testo) più uno snapshot denormalizzato
 * (slug, nome, immagine, categoria) per elencare la lista senza join e
 * senza N+1. Gli snapshot alimenteranno anche notifiche, offerte
 * personalizzate e raccomandazioni AI.
 *
 * Tutte le scritture passano dal client con la sessione dell'utente:
 * l'RLS (self) garantisce che ogni utente gestisca solo i propri preferiti.
 */

type PreferitoRow = {
  id: string;
  user_id: string;
  tipo: TipoPreferito;
  riferimento_id: string;
  slug: string;
  nome: string;
  immagine_url: string | null;
  categoria: string | null;
  created_at: string;
  updated_at: string;
};

function mapPreferito(row: PreferitoRow): ClientePreferito {
  return {
    id: String(row.id),
    tipo: row.tipo,
    riferimentoId: row.riferimento_id,
    slug: row.slug,
    nome: row.nome,
    immagineUrl: row.immagine_url ?? null,
    categoria: row.categoria ?? null,
    createdAt: row.created_at ?? "",
  };
}

/** Chiave stabile di un preferito per lo stato iniziale dei pulsanti cuore. */
export function chiavePreferito(tipo: TipoPreferito, riferimentoId: string): string {
  return `${tipo}:${riferimentoId}`;
}

/**
 * Stato preferiti per le PAGINE PUBBLICHE (home, ricerca, negozi, schede).
 * Un'unica chiamata: se l'utente non è loggato — o non possiede il ruolo
 * customer (i preferiti sono una funzione dell'Area Clienti) — restituisce
 * subito il Set vuoto senza toccare il database. Le pagine passano
 * `autenticato` e `attivo` a ogni FavoritoButton senza richieste extra.
 */
export async function getStatoPreferitiPerPagina(): Promise<{
  autenticato: boolean;
  chiavi: Set<string>;
}> {
  const user = await getCurrentUser();
  if (!user) return { autenticato: false, chiavi: new Set() };

  // I preferiti appartengono all'Area Clienti: solo gli utenti con il
  // ruolo customer possono salvarli (merchant puri e admin puri no).
  const èCliente = await utenteHaRuoli(user.id, ["customer"]);
  if (!èCliente) return { autenticato: false, chiavi: new Set() };

  const chiavi = await getChiaviPreferiti(user.id);
  return { autenticato: true, chiavi };
}

/**
 * Elenco dei preferiti dell'utente con filtri, ricerca, ordinamento e
 * paginazione (predisposti per le evoluzioni future).
 */
export async function getPreferitiUtente(
  userId: string,
  filtri: PreferitiFiltri = {}
): Promise<ClientePreferito[]> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("preferiti")
    .select("*")
    .eq("user_id", userId);

  if (filtri.tipo && filtri.tipo !== "tutti") {
    query = query.eq("tipo", filtri.tipo);
  }

  if (filtri.q?.trim()) {
    query = query.ilike("nome", `%${filtri.q.trim()}%`);
  }

  if (filtri.ordine === "nome") {
    query = query.order("nome", { ascending: true });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  if (typeof filtri.limite === "number" && filtri.limite > 0) {
    query = query.limit(filtri.limite);
    if (typeof filtri.offset === "number" && filtri.offset > 0) {
      query = query.range(filtri.offset, filtri.offset + filtri.limite - 1);
    }
  }

  const { data, error } = await query;

  if (error) return [];
  return (data as PreferitoRow[]).map(mapPreferito);
}

/**
 * Conteggio dei preferiti dell'utente (per le card della dashboard).
 * `tipo` è opzionale: senza filtro conta tutti, con filtro solo una tipologia.
 */
export async function getConteggioPreferiti(
  userId: string,
  tipo?: TipoPreferito
): Promise<number> {
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("preferiti")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (tipo) query = query.eq("tipo", tipo);

  const { count, error } = await query;

  if (error) return 0;
  return count ?? 0;
}

/**
 * Set di chiavi "tipo:riferimentoId" dei preferiti dell'utente.
 * Usato dalle pagine pubbliche per mostrare il cuore già acceso
 * (un'unica query, nessun N+1).
 */
export async function getChiaviPreferiti(userId: string): Promise<Set<string>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("preferiti")
    .select("tipo, riferimento_id")
    .eq("user_id", userId);

  if (error) return new Set();

  return new Set(
    (data ?? []).map((row) => chiavePreferito(row.tipo, row.riferimento_id))
  );
}

/**
 * Aggiunge un negozio o prodotto ai preferiti.
 * Lo snapshot (slug, nome, immagine, categoria) viene costruito leggendo
 * i dati REALI dalla fonte (negozi/prodotti), mai dai parametri del client.
 * Idempotente: se il preferito esiste già, restituisce quello esistente.
 */
export async function aggiungiPreferito(
  userId: string,
  input: ClientePreferitoInput
): Promise<ClientePreferito | null> {
  const fonte = await caricaFonte(input.tipo, input.riferimentoId);
  if (!fonte) return null;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("preferiti")
    .upsert(
      {
        user_id: userId,
        tipo: input.tipo,
        riferimento_id: input.riferimentoId,
        slug: fonte.slug,
        nome: fonte.nome,
        immagine_url: fonte.immagineUrl,
        categoria: fonte.categoria,
      },
      { onConflict: "user_id,tipo,riferimento_id" }
    )
    .select("*")
    .single();

  if (error || !data) return null;
  return mapPreferito(data as PreferitoRow);
}

/** Rimuove un preferito per id (solo se appartiene all'utente). */
export async function rimuoviPreferito(
  userId: string,
  preferitoId: string
): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("preferiti")
    .delete()
    .eq("id", preferitoId)
    .eq("user_id", userId);

  return !error;
}

/** Rimuove un preferito per riferimento reale (toggle del cuore). */
export async function rimuoviPreferitoPerRiferimento(
  userId: string,
  tipo: TipoPreferito,
  riferimentoId: string
): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("preferiti")
    .delete()
    .eq("user_id", userId)
    .eq("tipo", tipo)
    .eq("riferimento_id", riferimentoId);

  return !error;
}

/** Dati reali della fonte usati per costruire lo snapshot del preferito. */
async function caricaFonte(
  tipo: TipoPreferito,
  riferimentoId: string
): Promise<{ slug: string; nome: string; immagineUrl: string | null; categoria: string | null } | null> {
  if (tipo === "negozio") {
    const negozio = await getNegozio(riferimentoId);
    if (!negozio) return null;
    return {
      slug: String(negozio.slug ?? negozio.id),
      nome: String(negozio.nome ?? ""),
      immagineUrl: getNegozioCardImmagine({
        logo_url: (negozio.logo_url as string | null) ?? null,
        categoria: (negozio.categoria as string | null) ?? null,
      }),
      categoria: (negozio.categoria as string | null) ?? null,
    };
  }

  const prodotto = await getProdotto(riferimentoId);
  if (!prodotto) return null;
  return {
    slug: String(prodotto.slug ?? prodotto.id),
    nome: String(prodotto.nome ?? ""),
    immagineUrl: getProdottoImmagine({
      immagine_principale: (prodotto.immagine_principale as string | null) ?? null,
      categoria: (prodotto.categoria as string | null) ?? null,
    }),
    categoria: (prodotto.categoria as string | null) ?? null,
  };
}
