import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Riporta il redirect sul loginUrl se è un path interno valido. */
function preservaRedirect(loginUrl: URL, formData: FormData) {
  const redirect = String(formData.get("redirect") ?? "").trim();
  if (redirect.startsWith("/")) {
    loginUrl.searchParams.set("redirect", redirect);
  }
}

export async function POST(request: Request) {
  const loginUrl = new URL("/login", request.url);

  if (!isSupabaseConfigured()) {
    loginUrl.searchParams.set("error", "Configurazione Supabase mancante.");
    return NextResponse.redirect(loginUrl);
  }

  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    loginUrl.searchParams.set("error", "Inserisci email e password.");
    preservaRedirect(loginUrl, formData);
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    loginUrl.searchParams.set("error", error.message);
    preservaRedirect(loginUrl, formData);
    return NextResponse.redirect(loginUrl);
  }

  // Rispetta la destinazione scelta dall'utente (passata dal layout
  // dell'area tramite ?redirect=). Solo path interni (iniziano con /).
  const redirect = String(formData.get("redirect") ?? "").trim();
  const destinazione = redirect.startsWith("/") ? redirect : "/";
  return NextResponse.redirect(new URL(destinazione, request.url));
}
