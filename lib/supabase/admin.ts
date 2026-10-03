import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

export function createAdminSupabaseClient() {
  // Supabase is migrating from the legacy service_role JWT to the
  // publishable/secret API-key model. Prefer the new server-only secret key;
  // keep the legacy variable as a temporary fallback for zero-downtime
  // migration until the Vercel environment is updated.
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY mancante.");
  }

  const { url } = getSupabaseConfig();
  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
