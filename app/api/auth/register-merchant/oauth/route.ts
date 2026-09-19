import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isPartitaIvaValida, normalizzaPartitaIva } from "@/lib/partita-iva";
import { creaNotificaAdmin } from "@/lib/amministratore/notifiche";
import { AREA_COOKIE, areaCookieOptions } from "@/lib/auth/area";

export async function POST(request: Request) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("area", "merchant");

  if (!isSupabaseConfigured()) {
    loginUrl.searchParams.set("error", "Configurazione Supabase mancante.");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    loginUrl.searchParams.set("error", "La sessione Google/Apple non è più valida. Riprova.");
    return NextResponse.redirect(loginUrl);
  }

  const user = userData.user;
  const adminClient = createAdminSupabaseClient();
  const formData = await request.formData();
  const partitaIvaRaw = String(formData.get("partita_iva") ?? "").trim();
  const storeName = String(formData.get("store_name") ?? "").trim();

  if (!partitaIvaRaw || !storeName) {
    loginUrl.searchParams.set("oauth", "vendor");
    loginUrl.searchParams.set("error", "Partita IVA e Nome attività sono obbligatori.");
    return NextResponse.redirect(loginUrl);
  }

  if (!isPartitaIvaValida(partitaIvaRaw)) {
    loginUrl.searchParams.set("oauth", "vendor");
    loginUrl.searchParams.set("error", "Partita IVA non valida oppure non esistente.");
    return NextResponse.redirect(loginUrl);
  }

  const providerIdentities = user.identities ?? [];
  const hasSupportedSocialIdentity = providerIdentities.some((identity) => identity.provider === "google" || identity.provider === "apple");
  if (!hasSupportedSocialIdentity) {
    await supabase.auth.signOut();
    loginUrl.searchParams.set("error", "Registrazione social non valida.");
    return NextResponse.redirect(loginUrl);
  }

  const { data: roles, error: rolesError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (rolesError) {
    loginUrl.searchParams.set("oauth", "vendor");
    loginUrl.searchParams.set("error", "Impossibile verificare lo stato dell’account. Riprova.");
    return NextResponse.redirect(loginUrl);
  }

  if ((roles ?? []).length > 0) {
    await supabase.auth.signOut();
    loginUrl.searchParams.set("error", "Questo account è già associato a un ruolo. Accedi con il metodo di accesso previsto.");
    return NextResponse.redirect(loginUrl);
  }

  const partitaIva = normalizzaPartitaIva(partitaIvaRaw);
  let pagina = 1;
  let partitaIvaGiaRegistrata = false;

  for (;;) {
    const { data: utenti, error: listError } = await adminClient.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    if (listError || !utenti) break;

    for (const existingUser of utenti.users) {
      if (existingUser.user_metadata?.partita_iva === partitaIva && existingUser.id !== user.id) {
        partitaIvaGiaRegistrata = true;
        break;
      }
    }

    if (partitaIvaGiaRegistrata || utenti.users.length < 1000) break;
    pagina += 1;
  }

  if (partitaIvaGiaRegistrata) {
    loginUrl.searchParams.set("oauth", "vendor");
    loginUrl.searchParams.set("error", "Esiste già un account associato a questa Partita IVA.");
    return NextResponse.redirect(loginUrl);
  }

  const nome = String(user.user_metadata?.first_name ?? "").trim();
  const cognome = String(user.user_metadata?.last_name ?? "").trim();
  const googleFullName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "").trim();
  const fullName = [nome, cognome].filter(Boolean).join(" ") || googleFullName || String(user.email ?? "").split("@")[0];

  const { error: metadataError } = await adminClient.auth.admin.updateUserById(user.id, {
    user_metadata: {
      first_name: nome || undefined,
      last_name: cognome || undefined,
      full_name: fullName,
      store_name: storeName,
      partita_iva: partitaIva,
    },
  });

  if (metadataError) {
    loginUrl.searchParams.set("oauth", "vendor");
    loginUrl.searchParams.set("error", "Account autenticato ma impossibile salvare i dati. Riprova.");
    return NextResponse.redirect(loginUrl);
  }

  const { data: negozio, error: storeError } = await adminClient
    .from("negozi")
    .insert({
      nome: storeName,
      categoria: "Altro",
      owner_user_id: user.id,
    })
    .select("id")
    .single();

  if (storeError || !negozio) {
    loginUrl.searchParams.set("oauth", "vendor");
    loginUrl.searchParams.set("error", "Account autenticato ma impossibile creare il negozio. Contatta l’assistenza.");
    return NextResponse.redirect(loginUrl);
  }

  const { error: roleError } = await adminClient
    .from("user_roles")
    .insert({ user_id: user.id, role: "merchant" });

  const isDuplicateKey = roleError != null && (roleError.code === "23505" || (typeof roleError.message === "string" && roleError.message.includes("duplicate key")));
  if (roleError && !isDuplicateKey) {
    loginUrl.searchParams.set("oauth", "vendor");
    loginUrl.searchParams.set("error", "Account autenticato ma impossibile completare il ruolo venditore. Contatta l’assistenza.");
    return NextResponse.redirect(loginUrl);
  }

  await creaNotificaAdmin({
    tipo: "venditore_registrato",
    titolo: "Nuovo venditore registrato",
    corpo: `${fullName} ha registrato il negozio “${storeName}”`,
    gravita: "info",
    href: "/amministratore/attivita",
  });

  const response = NextResponse.redirect(new URL("/merchant", request.url));
  response.cookies.set(AREA_COOKIE, "merchant", areaCookieOptions());
  return response;
}
