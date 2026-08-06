import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AREA_COOKIE, areaCookieOptions } from "@/lib/auth/area";
import { isPartitaIvaValida, normalizzaPartitaIva } from "@/lib/partita-iva";
import { verificaPartitaIvaConVies } from "@/lib/partita-iva-verifica";

/**
 * Registrazione COMMERCIANTE (venditore).
 * Crea un account con ruolo merchant e il relativo negozio iniziale.
 * Dopo la registrazione l'utente atterra sulla homepage e sceglie
 * manualmente l'area dal menu account.
 */
export async function POST(request: Request) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("area", "merchant");

  if (!isSupabaseConfigured()) {
    loginUrl.searchParams.set("error", "Configurazione Supabase mancante.");
    return NextResponse.redirect(loginUrl);
  }

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");
  const storeName = String(formData.get("store_name") ?? "").trim();
  const partitaIvaRaw = String(formData.get("partita_iva") ?? "").trim();

  if (!name || !email || !password || !storeName) {
    loginUrl.searchParams.set("error", "Compila tutti i campi obbligatori.");
    return NextResponse.redirect(loginUrl);
  }

  // Partita IVA: obbligatoria per la registrazione Venditore.
  if (!partitaIvaRaw) {
    loginUrl.searchParams.set("error", "Partita IVA obbligatoria.");
    return NextResponse.redirect(loginUrl);
  }

  // 1) Controllo del formato (11 cifre + algoritmo ufficiale).
  if (!isPartitaIvaValida(partitaIvaRaw)) {
    loginUrl.searchParams.set("error", "Partita IVA non valida oppure non esistente.");
    return NextResponse.redirect(loginUrl);
  }

  const partitaIva = normalizzaPartitaIva(partitaIvaRaw);

  // 2) Verifica REALE della Partita IVA tramite il servizio ufficiale VIES.
  //    Se risulta non valida o inesistente -> registrazione bloccata.
  //    Se il servizio non è raggiungibile -> l'account NON viene creato.
  const esitoVerifica = await verificaPartitaIvaConVies(partitaIva);

  if (esitoVerifica.stato === "non_verificabile") {
    loginUrl.searchParams.set("error", "Impossibile verificare la Partita IVA. Riprovare più tardi.");
    return NextResponse.redirect(loginUrl);
  }

  if (esitoVerifica.stato === "non_valida") {
    loginUrl.searchParams.set("error", "Partita IVA non valida oppure non esistente.");
    return NextResponse.redirect(loginUrl);
  }

  // 3) Anti-duplicazione: la stessa Partita IVA non può essere registrata
  //    due volte. Nessun account Venditore viene creato se esiste già.
  const adminClient = createAdminSupabaseClient();
  let paginaUtenti = 1;
  let partitaIvaGiaRegistrata = false;

  for (;;) {
    const { data: utentiEsistenti, error: listError } =
      await adminClient.auth.admin.listUsers({ page: paginaUtenti, perPage: 1000 });

    if (listError || !utentiEsistenti) break;

    if (
      utentiEsistenti.users.some(
        (utente) => utente.user_metadata?.partita_iva === partitaIva,
      )
    ) {
      partitaIvaGiaRegistrata = true;
      break;
    }

    if (utentiEsistenti.users.length < 1000) break;
    paginaUtenti += 1;
  }

  if (partitaIvaGiaRegistrata) {
    loginUrl.searchParams.set("error", "Esiste già un account associato a questa Partita IVA.");
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
    options: {
      data: {
        full_name: name,
        store_name: storeName,
        partita_iva: partitaIva,
      },
    },
  });

  if (error) {
    // Rate limit Supabase (es. email di conferma via provider built-in:
    // {"code":429,"error_code":"over_email_send_rate_limit","msg":"email rate limit exceeded"}).
    // Il messaggio tecnico finisce SOLO nei log server; all'utente un messaggio amichevole.
    const isRateLimit =
      error.status === 429 ||
      (typeof error.code === "string" &&
        (error.code === "rate_limit_exceeded" || error.code.includes("rate_limit")));

    if (isRateLimit) {
      console.error(
        "[register-merchant] Rate limit Supabase raggiunto:",
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

  // Auto-conferma utente tramite admin client (disabilita verifica email in sviluppo)
  if (userId) {
    try {
      await adminClient.auth.admin.updateUserById(userId, {
        email_confirm: true,
      });

      // Crea automaticamente il negozio per il nuovo merchant
      const { error: storeError } = await adminClient
        .from("negozi")
        .insert({
          nome: storeName,
          categoria: "Altro",
          owner_user_id: userId,
        });

      if (storeError) {
        loginUrl.searchParams.set("error", "Account creato ma impossibile creare il negozio. Contatta l'assistenza.");
        return NextResponse.redirect(loginUrl);
      }

      // Assegna il ruolo merchant: la registrazione crea un negozio.
      const { error: roleError } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, role: "merchant" });

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

  // La sessione nasce legata all'area merchant (sessione attiva httpOnly).
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(AREA_COOKIE, "merchant", areaCookieOptions());
  return response;
}
