import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Callback PKCE di recupero password.
 *
 * Il link dell'email ha la forma
 *   /auth/v1/verify?token=pkce_...&type=recovery&redirect_to=/reset-password
 * GoTrue lo scambia e reindirizza a /reset-password con il `code` di
 * autorizzazione in query string. Il vero scambio (exchangeCodeForSession)
 * deve avvenire QUI, in una route handler, perché solo da qui è possibile
 * scrivere i cookie di sessione (i layout/pagine non possono) e perché il
 * code_verifier è conservato in un cookie httpOnly leggibile dal server.
 */
export async function GET(request: NextRequest) {
  const resetUrl = new URL("/reset-password", request.url);
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    resetUrl.searchParams.set("err", "Codice di recupero mancante.");
    return NextResponse.redirect(resetUrl);
  }

  if (!isSupabaseConfigured()) {
    resetUrl.searchParams.set("err", "Configurazione Supabase mancante.");
    return NextResponse.redirect(resetUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error(
      "[callback-recovery] exchangeCodeForSession:",
      `status=${error.status ?? "n/a"} message=${error.message}`,
    );
    resetUrl.searchParams.set(
      "err",
      "Impossibile validare il link di recupero. Richiedi un nuovo link.",
    );
    return NextResponse.redirect(resetUrl);
  }

  // Sessione di recovery stabilita nei cookie: la pagina /reset-password
  // mostrerà il modulo per impostare la nuova password.
  return NextResponse.redirect(new URL("/reset-password", request.url));
}