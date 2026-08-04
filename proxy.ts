import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase/config";
import { getRuoliUtente, ruoliSoddisfano } from "@/lib/auth/roles";

export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  const { url, anonKey } = getSupabaseConfig();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const areaAmministratore = pathname.startsWith("/amministratore");
  const areaMerchant = pathname.startsWith("/merchant");
  const areaCliente = pathname.startsWith("/cliente");

  // Redirect mantenendo i cookie di sessione appena rinfrescati da getUser.
  function redirectConSessione(destinazione: string) {
    const redirectResponse = NextResponse.redirect(
      new URL(destinazione, request.url)
    );
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    }
    return redirectResponse;
  }

  // ── Protezione delle aree riservate ──────────────────────────────────
  // Verifica sull'INSIEME dei ruoli (multi-role): un utente con più ruoli
  // (es. il webmaster admin+merchant+customer) accede a ogni area a cui
  // corrisponde almeno uno dei suoi ruoli.
  if (areaAmministratore || areaMerchant || areaCliente) {
    // Non loggato → login (preservando la destinazione originale)
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return redirectConSessione(loginUrl.toString());
    }

    const ruoli = await getRuoliUtente(user.id);

    // /amministratore → SOLO chi possiede il ruolo admin
    if (areaAmministratore && !ruoliSoddisfano(ruoli, ["admin"])) {
      return redirectConSessione("/");
    }

    // /merchant → merchant o admin
    if (areaMerchant && !ruoliSoddisfano(ruoli, ["merchant", "admin"])) {
      return redirectConSessione("/");
    }

    // /cliente → SOLO chi possiede il ruolo customer
    if (areaCliente && !ruoliSoddisfano(ruoli, ["customer"])) {
      return redirectConSessione("/");
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
