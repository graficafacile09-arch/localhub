import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getRuoliUtente } from "@/lib/auth/roles";
import {
  AREA_COOKIE,
  areaCookieOptions,
  areaEffettiva,
  areaPerRuoli,
  areaToPath,
  isAreaAttiva,
} from "@/lib/auth/area";

/** Riporta l'area sul loginUrl se valida. */
function preservaArea(loginUrl: URL, formData: FormData) {
  const area = String(formData.get("area") ?? "").trim();
  if (isAreaAttiva(area)) {
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

  // ── Area attiva della sessione ────────────────────────────────────────
  // L'area è SCELTA dall'ingresso (Accedi come Cliente/Venditore/
  // Amministrazione) e resta fissa per tutta la sessione. L'area scelta
  // deve corrispondere a un ruolo posseduto (per admin: anche l'email
  // autorizzata); altrimenti si ripiega sulla propria area. Il cookie è
  // httpOnly: il browser non può modificarlo, quindi l'unico modo per
  // cambiare area è fare logout e rientrare dall'ingresso corretto.
  const areaRichiesta = String(formData.get("area") ?? "").trim();
  const ruoli = await getRuoliUtente(data.user.id);
  const userEmail = data.user.email ?? "";

  const areaAttiva = isAreaAttiva(areaRichiesta)
    ? areaEffettiva(userEmail, ruoli, areaRichiesta)
    : areaPerRuoli(userEmail, ruoli);

  // Ingresso esplicito → si atterra nell'area scelta; login generico (senza
  // area) → homepage, ma con la sessione già legata all'area dell'utente.
  const destinazione = isAreaAttiva(areaRichiesta) && areaAttiva
    ? areaToPath(areaAttiva)
    : "/";

  const response = NextResponse.redirect(new URL(destinazione, request.url));
  if (areaAttiva) {
    response.cookies.set(AREA_COOKIE, areaAttiva, areaCookieOptions());
  }
  return response;
}
