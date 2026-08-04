import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  deleteImageFromStorage,
  uploadDataUrlToStorage,
} from "@/lib/supabase/storage";
import type { ClienteProfilo, ClienteProfiloInput } from "./types";

/** Bucket dedicato agli avatar degli utenti. */
const AVATAR_BUCKET = "avatars";

type ProfiloRow = {
  id: string;
  user_id: string;
  nome: string;
  cognome: string;
  telefono: string | null;
  avatar_url: string | null;
  indirizzo: string | null;
  citta: string | null;
  cap: string | null;
  provincia: string | null;
  created_at: string;
  updated_at: string;
};

function mapProfilo(row: ProfiloRow): ClienteProfilo {
  return {
    id: String(row.id),
    nome: row.nome ?? "",
    cognome: row.cognome ?? "",
    email: "", // valorizzata dalla route con l'email di auth.users
    avatarUrl: row.avatar_url ?? null,
    telefono: row.telefono ?? null,
    indirizzo: row.indirizzo ?? null,
    citta: row.citta ?? null,
    cap: row.cap ?? null,
    provincia: row.provincia ?? null,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

/**
 * Recupera il profilo dell'utente (se esiste già una riga in cliente_profili).
 * L'email non è presente qui: la route la unisce da auth.users.
 */
export async function getProfilo(
  userId: string
): Promise<ClienteProfilo | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cliente_profili")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return mapProfilo(data as ProfiloRow);
}

/**
 * Crea o aggiorna il profilo dell'utente (upsert su user_id).
 * L'email resta di sola lettura da auth.users: non viene mai scritta qui.
 */
export async function aggiornaProfilo(
  userId: string,
  input: ClienteProfiloInput
): Promise<ClienteProfilo | null> {
  const supabase = await createServerSupabaseClient();

  const payload: Record<string, unknown> = {
    user_id: userId,
    nome: input.nome.trim(),
    cognome: input.cognome.trim(),
    telefono: input.telefono?.trim() || null,
    indirizzo: input.indirizzo?.trim() || null,
    citta: input.citta?.trim() || null,
    cap: input.cap?.trim() || null,
    provincia: input.provincia?.trim() || null,
  };

  const { data, error } = await supabase
    .from("cliente_profili")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error || !data) return null;
  return mapProfilo(data as ProfiloRow);
}

/**
 * Aggiorna l'avatar: carica la nuova immagine nel bucket dedicato,
 * rimuove la vecchia da storage e salva il nuovo URL sul profilo.
 */
export async function aggiornaAvatar(
  userId: string,
  dataUrl: string
): Promise<ClienteProfilo | null> {
  const current = await getProfilo(userId);

  const nuovaUrl = await uploadDataUrlToStorage(dataUrl, AVATAR_BUCKET);

  const supabase = await createServerSupabaseClient();
  // Upsert su user_id: funziona anche se la riga profilo non esiste ancora
  // (utente che sceglie l'avatar prima di salvare il form).
  const { data, error } = await supabase
    .from("cliente_profili")
    .upsert({ user_id: userId, avatar_url: nuovaUrl }, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error || !data) {
    // Pulizia dell'immagine appena caricata se l'aggiornamento è fallito.
    await deleteImageFromStorage(nuovaUrl, AVATAR_BUCKET);
    return null;
  }

  // Rimuove l'avatar precedente (solo dopo il successo dell'update).
  if (current?.avatarUrl && current.avatarUrl !== nuovaUrl) {
    await deleteImageFromStorage(current.avatarUrl, AVATAR_BUCKET);
  }

  return mapProfilo(data as ProfiloRow);
}
