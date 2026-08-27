import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const val = m[2].replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: panificio, error: err1 } = await db
    .from("negozi")
    .select("id, nome, owner_user_id")
    .eq("id", "f3a82af7-dd47-482f-8a49-ea58e692238c");
  if (err1) throw err1;
  console.log("PANIFICIO:", JSON.stringify(panificio));

  if (panificio?.[0]?.owner_user_id) {
    const { data: user, error: err2 } = await db.auth.admin.getUserById(panificio[0].owner_user_id);
    if (err2) {
      console.log("errore getUserById:", err2.message);
    } else {
      console.log("OWNER EMAIL:", user?.user?.email);
    }
  }

  // Negozi dei merchant di test
  const { data: negozi, error: err3 } = await db
    .from("negozi")
    .select("id, nome, owner_user_id, attivo")
    .in("owner_user_id", [
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    ]);
  if (err3) console.log("errore query negozi:", err3.message);
  else console.log("NEGOZI (placeholder owners):", JSON.stringify(negozi));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
