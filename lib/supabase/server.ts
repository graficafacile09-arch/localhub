import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";
import { senzaPersistenza } from "@/lib/auth/remember";

type MutableCookieStore = {
  set?: (name: string, value: string, options?: Record<string, unknown>) => void;
};

export async function createServerSupabaseClient(options?: {
  /**
   * "Ricordami": true → sessione persistente (default, sopravvive al riavvio
   * del browser); false → cookie di sessione (eliminati alla chiusura).
   */
  remember?: boolean;
}) {
  const remember = options?.remember ?? true;
  const { url, anonKey } = getSupabaseConfig();
  const cookieStore = await cookies();
  const mutableCookieStore = cookieStore as unknown as MutableCookieStore;

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (!mutableCookieStore.set) {
          return;
        }

        cookiesToSet.forEach(({ name, value, options }) => {
          mutableCookieStore.set?.(
            name,
            value,
            remember ? options : senzaPersistenza(options)
          );
        });
      },
    },
    // I cookie di sessione sono httpOnly (mai leggibili dal JS del browser,
    // come il cookie area lh_area) e Secure in produzione. Path, SameSite e
    // maxAge restano i default del pacchetto (/, lax, 400 giorni) quando
    // "Ricordami" è attivo; altrimenti diventano cookie di sessione.
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    },
  });
}
