import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSiteUrl } from "@/lib/site";

/**
 * Registrazione CLIENTE (acquirente) — flusso con CONFERMA EMAIL REALE.
 *
 * Sequenza:
 *  1. signUp() crea l'account NON confermato e Supabase invia l'email di
 *     conferma con emailRedirectTo verso /auth/callback;
 *  2. NESSUNA auto-conferma amministrativa, NESSUN login automatico;
 *  3. il ruolo customer viene assegnato lato server (service role, idempotente)
 *     e viene NUOVAMENTE garantito nel callback /auth/callback prima di
 *     concedere l'accesso all'area cliente;
 *  4. redirect alla pagina "Controlla la tua email".
 *
 * Quando il cliente clicca il link dell'email, Supabase conferma l'account e
 * reindirizza il browser a /auth/callback?code=... che stabilisce la sessione.
 */
export async function POST(request: Request) {
  const verificaUrl = new URL("/verifica-email", request.url);

  if (!isSupabaseConfigured()) {
    verificaUrl.searchParams.set("error", "Configurazione Supabase mancante.");
    return NextResponse.redirect(verificaUrl);
  }

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");

  if (!name || !email || !password) {
    verificaUrl.searchParams.set("error", "Compila tutti i campi obbligatori.");
    return NextResponse.redirect(verificaUrl);
  }

  if (password !== passwordConfirm) {
    verificaUrl.searchParams.set("error", "Le password non coincidono.");
    return NextResponse.redirect(verificaUrl);
  }

  if (password.length < 6) {
    verificaUrl.searchParams.set("error", "La password deve essere di almeno 6 caratteri.");
    return NextResponse.redirect(verificaUrl);
  }

  const siteUrl = getSiteUrl();
  const supabase = await createServerSupabaseClient();

  const { data: signUpData, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      // Il link dell'email deve portare al callback dell'app, non alla
      // homepage: lì Supabase ha già confermato l'account e il callback
      // stabilisce la sessione ed entra nell'area cliente.
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    // Rate limit Supabase (es. invio email di conferma):
    // il messaggio tecnico finisce SOLO nei log, all'utente uno amichevole.
    const isRateLimit =
      error.status === 429 ||
      (typeof error.code === "string" &&
        (error.code === "rate_limit_exceeded" || error.code.includes("rate_limit")));

    if (isRateLimit) {
      console.error(
        "[auth/register] Rate limit Supabase raggiunto:",
        `code=${error.code ?? "n/a"} status=${error.status ?? "n/a"} message=${error.message}`,
      );
      verificaUrl.searchParams.set(
        "error",
        "Al momento non è possibile completare la registrazione. Riprova tra qualche minuto.",
      );
    } else {
      verificaUrl.searchParams.set("error", error.message);
    }
    return NextResponse.redirect(verificaUrl);
  }

  // Il signUp può restituire l'utente o no a seconda della configurazione
  // GoTrue: se manca, lo si risolve via Admin API dall'email. Senza account
  // creato NON si prosegue.
  let userId = signUpData?.user?.id ?? null;
  if (!userId) {
    try {
      const adminClient = createAdminSupabaseClient();
      const { data: perEmail } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      userId = perEmail?.users?.find((u) => u.email === email)?.id ?? null;
    } catch (err) {
      console.error(
        "[auth/register] Ricerca utente per email fallita:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  if (!userId) {
    console.error("[auth/register] Nessun utente creato da signUp", `email=${email}`);
    verificaUrl.searchParams.set(
      "error",
      "Non è stato possibile completare la registrazione. Riprova tra poco o contatta l'assistenza.",
    );
    return NextResponse.redirect(verificaUrl);
  }

  // Ruolo customer assegnato SUBITO lato server (prima della conferma), con
  // logica idempotente. Se fallisce NON si blocca la registrazione (l'email è
  // già partita): il callback /auth/callback RIGARANTISCE il ruolo prima di
  // concedere l'accesso all'area cliente, quindi il cliente non riceverà mai
  // "Account creato ma impossibile assegnare il ruolo".
  try {
    const adminClient = createAdminSupabaseClient();
    const { data: ruoloEsistente, error: ruoloEsistenteError } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "customer")
      .maybeSingle();

    if (ruoloEsistenteError) {
      console.error(
        "[auth/register] Verifica ruolo customer fallita (verrà ripetuta nel callback)",
        `userId=${userId} code=${ruoloEsistenteError.code ?? "n/a"} message=${ruoloEsistenteError.message}`,
      );
    } else if (!ruoloEsistente) {
      const { error: roleError } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, role: "customer" });

      const isDuplicateKey =
        roleError != null &&
        (roleError.code === "23505" ||
          (typeof roleError.message === "string" &&
            roleError.message.includes("duplicate key")));

      if (roleError && !isDuplicateKey) {
        console.error(
          "[auth/register] Assegnazione ruolo customer fallita (verrà ripetuta nel callback)",
          `userId=${userId} code=${roleError.code ?? "n/a"} message=${roleError.message}`,
        );
      }
    }
  } catch (err) {
    console.error(
      "[auth/register] Errore fase admin (service role):",
      err instanceof Error ? err.message : String(err),
    );
  }

  // NIENTE login automatico: l'account non è ancora confermato.
  verificaUrl.searchParams.set("email", email);
  return NextResponse.redirect(verificaUrl);
}
