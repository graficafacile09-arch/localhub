import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { consumaToken } from "@/lib/password-reset";

/**
 * Salva la nuova password dopo il recupero.
 *
 * Il flusso è interamente server-side:
 *  1. il token (hidden field) viene consumato ATOMICAMENTE: se è già usato,
 *     scaduto o inesistente la funzione SQL restituisce null → errore;
 *  2. solo dopo il consumo riuscito si aggiorna la password con la Admin API
 *     (updateUserById), che Revokes automaticamente TUTTE le sessioni
 *     dell'utente (verificato sul sorgente GoTrue v2.194.0);
 *  3. si torna al login con il messaggio di conferma.
 */
export async function POST(request: Request) {
  const resetUrl = new URL("/reset-password", request.url);
  const loginUrl = new URL("/login", request.url);

  if (!isSupabaseConfigured()) {
    resetUrl.searchParams.set("err", "Configurazione Supabase mancante.");
    return NextResponse.redirect(resetUrl);
  }

  let token = "";
  let password = "";
  let confirm = "";
  try {
    const formData = await request.formData();
    token = String(formData.get("token") ?? "");
    password = String(formData.get("password") ?? "");
    confirm = String(formData.get("password_confirm") ?? "");
  } catch {
    // Corpo assente o Content-Type non valido: gestito come campo mancante.
  }

  if (!token) {
    resetUrl.searchParams.set("err", "Link di recupero mancante. Richiedi un nuovo link.");
    return NextResponse.redirect(resetUrl);
  }
  if (password.length < 6) {
    resetUrl.searchParams.set("err", "La password deve essere di almeno 6 caratteri.");
    return NextResponse.redirect(resetUrl);
  }
  if (password !== confirm) {
    resetUrl.searchParams.set("err", "Le password non coincidono.");
    return NextResponse.redirect(resetUrl);
  }

  // R2: consumo ATOMICO del token. Uno solo dei due casi seguenti:
  //   - valido → userId dell'account e token già marcato used (anzi,
  //     "usato" viene scritto nella STESSA UPDATE del consumo);
  //   - null → token inesistente, scaduto o già usato: niente cambio password.
  const userId = await consumaToken(token);

  if (!userId) {
    resetUrl.searchParams.set(
      "err",
      "Il link di recupero non è più valido o è già stato usato. Richiedi un nuovo link.",
    );
    return NextResponse.redirect(resetUrl);
  }

  let adminClient: ReturnType<typeof createAdminSupabaseClient>;
  try {
    adminClient = createAdminSupabaseClient();
  } catch (err) {
    console.error("[reset-password] admin client:", err);
    resetUrl.searchParams.set("err", "Errore interno. Riprova o richiedi un nuovo link.");
    return NextResponse.redirect(resetUrl);
  }

  // Cambio password via Admin API: oltre ad aggiornarla, GoTrue revoca TUTTE
  // le sessioni esistenti dell'utente (logout di tutte le sessioni).
  const { error } = await adminClient.auth.admin.updateUserById(userId, { password });

  if (error) {
    console.error(
      "[reset-password] updateUserById:",
      `status=${error.status ?? "n/a"} message=${error.message}`,
    );
    resetUrl.searchParams.set(
      "err",
      "Impossibile salvare la password. Il link è stato consumato: richiedi un nuovo link.",
    );
    return NextResponse.redirect(resetUrl);
  }

  loginUrl.searchParams.set("ok", "1");
  return NextResponse.redirect(loginUrl);
}