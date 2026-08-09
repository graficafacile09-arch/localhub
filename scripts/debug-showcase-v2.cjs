const fs = require("fs");
const envText = fs.readFileSync(".env.local", "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*export\s+([A-Z0-9_]+)\s*=\s*(.*)$/i) || line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
  if (!m) continue;
  const [, k, vRaw] = m;
  if (k.startsWith("#")) continue;
  let v = vRaw.trim();
  const quoteMatch = v.match(/^"(.*)"$/);
  if (quoteMatch) v = quoteMatch[1];
  const singleMatch = v.match(/^'(.*)'$/);
  if (singleMatch) v = singleMatch[1];
  process.env[k] = process.env[k] ?? v;
}

const { createClient } = require("@supabase/supabase-js");
function normalizza(testo) {
  return testo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function estraiToken(campo) {
  return normalizza(campo ?? "").split(/[^a-z0-9]+/).map((t) => t.trim()).filter(Boolean);
}

function getTerminiCategoria(categoria) {
  return [categoria.nome, ...(categoria.sinonimi ?? [])].map((t) => t.trim().toLowerCase()).filter(Boolean);
}

function valoreCategoriaMatcha(valore, termini) {
  const v = (valore ?? "").trim();
  const vLow = v.toLowerCase();
  if (!vLow) return false;
  if (termini.includes(vLow)) return true;
  const tokenValore = estraiToken(v);
  if (tokenValore.length === 0) return false;
  for (const termine of termini) {
    const t = termine.trim();
    if (!t) continue;
    if (tokenValore.includes(normalizza(t).trim())) return true;
    const tokenTermine = estraiToken(t);
    if (tokenTermine.some((tk) => tokenValore.includes(tk))) return true;
  }
  return false;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !srk) { console.log("ENV_MISSING"); return; }
  const db = createClient(url, srk, { auth: { autoRefreshToken: false, persistSession: false } });

  const slug = process.argv[2] || "panificio";

  const r1 = await db.from("categorie").select("*").eq("slug", slug).eq("attivo", true).maybeSingle();
  console.log("--- DB bySlug(%s): id=%s nome=%s err=%s", slug, r1.data?.id, r1.data?.nome, r1.error?.message);
  if (!r1.data) return;

  const termini = getTerminiCategoria(r1.data);
  console.log("--- termini:", termini);

  const r2 = await db.from("negozi").select("id,nome,categoria,slug,attivo").eq("attivo", true).is("deleted_at", null);
  console.log("--- negozi count:", (r2.data ?? []).length, "err:", r2.error?.message);

  let matched = [];
  for (const n of r2.data ?? []) {
    const ok = valoreCategoriaMatcha(n.categoria, termini);
    console.log((ok?"MATCH ":"NO    "), n.id.slice(0,8), "categoria=", n.categoria, "slug=", n.slug, "nome=", n.nome);
    if (ok) matched.push(n);
  }
  console.log("--- TOTAL MATCHED:", matched.length);
}

main().catch((e) => { console.error("UNHANDLED:", e); process.exit(1); });
