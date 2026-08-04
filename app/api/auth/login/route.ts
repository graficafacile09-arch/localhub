import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

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
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    loginUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(loginUrl);
  }

  // Dopo il login l'utente atterra sulla homepage e sceglie manualmente
  // l'area dal menu account (Area Clienti / Area Commerciante / Area Amministratore).
  // Nessun redirect automatico basato sul ruolo: il webmaster (multi-ruolo)
  // vede tutte le voci contemporaneamente.
  return NextResponse.redirect(new URL("/", request.url));
}
