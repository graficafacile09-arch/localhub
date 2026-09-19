import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSiteUrl } from "@/lib/site";

type AreaOAuth = "cliente" | "merchant";
type ProviderOAuth = "google" | "apple";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const area = url.searchParams.get("area") as AreaOAuth | null;
  const flow = url.searchParams.get("flow");
  const provider = url.searchParams.get("provider") as ProviderOAuth | null;

  const loginUrl = new URL("/login", request.url);
  if (area === "cliente" || area === "merchant") loginUrl.searchParams.set("area", area);

  if (!isSupabaseConfigured()) {
    loginUrl.searchParams.set("error", "Configurazione Supabase mancante.");
    return NextResponse.redirect(loginUrl);
  }

  if (!area || !["cliente", "merchant"].includes(area) || flow !== "register" || !provider || !["google", "apple"].includes(provider)) {
    loginUrl.searchParams.set("error", "Metodo di registrazione non valido.");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createServerSupabaseClient();
  const callbackUrl = new URL("/auth/callback", getSiteUrl());
  callbackUrl.searchParams.set("area", area);
  callbackUrl.searchParams.set("flow", "oauth-register");
  callbackUrl.searchParams.set("provider", provider);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url) {
    console.error("[auth/oauth/start] OAuth non disponibile:", error?.message ?? "URL provider assente");
    loginUrl.searchParams.set("error", "Non è stato possibile avviare la registrazione. Riprova.");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(data.url);
}
