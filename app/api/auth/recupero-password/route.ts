import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  creaTokenReset,
  invalidaTokenPrecedenti,
  trovaUserIdPerEmail,
} from "@/lib/password-reset";
import { inviaEmailResetPassword } from "@/lib/password-reset-email";

/**
 * Recupero password — invia il link di reset via email.
 *
 * Flusso server-side:
 *  1. cerca l'account per email (esatta, admin client su auth.users);
 *  2. in una stessa sequenza: invalida i token precedenti (R1), genera un
 *     token casuale da 32 byte e ne salva SOLO l'hash SHA-256 (scadenza 30min);
 *  3. l'email porta a /reset-password?token=... gestito dalla nostrapagina.
 *
 * La risposta è VOLUTAMENTE identica per email esistente e non esistente
 * (anti-enumeration): non viene mai rivelato se un account esiste o meno.
 */
export async function POST(request: Request) {
  const pageUrl = new URL("/recupero-password", request.url);

  if (!isSupabaseConfigured()) {
    pageUrl.searchParams.set("error", "Configurazione Supabase mancante.");
    return NextResponse.redirect(pageUrl);
  }

  let email = "";
  try {
    const formData = await request.formData();
    email = String(formData.get("email") ?? "").trim();
  } catch {
    // Corpo assente o Content-Type non valido: trattato come campo mancante.
  }

  if (!email) {
    pageUrl.searchParams.set("error", "Inserisci l'email del tuo account.");
    return NextResponse.redirect(pageUrl);
  }

  try {
    const userId = await trovaUserIdPerEmail(email);

    if (userId) {
      // R1: nessun token precedente deve sopravvivere alla nuova richiesta.
      await invalidaTokenPrecedenti(userId);

      // Token casuale (32 byte); nel DB resta solo l'hash.
      const token = await creaTokenReset(userId);

      const resetUrl = new URL("/reset-password", request.url);
      resetUrl.searchParams.set("token", token);

      await inviaEmailResetPassword({ to: email, resetUrl: resetUrl.toString() });
    }
  } catch (err) {
    // L'errore non deve MAI rivelare se l'account esiste: loggiamo
    // internamente e rispondiamo come sempre (anti-enumeration).
    console.error("[recupero-password] errore interno:", err);
  }

  // Esito IDENTICO in ogni caso: l'utente deve solo controllare la posta.
  pageUrl.searchParams.set("sent", "1");
  return NextResponse.redirect(pageUrl);
}