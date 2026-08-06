import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { marcaTokenUsato, validaToken } from "@/lib/password-reset";

/**
 * Salva la nuova password dopo il recupero.
 *
 * Flusso server-side (nessun callback GoTrue):
 *  1. il token (hidden field) viene VALIDATO in lettura (esiste, non usato,
 *     non scaduto); se non valido → errore e nessuna operazione;
 *  2. la password viene cambiata con la Admin API (updateUserById), che
 *     revoca anche tutte le sessioni dell'utente;
 *  3. SOLO DOPO il successo di updateUserById il token viene marcato usato:
 *     se il cambio password fallisce, il token resta utilizzabile.
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

  // 1. Validazione in lettura: nessuna modifica al DB.
  const esito = await validaToken(token);
  if (!esito.valido) {
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

  // 2. Cambio password via Admin API: GoTrue revoca anche tutte le sessioni
  //    dell'utente (logout). Se fallisce → errore; il token NON viene consumato.
  const { error } = await adminClient.auth.admin.updateUserById(esito.userId, {
    password,
  });

  if (error) {
    console.error(
      "[reset-password] updateUserById:",
      `status=${error.status ?? "n/a"} message=${error.message}`,
    );
    resetUrl.searchParams.set(
      "err",
      "Impossibile salvare la password in questo momento. Il link è ancora valido: richiedi semplicemente un nuovo recupero.",
    );
    return NextResponse.redirect(resetUrl);
  }

  // 3. Solo ora il token viene consumato.
  await marcaTokenUsato(token);

  loginUrl.searchParams.set("ok", "1");
  return NextResponse.redirect(loginUrl);
}