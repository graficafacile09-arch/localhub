import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AREA_COOKIE, areaCookieOptions } from "@/lib/auth/area";
import { creaNotificaAdmin } from "@/lib/amministratore/notifiche";
import {
  inviaEmailRegistrazioneUtente,
  inviaEmailNuovaRegistrazioneAdmin,
} from "@/lib/registrazione-email";

/**
 * Registrazione CORRIERE LOCALE.
 *
 * Il corriere usa la stessa autenticazione Supabase della piattaforma, ma
 * riceve esclusivamente il ruolo "courier". L'account resta pending fino
 * all'approvazione amministrativa.
 */
export async function POST(request: Request) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("area", "courier");

  if (!isSupabaseConfigured()) {
    loginUrl.searchParams.set("error", "Configurazione Supabase mancante.");
    return NextResponse.redirect(loginUrl);
  }

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const surname = String(formData.get("surname") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");

  if (!name || !surname || !email || !phone || !password || !passwordConfirm) {
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

  const adminClient = createAdminSupabaseClient();

  // Un indirizzo email già presente non può essere trasformato in corriere
  // tramite questa registrazione: l'assegnazione di ruoli aggiuntivi resta
  // un'operazione esplicita dell'amministratore.
  let paginaUtenti = 1;
  let emailGiaRegistrata = false;

  for (;;) {
    const { data: utentiEsistenti, error: listError } =
      await adminClient.auth.admin.listUsers({ page: paginaUtenti, perPage: 1000 });

    if (listError || !utentiEsistenti) break;

    emailGiaRegistrata = utentiEsistenti.users.some(
      (utente) => utente.email?.toLowerCase() === email,
    );

    if (emailGiaRegistrata || utentiEsistenti.users.length < 1000) break;
    paginaUtenti += 1;
  }

  if (emailGiaRegistrata) {
    loginUrl.searchParams.set(
      "error",
      "Questo indirizzo email è già registrato. Accedi con le tue credenziali o utilizza il recupero password.",
    );
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { data: signUpData, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: name,
        last_name: surname,
        full_name: `${name} ${surname}`.trim(),
        phone,
        account_area: "courier",
      },
    },
  });

  if (error) {
    loginUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(loginUrl);
  }

  const identities = signUpData?.user?.identities;
  if (signUpData?.user && Array.isArray(identities) && identities.length === 0) {
    loginUrl.searchParams.set(
      "error",
      "Questo indirizzo email è già registrato. Accedi con le tue credenziali o utilizza il recupero password.",
    );
    return NextResponse.redirect(loginUrl);
  }

  let userId = signUpData?.user?.id ?? null;
  if (!userId) {
    try {
      const { data: perEmail } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      userId = perEmail?.users?.find(
        (utente) => utente.email?.toLowerCase() === email,
      )?.id ?? null;
    } catch (err) {
      console.error(
        "[auth/register-courier] Ricerca utente per email fallita:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  if (!userId) {
    loginUrl.searchParams.set(
      "error",
      "Non è stato possibile completare la registrazione. Riprova tra poco.",
    );
    return NextResponse.redirect(loginUrl);
  }

  const { error: roleError } = await adminClient
    .from("user_roles")
    .insert({ user_id: userId, role: "courier" });

  if (roleError && roleError.code !== "23505") {
    console.error(
      "[auth/register-courier] Assegnazione ruolo fallita:",
      roleError.message,
    );
    loginUrl.searchParams.set(
      "error",
      "Registrazione creata ma non è stato possibile completare l'abilitazione del profilo. Contatta l'assistenza.",
    );
    return NextResponse.redirect(loginUrl);
  }

  const { error: confermaError } = await adminClient.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });

  if (confermaError) {
    console.error(
      "[auth/register-courier] Conferma tecnica email fallita:",
      confermaError.message,
    );
    loginUrl.searchParams.set(
      "error",
      "Registrazione creata ma non è stato possibile completare l'accesso. Riprova.",
    );
    return NextResponse.redirect(loginUrl);
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
    console.error(
      "[auth/register-courier] Creazione approvazione pending fallita:",
      approvalError.message,
    );
    loginUrl.searchParams.set(
      "error",
      "Registrazione creata ma non è stato possibile registrare la richiesta di approvazione. Contatta l'assistenza.",
    );
    return NextResponse.redirect(loginUrl);
  }

  await Promise.allSettled([
    inviaEmailRegistrazioneUtente({
      to: email,
      nome: `${name} ${surname}`.trim(),
      area: "courier",
      password,
    }),
    inviaEmailNuovaRegistrazioneAdmin({
      nome: `${name} ${surname}`.trim(),
      email,
      area: "courier",
    }),
    creaNotificaAdmin({
      tipo: "corriere_registrato",
      titolo: "Nuovo corriere locale registrato",
      corpo: `${name} ${surname}`.trim() + ` ha richiesto l'accesso come corriere locale (${email}, ${phone})`,
      gravita: "info",
      href: "/amministratore/utenti",
    }),
  ]);

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    console.error(
      "[auth/register-courier] Login automatico fallito:",
      signInError.message,
    );
    loginUrl.searchParams.set(
      "ok",
      "registrazione",
    );
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.redirect(
    new URL("/account-in-attesa?area=courier", request.url),
  );
  response.cookies.set(AREA_COOKIE, "courier", areaCookieOptions());
  return response;
}
