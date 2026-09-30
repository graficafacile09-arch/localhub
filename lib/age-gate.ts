"use server";

import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const VERIFIED_COOKIE = "incitta_age_verified";
const BLOCKED_COOKIE = "incitta_age_blocked";

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

  if (!isMaggiorenne(month, year)) {
    cookieStore.set(BLOCKED_COOKIE, "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
    cookieStore.set(VERIFIED_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return { ok: false, reason: "underage" };
  }

  cookieStore.set(VERIFIED_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  cookieStore.set(BLOCKED_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return { ok: true };
}
