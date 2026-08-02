import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase/config";
import { getRoleForUser, ruoloSoddisfa } from "@/lib/auth/roles";

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
  if (areaAmministratore || areaMerchant) {
    // Non loggato → login
    if (!user) {
      return redirectConSessione("/login");
    }

    const role = await getRoleForUser(user.id);

    // /amministratore → SOLO admin
    if (areaAmministratore && !ruoloSoddisfa(role, ["admin"])) {
      return redirectConSessione("/");
    }

    // /merchant → merchant o admin
    if (areaMerchant && !ruoloSoddisfa(role, ["merchant", "admin"])) {
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
