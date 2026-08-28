import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase/config";
import { getRuoliUtente, isAdminEmail } from "@/lib/auth/roles";
import {
  AREA_COOKIE,
  areaCookieOptions,
  areaPerRuoli,
  areaToPath,
  isAreaAttiva,
  risolviAreaAttiva,
  type AreaAttiva,
} from "@/lib/auth/area";
import { GUEST_COOKIE } from "@/lib/auth/guest";

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
    // Idem al client server: refresh/correzione della sessione mantengono i
    // cookie httpOnly e Secure (vedi lib/supabase/server.ts).
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // ── Pulizia modalità guest: se l'utente accede alla pagina di login
  // (scelta esplicita di fare login), rimuoviamo il cookie guest.
  // Questo evita una sessione guest parallela dopo il login.
  if (pathname === "/login") {
    response.cookies.delete(GUEST_COOKIE);
  }

  const areaRichiesta: AreaAttiva | null =
    pathname.startsWith("/amministratore") ? "admin"
    : pathname.startsWith("/merchant") ? "merchant"
    : pathname.startsWith("/cliente") ? "cliente"
    : null;

  // Redirect mantenendo i cookie di sessione appena rinfrescati da getUser.
  function redirectConSessione(destinazione: string, cookieArea: AreaAttiva | null = null) {
    const redirectResponse = NextResponse.redirect(
      new URL(destinazione, request.url)
    );
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    }
    if (cookieArea) {
      redirectResponse.cookies.set(AREA_COOKIE, cookieArea, areaCookieOptions());
    }
    return redirectResponse;
  }

  // ── Pagine pubbliche: migrazione sessioni legacy ──────────────────────
  // Se un utente autenticato non ha ancora il cookie lh_area (sessioni create
  // prima dell'area attiva), glielo assegniamo in base ai ruoli, così il menu
  // e i gate risultano coerenti dal primo caricamento.
  if (!areaRichiesta) {
    if (user) {
      const cookieValue = request.cookies.get(AREA_COOKIE)?.value;
      if (!isAreaAttiva(cookieValue)) {
        const ruoli = await getRuoliUtente(user.id);
        const area = areaPerRuoli(user.email ?? "", ruoli);
        if (area) {
          response.cookies.set(AREA_COOKIE, area, areaCookieOptions());
        }
      }
      // Utente autenticato → pulisci cookie guest (non serve più)
      if (request.cookies.has(GUEST_COOKIE)) {
        response.cookies.delete(GUEST_COOKIE);
      }
    }
    return response;
  }

  // ── Aree riservate ────────────────────────────────────────────────────
  // Non loggato → login preservando l'area richiesta.
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("area", areaRichiesta);
    return redirectConSessione(loginUrl.toString());
  }

  const ruoli = await getRuoliUtente(user.id);
  const email = user.email ?? "";
  const cookieValue = request.cookies.get(AREA_COOKIE)?.value;
  const { area, correzione } = risolviAreaAttiva(email, ruoli, cookieValue);

  // Nessuna area possibile per questo utente → login (non può stare in aree).
  if (!area) {
    return redirectConSessione(`/login?area=${areaRichiesta}`);
  }

  // Cookie mancante/invalido/non più consentito → correzione con redirect.
  if (correzione) {
    return redirectConSessione(areaToPath(area), area);
  }

  // Area della sessione diversa da quella richiesta → blocco visibile.
  // - Account di supervisione (admin autorizzato): comportamento storico,
  //   redirect silenzioso alla propria area di sessione.
  // - API: comportamento storico invariato (redirect).
  // - Pagine: pass-through — il layout dell'area renderizza l'avviso rosso
  //   "Area non autorizzata" (sessione intatta, nessun logout).
  if (area !== areaRichiesta) {
    if (ruoli.includes("admin") && isAdminEmail(email)) {
      return redirectConSessione(areaToPath(area));
    }
    if (pathname.startsWith("/api")) {
      return redirectConSessione(areaToPath(area));
    }
    return response;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
