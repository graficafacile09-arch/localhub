import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSiteUrl } from "@/lib/site";
import { checkRateLimit } from "@/lib/rate-limiter";

/**
 * Reinvio dell'email di conferma (cliente non ancora confermato).
 *
 * Usa l'API di Supabase (resend) che applica GIÀ il rate limiting lato
 * server (over_email_send_rate_limit → 429).
 * Aggiunge un rate limit applicativo IP-based (3/min, 10/ora) come prima difesa.
 * La risposta è identica per email esistente e non esistente
 * (anti-enumeration): il cliente vede solo "email reinviata".
 */
export async function POST(request: Request) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("area", "cliente");

  if (!isSupabaseConfigured()) {
    loginUrl.searchParams.set("error", "Configurazione Supabase mancante.");
    return NextResponse.redirect(loginUrl);
  }

  // Rate limit IP-based (prima difesa, fail-open)
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() ?? "unknown";
  const rateKey = `reinvia-conferma:${ip}`;
  const rateResult = await checkRateLimit(rateKey, {
    subject: "scan_log",
    useSharedCounter: true,
    perMinute: 3,
    perHour: 10,
    useAdminClient: true,
    reasonLabel: "reinvio conferma",
  });
  if (!rateResult.allowed) {
    console.warn(
      "[reinvia-conferma] Rate limit IP superato:",
      `ip=${ip} retryAfter=${rateResult.retryAfter}s`
    );
    loginUrl.searchParams.set("error", rateResult.reason);
    return NextResponse.redirect(loginUrl);
  }

  let email = "";
  try {
    const formData = await request.formData();
    email = String(formData.get("email") ?? "").trim();
  } catch {
    // Corpo assente o Content-Type non valido.
  }

  if (!email) {
    loginUrl.searchParams.set("error", "Inserisci l'email del tuo account.");
    return NextResponse.redirect(loginUrl);
  }

  const siteUrl = getSiteUrl();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  });

  if (error && error.status === 429) {
    console.error(
      "[reinvia-conferma] Rate limit Supabase raggiunto:",
      `code=${error.code ?? "n/a"} status=${error.status}`,
    );
    loginUrl.searchParams.set(
      "error",
      "Hai richiesto l'invio troppe volte. Riprova tra qualche minuto.",
    );
    return NextResponse.redirect(loginUrl);
  }

  // Esito identico per email esistente/non esistente o già confermata.
  loginUrl.searchParams.set("reinviata", "1");
  return NextResponse.redirect(loginUrl);
}
