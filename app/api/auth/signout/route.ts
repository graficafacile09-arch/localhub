import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AREA_COOKIE, areaCookieOptions } from "@/lib/auth/area";
import { REMEMBER_COOKIE, rememberCookieOptions } from "@/lib/auth/remember";

export async function POST(request: Request) {
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  }

  // Al logout l'area attiva viene CANCELLATA: la prossima sessione dovrà
  // sceglierla di nuovo dall'ingresso corretto.
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(AREA_COOKIE, "", { ...areaCookieOptions(), maxAge: 0 });
  response.cookies.set(REMEMBER_COOKIE, "", { ...rememberCookieOptions(false), maxAge: 0 });
  return response;
}
