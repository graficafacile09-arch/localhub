import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { areaToPath } from "@/lib/auth/area";
import { getSessionArea } from "@/lib/auth/session-area";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Amministrazione — InCittà",
};

/**
 * INGRESSO AMMINISTRATORE (/admin).
 *
 * Punto d'ingresso dedicato verso l'autenticazione e il pannello
 * amministratore GIÀ ESISTENTI — nessuna logica duplicata:
 * - non autenticato  → redirect al login amministratore esistente
 *                      (/login?area=admin, che concede l'area "admin" solo
 *                      all'email autorizzata con ruolo admin);
 * - admin autenticato → redirect al pannello esistente (/amministratore,
 *                      protetto dal layout che applica le stesse regole);
 * - autenticato ma NON amministratore → nessun accesso: redirect alla
 *                      propria area (stessa politica di sicurezza usata da
 *                      proxy e layout). Digitare /admin non bypassa nulla.
 *
 * La pagina non renderizza contenuti: si limita a instradare verso i flussi
 * esistenti, quindi non esiste alcun secondo sistema di autenticazione.
 */
export default async function AdminEntryPage() {
  // Stesso comportamento del layout amministratore in ambiente senza Supabase.
  if (!isSupabaseConfigured()) redirect("/amministratore");

  const sessione = await getSessionArea();

  if (!sessione) redirect("/login?area=admin");
  if (sessione.area === "admin") redirect("/amministratore");

  redirect(areaToPath(sessione.area));
}
