import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getRoleForUser, redirectPerRuolo } from "@/lib/auth/roles";

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

  // Redirect automatico in base al ruolo (FASE 7):
  // customer → / · merchant → /merchant · admin → /amministratore
  const role = data?.user ? await getRoleForUser(data.user.id) : "customer";
  return NextResponse.redirect(new URL(redirectPerRuolo(role), request.url));
}
