import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AREA_COOKIE, areaCookieOptions } from "@/lib/auth/area";

/**
 * Registrazione CLIENTE (acquirente).
 * Crea un account con SOLO il ruolo customer: nessun negozio, nessuna
 * funzione da commerciante. Dopo la registrazione l'utente viene portato
 * alla homepage e potrà accedere all'Area Clienti (/cliente).
 *
 * Flusso (ordine obbligatorio):
 *  1. signUp()
 *  2. verifica che l'utente sia stato realmente creato
 *  3. auto-conferma email tramite Admin API (email_confirm)
 *  4. verifica che la conferma sia riuscita
 *  5. assegnazione ruolo customer (idempotente)
 *  6. verifica che il ruolo sia stato assegnato
 *  7. signInWithPassword() (login automatico)
 *  8. cookie area cliente + redirect
 *
 * Se un passaggio critico fallisce NON si prosegue fingendo che l'account
 * sia stato creato: nessun login automatico, messaggio umano all'utente e
 * log server con i dettagli diagnostici (mai chiavi/token/password).
 */
export async function POST(request: Request) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("area", "cliente");

  if (!isSupabaseConfigured()) {
    loginUrl.searchParams.set("error", "Configurazione Supabase mancante.");
    return NextResponse.redirect(loginUrl);
  }

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");

  if (!name || !email || !password) {
    loginUrl.searchParams.set("error", "Compila tutti i campi obbligatori.");
    return NextResponse.redirect(loginUrl);
  }

  if (password !== passwordConfirm) {
    loginUrl.searchParams.set("error", "Le password non coincidono.");
    return NextResponse.redirect(loginUrl);
  }

  if (password.length < 6) {
    loginUrl.searchParams.set("error", "La password deve essere di almeno 6 caratteri.");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { data: signUpData, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });

  if (error) {
    // Rate limit Supabase (es. email di conferma via provider built-in).
    // Il messaggio tecnico finisce SOLO nei log server; all'utente un
    // messaggio amichevole.
    const isRateLimit =
      error.status === 429 ||
      (typeof error.code === "string" &&
        (error.code === "rate_limit_exceeded" || error.code.includes("rate_limit")));

    if (isRateLimit) {
      console.error(
        "[auth/register] Rate limit Supabase raggiunto:",
        `code=${error.code ?? "n/a"} status=${error.status ?? "n/a"} message=${error.message}`,
      );
      loginUrl.searchParams.set(
        "error",
        "Al momento non è possibile completare la registrazione. Riprova tra qualche minuto.",
      );
    } else {
      loginUrl.searchParams.set("error", error.message);
    }
    return NextResponse.redirect(loginUrl);
  }

  const userId = signUpData?.user?.id;

  // Passo 2: senza un utente realmente creato non si può proseguire.
  if (!userId) {
    console.error(
      "[auth/register] Nessun utente restituito da signUp",
      `email=${email}`,
    );
    loginUrl.searchParams.set(
      "error",
      "Non è stato possibile completare la registrazione. Riprova tra poco o contatta l'assistenza.",
    );
    return NextResponse.redirect(loginUrl);
  }

  // Fase admin: auto-conferma email + ruolo customer.
  try {
    const adminClient = createAdminSupabaseClient();

    // Passo 3-4: auto-conferma via Admin API. Se fallisce NON continuare
    // come se l'account fosse attivo: un utente non confermato non deve
    // fare login.
    const { error: confirmError } = await adminClient.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });

    if (confirmError) {
      console.error(
        "[auth/register] Auto-conferma email fallita",
        `userId=${userId} code=${confirmError.code ?? "n/a"} status=${confirmError.status ?? "n/a"} message=${confirmError.message}`,
      );
      loginUrl.searchParams.set(
        "error",
        "Non è stato possibile completare la registrazione. Riprova tra poco o contatta l'assistenza.",
      );
      return NextResponse.redirect(loginUrl);
    }

    // Passo 5-6: ruolo customer, logica idempotente (stesso approccio di
    // register-merchant). Se il ruolo esiste già l'operazione è un successo.
    const { data: ruoloEsistente, error: ruoloEsistenteError } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "customer")
      .maybeSingle();

    if (ruoloEsistenteError) {
      console.error(
        "[auth/register] Verifica ruolo customer fallita",
        `userId=${userId} code=${ruoloEsistenteError.code ?? "n/a"} message=${ruoloEsistenteError.message}`,
      );
      loginUrl.searchParams.set(
        "error",
        "Non è stato possibile completare la registrazione. Riprova tra poco o contatta l'assistenza.",
      );
      return NextResponse.redirect(loginUrl);
    }

    if (!ruoloEsistente) {
      const { error: roleError } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, role: "customer" });

      // 23505 (duplicate key): il ruolo è stato assegnato tra la verifica
      // e l'INSERT. Viene trattato come SUCCESSO, il flusso continua.
      const isDuplicateKey =
        roleError != null &&
        (roleError.code === "23505" ||
          (typeof roleError.message === "string" &&
            roleError.message.includes("duplicate key")));

      if (roleError && !isDuplicateKey) {
        console.error(
          "[auth/register] Assegnazione ruolo customer fallita",
          `userId=${userId} code=${roleError.code ?? "n/a"} message=${roleError.message}`,
        );
        loginUrl.searchParams.set(
          "error",
          "Non è stato possibile completare la registrazione. Riprova tra poco o contatta l'assistenza.",
        );
        return NextResponse.redirect(loginUrl);
      }
    }
  } catch (adminError) {
    // Service role mancante o non valido: l'admin client lancia un errore.
    // Non mostrare MAI "Account creato" e non effettuare login automatico.
    console.error(
      "[auth/register] Errore fase admin (service role):",
      adminError instanceof Error ? adminError.message : String(adminError),
    );
    loginUrl.searchParams.set(
      "error",
      "Non è stato possibile completare la registrazione. Riprova tra poco o contatta l'assistenza.",
    );
    return NextResponse.redirect(loginUrl);
  }

  // Passo 7: login automatico solo dopo conferma e ruolo riusciti.
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    console.error(
      "[auth/register] Login automatico fallito",
      `userId=${userId} code=${signInError.code ?? "n/a"} status=${signInError.status ?? "n/a"} message=${signInError.message}`,
    );
    loginUrl.searchParams.set("error", "Account creato ma accesso automatico fallito. Effettua il login.");
    return NextResponse.redirect(loginUrl);
  }

  // Passo 8: la sessione nasce legata all'area cliente (sessione attiva httpOnly).
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(AREA_COOKIE, "cliente", areaCookieOptions());
  return response;
}
