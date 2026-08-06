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

  // === LOG DIAGNOSTICO (solo logging, nessuna modifica alla logica) ===
  const cookies = request.cookies.getAll();
  const verifierCookie = cookies.find((c) =>
    c.name.endsWith("-auth-token-code-verifier"),
  );
  console.log("[callback-recovery][diag] ====== INIZIO CALLBACK ====");
  console.log("[callback-recovery][diag] URL completo richiesto:", request.url);
  console.log(
    "[callback-recovery][diag] searchParams:",
    JSON.stringify(Object.fromEntries(request.nextUrl.searchParams.entries())),
  );
  console.log("[callback-recovery][diag] valore code:", code);
  console.log(
    "[callback-recovery][diag] tutti i cookie ricevuti:",
    JSON.stringify(cookies.map((c) => ({ name: c.name, value: c.value }))),
  );
  console.log(
    "[callback-recovery][diag] cookie code-verifier:",
    verifierCookie
      ? JSON.stringify({
          name: verifierCookie.name,
          value: verifierCookie.value,
        })
      : "(NON PRESENTE)",
  );
  // ====== FINE DIAGNOSTICA ======

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  console.log("[callback-recovery][diag] risposta Supabase (completa):");
  console.log(
    "[callback-recovery][diag] successo:",
    error ? "NO" : "SI",
    error ? "" : JSON.stringify(data),
  );
  if (error) {
    console.error("[callback-recovery][diag] risposta Supabase (errore):");
    console.error(JSON.stringify(error, null, 2));
    console.error(
      "[callback-recovery][diag] stack completo:",
      error.stack ?? "(nessuno stack)",
    );
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