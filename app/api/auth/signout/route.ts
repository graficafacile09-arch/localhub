import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AREA_COOKIE, areaCookieOptions } from "@/lib/auth/area";

export async function POST(request: Request) {
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  }

  // Al logout l'area attiva viene CANCELLATA: la prossima sessione dovrà
  // sceglierla di nuovo dall'ingresso corretto. Dopo la chiusura reale della
  // sessione si mostra la pagina di saluto (mai memorizzata, così il tasto
  // Back del browser non può riproporre contenuti autenticati).
  const response = NextResponse.redirect(new URL("/logout-success", request.url));
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(AREA_COOKIE, "", { ...areaCookieOptions(), maxAge: 0 });
  return response;
}
