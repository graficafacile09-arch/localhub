import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AREA_COOKIE, areaCookieOptions } from "@/lib/auth/area";
import { isPartitaIvaValida, normalizzaPartitaIva } from "@/lib/partita-iva";
import { creaNotificaAdmin } from "@/lib/amministratore/notifiche";

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

  // 2) Anti-duplicazione: la stessa Partita IVA non può essere registrata
  //    due volte. Nessun account Venditore viene creato se esiste già.
  // 3) Email GIÀ registrata: un account esistente (es. cliente) NON può
  //    acquisire il ruolo merchant attraverso la registrazione Venditore.
  //    Il multi-ruolo è riservato a un'azione ESPLICITA dell'amministratore
  //    (modulo Utenti). Senza questo controllo signUp/Admin API risolverebbero
  //    l'userId dell'account già esistente e l'endpoint gli assegnerebbe
  //    merchant automaticamente (→ stesso utente con customer+merchant).
  const adminClient = createAdminSupabaseClient();
  let paginaUtenti = 1;
  let partitaIvaGiaRegistrata = false;
  let emailGiaRegistrata = false;

  for (;;) {
    const { data: utentiEsistenti, error: listError } =
      await adminClient.auth.admin.listUsers({ page: paginaUtenti, perPage: 1000 });

    if (listError || !utentiEsistenti) break;

    if (emailGiaRegistrata && partitaIvaGiaRegistrata) break;

    for (const utente of utentiEsistenti.users) {
      if (!emailGiaRegistrata && utente.email?.toLowerCase() === email.toLowerCase()) {
        emailGiaRegistrata = true;
      }
      if (!partitaIvaGiaRegistrata && utente.user_metadata?.partita_iva === partitaIva) {
        partitaIvaGiaRegistrata = true;
      }
      if (emailGiaRegistrata && partitaIvaGiaRegistrata) break;
    }

    if (utentiEsistenti.users.length < 1000) break;
    paginaUtenti += 1;
  }

  if (partitaIvaGiaRegistrata) {
    loginUrl.searchParams.set("error", "Esiste già un account associato a questa Partita IVA.");
    return NextResponse.redirect(loginUrl);
  }

  if (emailGiaRegistrata) {
    loginUrl.searchParams.set(
      "error",
      "Questo indirizzo email è già registrato. Accedi con le tue credenziali o utilizza il recupero password.",
    );
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

  let userId = signUpData?.user?.id ?? null;

  // CRITICO: signUp può restituire user: null quando "Enable email confirmations"
  // è attivo in Supabase e non viene passato emailRedirectTo. In questo caso
  // l'utente È stato creato ma non viene restituito nella risposta.
  // Recuperiamo l'ID via Admin API usando l'email (stesso pattern di register/route.ts).
  if (!userId) {
    try {
      const adminClientForLookup = createAdminSupabaseClient();
      const { data: perEmail } = await adminClientForLookup.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      userId = perEmail?.users?.find((u) => u.email === email)?.id ?? null;
    } catch (err) {
      console.error(
        "[register-merchant] Ricerca utente per email fallita:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  if (!userId) {
    console.error("[register-merchant] Nessun utente creato da signUp", `email=${email}`);
    loginUrl.searchParams.set(
      "error",
      "Non è stato possibile completare la registrazione. Riprova tra poco o contatta l'assistenza.",
    );
    return NextResponse.redirect(loginUrl);
  }

  // Auto-conferma utente tramite admin client (disabilita verifica email in sviluppo)
  // Il blocco è garantito avere userId valorizzato qui.
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
      // Logica idempotente: se il ruolo merchant esiste già per l'utente
      // non viene eseguito alcun INSERT e il flusso continua normalmente.
      const { data: ruoloEsistente, error: ruoloEsistenteError } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "merchant")
        .maybeSingle();

      if (ruoloEsistenteError) {
        loginUrl.searchParams.set("error", "Account creato ma impossibile assegnare il ruolo. Contatta l'assistenza.");
        return NextResponse.redirect(loginUrl);
      }

      if (!ruoloEsistente) {
        const { error: roleError } = await adminClient
          .from("user_roles")
          .insert({ user_id: userId, role: "merchant" });

        // 23505 (duplicate key): il ruolo è stato assegnato tra la verifica
        // e l'INSERT. Viene trattato come SUCCESSO, il flusso continua.
        const isDuplicateKey =
          roleError != null &&
          (roleError.code === "23505" ||
            (typeof roleError.message === "string" &&
              roleError.message.includes("duplicate key")));

        if (roleError && !isDuplicateKey) {
          loginUrl.searchParams.set("error", "Account creato ma impossibile assegnare il ruolo. Contatta l'assistenza.");
          return NextResponse.redirect(loginUrl);
        }
      }
    } catch {
      loginUrl.searchParams.set("error", "Errore durante la creazione dell'account. Riprova.");
      return NextResponse.redirect(loginUrl);
    }
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    loginUrl.searchParams.set("error", "Account creato ma accesso automatico fallito. Effettua il login.");
    return NextResponse.redirect(loginUrl);
  }

  // Notifica admin — BEST-EFFORT: SOLO dopo che utente creato, email
  // confermata, negozio creato e ruolo merchant assegnato sono riusciti.
  // Mai bloccante: un errore qui non deve far fallire la registrazione.
  await creaNotificaAdmin({
    tipo: "venditore_registrato",
    titolo: "Nuovo venditore registrato",
    corpo: `${name} ha registrato il negozio “${storeName}”`,
    gravita: "info",
    href: "/amministratore/attivita",
  });

  // La sessione nasce legata all'area merchant (sessione attiva httpOnly).
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(AREA_COOKIE, "merchant", areaCookieOptions());
  return response;
}
