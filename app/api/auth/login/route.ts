import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Mappa area → percorso di atterraggio. */
function areaToPath(area: string): string {
  switch (area) {
    case "admin": return "/amministratore";
    case "merchant": return "/merchant";
    case "cliente": return "/cliente";
    default: return "";
  }
}

/** Riporta l'area sul loginUrl se valida. */
function preservaArea(loginUrl: URL, formData: FormData) {
  const area = String(formData.get("area") ?? "").trim();
  if (areaToPath(area)) {
    loginUrl.searchParams.set("area", area);
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
    preservaArea(loginUrl, formData);
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    loginUrl.searchParams.set("error", error.message);
    preservaArea(loginUrl, formData);
    return NextResponse.redirect(loginUrl);
  }

  // Rispetta l'area scelta dall'utente (passata dal layout tramite
  // ?area=admin|merchant|cliente). Nessun redirect automatico.
  const area = String(formData.get("area") ?? "").trim();
  const destinazione = areaToPath(area) || "/";
  return NextResponse.redirect(new URL(destinazione, request.url));
}
