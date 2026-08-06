import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Recupero password — invia il link di reset via email.
 *
 * Il link generato da Supabase porta alla pagina /reset-password con i token
 * di recupero (fragment): quella pagina (client) li processa e permette di
 * impostare la nuova password.
 *
 * La risposta è VOLUTAMENTE identica per email esistente e non esistente
 * (anti-enumeration): non viene mai rivelato se un account esiste o meno.
 */
export async function POST(request: Request) {
  const pageUrl = new URL("/recupero-password", request.url);

  if (!isSupabaseConfigured()) {
    pageUrl.searchParams.set("error", "Configurazione Supabase mancante.");
    return NextResponse.redirect(pageUrl);
  }

  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    pageUrl.searchParams.set("error", "Inserisci l'email del tuo account.");
    return NextResponse.redirect(pageUrl);
  }

  const supabase = await createServerSupabaseClient();
  const resetUrl = new URL("/reset-password", request.url);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: resetUrl.toString(),
  });

  if (error) {
    console.error(
      "[recupero-password] resetPasswordForEmail:",
      `code=${error.status ?? "n/a"} message=${error.message}`,
    );
  }

  // Esito identico in ogni caso: l'utente deve solo controllare la posta.
  pageUrl.searchParams.set("sent", "1");
  return NextResponse.redirect(pageUrl);
}
