import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AREA_COOKIE, areaCookieOptions } from "@/lib/auth/area";

/**
 * CALLBACK DI CONFERMA EMAIL (nuovo cliente).
 *
 * Arrivo: il link dell'email di conferma porta prima a Supabase
 * (/auth/v1/verify) che CONFERMA l'account e reindirizza il browser a
 * /auth/callback?code=... (flusso PKCE del client server dell'app).
 *
 * Passaggi:
 *  1. scambio del codice PKCE → sessione reale (exchangeCodeForSession);
 *     fallback: token_hash + type → verifyOtp (link non PKCE);
 *  2. verifica che l'utente sia realmente autenticato/confermato;
 *  3. garanzia idempotente del ruolo customer (SOLO server-side);
 *  4. cookie area cliente + redirect a /cliente.
 *
 * Nessuna sessione falsa: senza uno scambio riuscito NON si entra nell'area.
 */
export async function GET(request: Request) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("area", "cliente");

  if (!isSupabaseConfigured()) {
    loginUrl.searchParams.set("error", "Configurazione Supabase mancante.");
    return NextResponse.redirect(loginUrl);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  // Errore riportato da GoTrue (es. link scaduto/invalidato).
  const errMsg = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (errMsg) {
    console.error(
      "[auth/callback] Errore da GoTrue:",
      `code=${url.searchParams.get("error_code") ?? "n/a"} desc=${errMsg}`,
    );
    loginUrl.searchParams.set(
      "error",
      "Il link di conferma non è più valido o è già stato usato. Se hai già confermato, accedi; altrimenti registrati di nuovo.",
    );
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createServerSupabaseClient();

  let exchangeError: { message?: string; status?: number } | null = null;
  try {
    if (code) {
      // Flusso PKCE: scambio del codice con il code_verifier conservato nel
      // cookie httpOnly della registrazione.
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      exchangeError = error;
    } else if (tokenHash && type) {
      // Link classico (token_hash): stabilisce la sessione dopo la conferma.
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      exchangeError = error;
    }
  } catch (err) {
    exchangeError = { message: err instanceof Error ? err.message : String(err) };
  }

  if (exchangeError) {
    console.error(
      "[auth/callback] Scambio sessione fallito:",
      `code=${url.searchParams.get("code") ? "presente" : "assente"} status=${exchangeError.status ?? "n/a"} message=${exchangeError.message}`,
    );
    loginUrl.searchParams.set(
      "error",
      "Il link di conferma non è più valido o è già stato usato. Accedi con le tue credenziali.",
    );
    return NextResponse.redirect(loginUrl);
  }

  // Verifica reale: l'utente deve essere autenticato dopo lo scambio.
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user) {
    console.error(
      "[auth/callback] Utente non autenticato dopo lo scambio:",
      `status=${getUserError?.status ?? "n/a"} message=${getUserError?.message ?? "user null"}`,
    );
    loginUrl.searchParams.set(
      "error",
      "Non è stato possibile completare la verifica. Riprova o accedi con le tue credenziali.",
    );
    return NextResponse.redirect(loginUrl);
  }

  // Ruolo customer GARANTITO lato server (idempotente) SOLO per gli account
  // senza altri ruoli: il callback appartiene al flusso di registrazione
  // CLIENTE e non deve MAI aggiungere automaticamente customer a un account
  // che possiede già un altro ruolo (merchant/admin). Il multi-ruolo resta
  // un'azione ESPLICITA dell'amministratore (modulo Utenti): se un venditore
  // (o un admin) raggiunge questo link di conferma, il suo account NON
  // acquisisce customer.
  try {
    const adminClient = createAdminSupabaseClient();
    const { data: ruoliEsistenti } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const ruoli = new Set((ruoliEsistenti ?? []).map((r) => String(r.role)));
    const haAltriRuoli =
      ruoli.has("merchant") ||
      ruoli.has("admin");

    if (!ruoli.has("customer") && !haAltriRuoli) {
      const { error: roleError } = await adminClient
        .from("user_roles")
        .insert({ user_id: user.id, role: "customer" });

      const isDuplicateKey =
        roleError != null &&
        (roleError.code === "23505" ||
          (typeof roleError.message === "string" &&
            roleError.message.includes("duplicate key")));

      if (roleError && !isDuplicateKey) {
        console.error(
          "[auth/callback] Assegnazione ruolo customer fallita",
          `userId=${user.id} code=${roleError.code ?? "n/a"} message=${roleError.message}`,
        );
        loginUrl.searchParams.set(
          "error",
          "Account confermato ma impossibile completare l'accesso. Contatta l'assistenza.",
        );
        return NextResponse.redirect(loginUrl);
      }
    }
  } catch (err) {
    console.error(
      "[auth/callback] Errore fase admin (service role):",
      err instanceof Error ? err.message : String(err),
    );
    loginUrl.searchParams.set(
      "error",
      "Account confermato ma impossibile completare l'accesso. Contatta l'assistenza.",
    );
    return NextResponse.redirect(loginUrl);
  }

  // Sessione reale + area cliente.
  const response = NextResponse.redirect(new URL("/cliente", request.url));
  response.cookies.set(AREA_COOKIE, "cliente", areaCookieOptions());
  return response;
}
