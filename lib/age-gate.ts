"use server";

import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const VERIFIED_COOKIE_PREFIX = "incitta_age_verified_";
const BLOCKED_COOKIE_PREFIX = "incitta_age_blocked_";

function cookieName(prefix: string, prodottoId: string): string {
  return `${prefix}${prodottoId}`;
}

function isMaggiorenne(month: number, year: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (year > currentYear - 18) return false;
  if (year < currentYear - 18) return true;

  // Con solo mese/anno adottiamo una soglia prudenziale: nel mese del
  // diciottesimo compleanno l'accesso resta bloccato fino al mese successivo.
  return month < currentMonth;
}

export async function verificaAccessoProdotto18(
  prodottoId: string,
  mese: string,
  anno: string,
): Promise<{ ok: boolean; reason?: "invalid" | "underage" | "unavailable" }> {
  const month = Number.parseInt(mese, 10);
  const year = Number.parseInt(anno, 10);

  if (
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(year) ||
    year < 1900 ||
    year > new Date().getFullYear()
  ) {
    return { ok: false, reason: "invalid" };
  }

  const supabase = await createServerSupabaseClient();
  const { data: prodotto, error } = await supabase
    .from("prodotti")
    .select("soggetto_verifica_eta")
    .eq("id", prodottoId)
    .maybeSingle();

  if (error || !prodotto) {
    return { ok: false, reason: "unavailable" };
  }

  if (!Boolean(prodotto.soggetto_verifica_eta)) {
    return { ok: true };
  }

  const cookieStore = await cookies();
  const verifiedCookie = cookieName(VERIFIED_COOKIE_PREFIX, prodottoId);
  const blockedCookie = cookieName(BLOCKED_COOKIE_PREFIX, prodottoId);

  if (!isMaggiorenne(month, year)) {
    cookieStore.set(blockedCookie, "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
    cookieStore.set(verifiedCookie, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return { ok: false, reason: "underage" };
  }

  cookieStore.set(verifiedCookie, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  cookieStore.set(blockedCookie, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

}
