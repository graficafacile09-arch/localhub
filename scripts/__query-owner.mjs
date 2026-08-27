import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// tutti gli utenti con email test (via Admin API)
const { data: lista, error: e1 } = await db.auth.admin.listUsers();
const utenti = (lista?.users ?? []).filter((u) => u.email?.includes("test@localhub.it"));
console.log("utenti:", JSON.stringify(utenti.map((u) => ({ id: u.id, email: u.email })) ?? null), e1 ? "ERR " + e1.message : "");

if (utenti.length) {
  const mer = utenti.find((u) => u.email.startsWith("commerciante-a"));
  if (mer) {
    const { data: st } = await db
      .from("negozi")
      .select("id, nome, owner_user_id, attivo, deleted_at")
      .eq("owner_user_id", mer.id);
    console.log("negozi di merchantA:", JSON.stringify(st ?? null));
  }
  const adminU = utenti.find((u) => u.email.startsWith("admin"));
  if (adminU) {
    const { data: st } = await db
      .from("negozi")
      .select("id, nome, owner_user_id, attivo, deleted_at")
      .eq("owner_user_id", adminU.id);
    console.log("negozi di admin:", JSON.stringify(st ?? null));
  }
  // negozi ATTIVI reali (non deleted) per test dell'area venditore come admin
  const { data: attivi } = await db
    .from("negozi")
    .select("id, nome, slug, attivo, deleted_at")
    .is("deleted_at", null)
    .eq("attivo", true)
    .limit(8);
  console.log(
    "negozi attivi:",
    JSON.stringify((attivi ?? []).map((s) => ({ id: s.id, nome: s.nome, slug: s.slug })))
  );
  for (const m of utenti.filter((u) => u.email.startsWith("commerciante"))) {
    const { data: st } = await db
      .from("negozi")
      .select("id, nome, owner_user_id, attivo, deleted_at")
      .eq("owner_user_id", m.id);
    console.log(
      "negozi di " + m.email + ":",
      JSON.stringify((st ?? []).map((s) => ({ id: s.id, nome: s.nome, attivo: s.attivo, deleted: !!s.deleted_at })))
    );
  }
}
process.exit(0);
