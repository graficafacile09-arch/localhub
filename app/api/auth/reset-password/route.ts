import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Salva la nuova password dopo il recupero.
 *
 * A questo punto il browser ha i cookie della sessione di RECOVERY (scritti
 * dalla route app/api/auth/callback-recovery durante lo scambio del codice).
 * updateUser aggiorna la password con quella sessione; poi si esce (signOut)
 * e si torna al login con un messaggio di conferma.
 */
export async function POST(request: Request) {
  const pageUrl = new URL("/reset-password", request.url);
  const loginUrl = new URL("/login", request.url);

  if (!isSupabaseConfigured()) {
    pageUrl.searchParams.set("err", "Configurazione Supabase mancante.");
    return NextResponse.redirect(pageUrl);
  }

  let password = "";
  let confirm = "";
  try {
    const formData = await request.formData();
    password = String(formData.get("password") ?? "");
    confirm = String(formData.get("password_confirm") ?? "");
  } catch {
    // Corpo assente o Content-Type non valido: gestito come campo mancante.
  }

  if (password.length < 6) {
    pageUrl.searchParams.set("err", "La password deve essere di almeno 6 caratteri.");
    return NextResponse.redirect(pageUrl);
  }
  if (password !== confirm) {
    pageUrl.searchParams.set("err", "Le password non coincidono.");
    return NextResponse.redirect(pageUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error(
      "[reset-password] updateUser:",
      `status=${error.status ?? "n/a"} message=${error.message}`,
    );
    pageUrl.searchParams.set(
      "err",
      "Impossibile salvare la password. Il link è scaduto o già utilizzato: richiedi un nuovo link.",
    );
    return NextResponse.redirect(pageUrl);
  }

  await supabase.auth.signOut();

  loginUrl.searchParams.set("ok", "1");
  return NextResponse.redirect(loginUrl);
}