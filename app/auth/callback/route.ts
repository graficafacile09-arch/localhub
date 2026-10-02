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
  const area = url.searchParams.get("area") ?? "";
  const flow = url.searchParams.get("flow") ?? "";
  const provider = url.searchParams.get("provider") ?? "";

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

  // ── Registrazione social Cliente/Venditore ───────────────────────────
  // Amministrazione esclusa: il relativo accesso resta invariato e non
  // viene mai creato tramite OAuth.
  if (flow === "oauth-register" && (area === "cliente" || area === "merchant")) {
    const socialProvider = provider === "google" || provider === "apple" ? provider : null;
    const identityProviderValido = socialProvider != null &&
      (user.identities ?? []).some((identity) => identity.provider === socialProvider);

    if (!identityProviderValido) {
      await supabase.auth.signOut();
      loginUrl.searchParams.set("error", "Registrazione social non valida.");
      return NextResponse.redirect(loginUrl);
    }

    const adminClient = createAdminSupabaseClient();
    const { data: ruoliEsistenti, error: ruoliError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    if (ruoliError) {
      await supabase.auth.signOut();
      loginUrl.searchParams.set("error", "Impossibile verificare lo stato dell’account. Riprova.");
      return NextResponse.redirect(loginUrl);
    }

    const ruoli = new Set((ruoliEsistenti ?? []).map((item) => String(item.role)));

    if (area === "cliente") {
      // Un account già venditore/admin non acquisisce automaticamente il ruolo
      // Cliente tramite un pulsante pensato per la nuova registrazione.
      if (ruoli.has("merchant") || ruoli.has("admin")) {
        await supabase.auth.signOut();
        loginUrl.searchParams.set("error", "Questo account è già associato a un ruolo diverso. Accedi dall’area prevista.");
        return NextResponse.redirect(loginUrl);
      }

      if (!ruoli.has("customer")) {
        const { error: roleError } = await adminClient
          .from("user_roles")
          .insert({ user_id: user.id, role: "customer" });

        const isDuplicateKey = roleError != null &&
          (roleError.code === "23505" ||
            (typeof roleError.message === "string" && roleError.message.includes("duplicate key")));

        if (roleError && !isDuplicateKey) {
          await supabase.auth.signOut();
          loginUrl.searchParams.set("error", "Account autenticato ma impossibile completare la registrazione. Riprova.");
          return NextResponse.redirect(loginUrl);
        }
      }

      const socialUserName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "").trim();
      const firstName = String(user.user_metadata?.first_name ?? user.user_metadata?.given_name ?? "").trim();
      const lastName = String(user.user_metadata?.last_name ?? user.user_metadata?.family_name ?? "").trim();
      const fullName = [firstName, lastName].filter(Boolean).join(" ") || socialUserName;

      if (fullName) {
        await adminClient.auth.admin.updateUserById(user.id, {
          user_metadata: {
            first_name: firstName || undefined,
            last_name: lastName || undefined,
            full_name: fullName,
          },
        });
      }

      const response = NextResponse.redirect(new URL("/cliente", request.url));
      response.cookies.set(AREA_COOKIE, "cliente", areaCookieOptions());
      return response;
    }

    // Venditore: l’identità social è autenticata, ma Partita IVA e Nome
    // attività vengono raccolti nella schermata successiva. Nessun ruolo
    // merchant e nessun negozio viene creato prima del completamento.
    if (ruoli.size > 0) {
      await supabase.auth.signOut();
      loginUrl.searchParams.set("error", "Questo account è già associato a un ruolo. Accedi invece di registrarti di nuovo.");
      return NextResponse.redirect(loginUrl);
    }

    const firstName = String(user.user_metadata?.first_name ?? user.user_metadata?.given_name ?? "").trim();
    const lastName = String(user.user_metadata?.last_name ?? user.user_metadata?.family_name ?? "").trim();
    const socialUserName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || socialUserName;

    if (fullName) {
      await adminClient.auth.admin.updateUserById(user.id, {
        user_metadata: {
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          full_name: fullName,
        },
      });
    }

    const response = NextResponse.redirect(new URL("/login?area=merchant&oauth=vendor", request.url));
    response.cookies.set(AREA_COOKIE, "merchant", areaCookieOptions());
    return response;
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
