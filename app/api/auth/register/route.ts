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
 */
export async function POST(request: Request) {
  const loginUrl = new URL("/login", request.url);

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
    loginUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(loginUrl);
  }

  const userId = signUpData?.user?.id;

  if (userId) {
    try {
      const adminClient = createAdminSupabaseClient();
      await adminClient.auth.admin.updateUserById(userId, {
        email_confirm: true,
      });

      // Assegna il ruolo customer: l'account acquista, non vende.
      const { error: roleError } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, role: "customer" });

      if (roleError) {
        loginUrl.searchParams.set("error", "Account creato ma impossibile assegnare il ruolo. Contatta l'assistenza.");
        return NextResponse.redirect(loginUrl);
      }
    } catch {
      loginUrl.searchParams.set("error", "Errore durante la creazione dell'account. Riprova.");
      return NextResponse.redirect(loginUrl);
    }
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    loginUrl.searchParams.set("error", "Account creato ma accesso automatico fallito. Effettua il login.");
    return NextResponse.redirect(loginUrl);
  }

  // La sessione nasce legata all'area cliente (sessione attiva httpOnly).
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(AREA_COOKIE, "cliente", areaCookieOptions());
  return response;
}
