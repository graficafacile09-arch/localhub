require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !srk) { console.log("ENV_MISSING"); return; }
  const db = createClient(url, srk, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log("--- 1) getCategorie ---");
  const r1 = await db.from("categorie").select("*").eq("attivo", true).order("ordine", { ascending: true });
  console.log("count:", (r1.data ?? []).length, "errCode:", r1.error?.code, "errMsg:", r1.error?.message);

  console.log("--- 2) getCategoriaBySlug(panificio) single ---");
  const r2 = await db.from("categorie").select("*").eq("slug", "panificio").eq("attivo", true).single();
  console.log("dataId:", r2.data?.id, "dataNome:", r2.data?.nome, "errCode:", r2.error?.code, "errMsg:", r2.error?.message);

  console.log("--- 3) getCategoriaShowcase(panificio) raw query negozi ---");
  const r3 = await db.from("negozi").select("*").eq("attivo", true).is("deleted_at", null);
  const rows = (r3.data ?? []);
  console.log("negozi count:", rows.length, "errCode:", r3.error?.code);
  for (const n of rows.slice(0, 6)) {
    console.log(" -", n.id.slice(0, 8), "nome=", n.nome, "categoria=", n.categoria, "slug=", n.slug);
  }
}
main().catch((e) => { console.error("UNHANDLED:", e); process.exit(1); });
