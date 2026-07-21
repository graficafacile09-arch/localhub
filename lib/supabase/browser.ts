"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig, isSupabaseConfigured } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createBrowserSupabaseClient() {
  if (!isSupabaseConfigured()) {
    throw new Error("Configurazione Supabase mancante.");
  }

  if (!browserClient) {
    const { url, anonKey } = getSupabaseConfig();
    browserClient = createBrowserClient(url, anonKey);
  }

  return browserClient;
}
