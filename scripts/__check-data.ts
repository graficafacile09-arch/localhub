import { createAdminSupabaseClient } from "../lib/supabase/admin";
async function main() {
  const db = createAdminSupabaseClient();
  const { data: prods, error: pe } = await db.from("prodotti").select("id, nome, slug, negozio_id").limit(10);
  console.log("PRODOTTI (10):", pe ? pe.message : JSON.stringify(prods));
  const { data: stores, error: se } = await db.from("negozi").select("id, nome, slug").limit(15);
  console.log("NEGOZI (15):", se ? se.message : JSON.stringify(stores));
}
main();
