import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSiteUrl } from "@/lib/site";
import { AREA_COOKIE, areaCookieOptions } from "@/lib/auth/area";
import { creaNotificaAdmin } from "@/lib/amministratore/notifiche";
import { inviaEmailRegistrazioneUtente, inviaEmailNuovaRegistrazioneAdmin } from "@/lib/registrazione-email";

/**
 * Registrazione CLIENTE (acquirente).
 *
 * Sequenza:
 *  1. signUp() crea l'account e il trigger Auth crea la richiesta
 *     account_approvazioni = pending;
 *  2. il ruolo customer viene assegnato lato server;
 *  3. l'email viene confermata tecnicamente lato server per permettere
 *     il login automatico richiesto dal flusso;
 *  4. viene aperta subito la sessione e mostrata /account-in-attesa;
 *  5. una email di registrazione viene inviata all'utente e una comunicazione
 *     viene inviata all'amministratore. L'approvazione resta obbligatoria.
 */
export async function POST(request: Request) {
  const verificaUrl = new URL("/verifica-email", request.url);

  if (!isSupabaseConfigured()) {
    verificaUrl.searchParams.set("error", "Configurazione Supabase mancante.");
    return NextResponse.redirect(verificaUrl);
  }

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const surname = String(formData.get("surname") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");

  if (!name || !surname || !email || !password) {
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
      data: { first_name: name, last_name: surname, full_name: `${name} ${surname}`.trim() },
      // Il link dell'email deve portare al callback dell'app, non alla
      // homepage: lì Supabase ha già confermato l'account e il callback
      // stabilisce la sessione ed entra nell'area cliente.
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    // Email GIÀ registrata: GoTrue restituisce un errore e NON invia alcuna
    // email di conferma. Mostrare "Controlla la tua email" sarebbe falso.
    const isAlreadyRegistered =
      error.code === "user_already_exists" ||
      (typeof error.message === "string" && /already registered/i.test(error.message));

    if (isAlreadyRegistered) {
      console.warn(
        "[auth/register] Email già registrata (nessuna email inviata)",
        `code=${error.code ?? "n/a"} status=${error.status ?? "n/a"} email=${email}`,
      );
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("area", "cliente");
      loginUrl.searchParams.set(
        "error",
        "Questo indirizzo email è già registrato. Accedi con le tue credenziali o utilizza il recupero password.",
      );
      return NextResponse.redirect(loginUrl);
    }

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

  // CRITICO: per un indirizzo GIÀ registrato GoTrue può rispondere 200 senza
  // errore ma con `user.identities` VUOTA e NON invia alcuna email di
  // conferma (anti-enumeration). `confirmation_sent_at` può risultare
  // valorizzato nella risposta anche se la mail non parte davvero (caso
  // osservato con indirizzi Outlook già esistenti: "successo" ma nessuna
  // email in Resend). L'array `identities` vuoto è il discriminante
  // documentato da Supabase: qui NON si mostra "Controlla la tua email" e
  // NON si crea/assegna nulla.
  const identities = signUpData?.user?.identities;
  const giaRegistrato =
    signUpData?.user != null && Array.isArray(identities) && identities.length === 0;

  if (giaRegistrato) {
    console.warn(
      "[auth/register] Email già registrata (identities vuota, nessuna email inviata)",
      `email=${email}`,
    );
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("area", "cliente");
    loginUrl.searchParams.set(
      "error",
      "Questo indirizzo email è già registrato. Accedi con le tue credenziali o utilizza il recupero password.",
    );
    return NextResponse.redirect(loginUrl);
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

  const adminClient = createAdminSupabaseClient();

  // La conferma email tecnica serve solo a permettere il login immediato.
  // L autorizzazione all uso resta esclusivamente in account_approvazioni = pending.
  const { error: confermaError } = await adminClient.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });
  if (confermaError) {
    console.error("[auth/register] Conferma tecnica email fallita:", confermaError.message);
    verificaUrl.searchParams.set("error", "Registrazione creata ma non è stato possibile completare l accesso automatico. Riprova.");
    return NextResponse.redirect(verificaUrl);
  }

  const { error: approvalError } = await adminClient
    .from("account_approvazioni")
    .upsert(
      {
        user_id: userId,
        stato: "pending",
        richiesto_il: new Date().toISOString(),
        deciso_il: null,
        deciso_da: null,
        motivo: null,
      },
      { onConflict: "user_id" },
    );

  if (approvalError) {
    console.error("[auth/register] Creazione approvazione pending fallita:", approvalError.message);
    verificaUrl.searchParams.set("error", "Registrazione creata ma non è stato possibile registrare la richiesta di approvazione. Contatta l assistenza.");
    return NextResponse.redirect(verificaUrl);
  }

  // Email e notifica admin sono BEST-EFFORT e non annullano una registrazione riuscita.
  await Promise.allSettled([
    inviaEmailRegistrazioneUtente({
      to: email,
      nome: `${name} ${surname}`.trim(),
      area: "cliente",
      password,
    }),
    inviaEmailNuovaRegistrazioneAdmin({
      nome: `${name} ${surname}`.trim(),
      email,
      area: "cliente",
    }),
    creaNotificaAdmin({
      tipo: "venditore_registrato",
      titolo: "Nuovo utente registrato",
      corpo: `${name} ${surname}`.trim() + ` ha registrato un nuovo account cliente (${email})`,
      gravita: "info",
      href: "/amministratore/utenti",
    }),
  ]);

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    console.error("[auth/register] Login automatico fallito:", signInError.message);
    verificaUrl.searchParams.set("error", "Registrazione completata ma accesso automatico non riuscito. Effettua il login per continuare.");
    return NextResponse.redirect(verificaUrl);
  }

  const response = NextResponse.redirect(
    new URL("/account-in-attesa?area=cliente", request.url),
  );
  response.cookies.set(AREA_COOKIE, "cliente", areaCookieOptions());
  return response;
}
