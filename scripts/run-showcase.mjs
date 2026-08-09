import { getCategoriaShowcase, getCategoriaBySlug, getCategorieConNegozi } from "@/lib/negozi";

async function main() {
  const slug = process.argv[2] || "panificio";

  console.log("=== getCategoriaBySlug(%s) ===", slug);
  const cat = await getCategoriaBySlug(slug);
  console.log("cat:", JSON.stringify(cat, null, 2));

  console.log("\n=== getCategorieConNegozi() ===");
  const cc = await getCategorieConNegozi();
  for (const { categoria, count } of cc.slice(0, 15)) {
    console.log(` - [${count}] ${categoria.slug}  (${categoria.nome})`);
  }

  console.log("\n=== getCategoriaShowcase(%s) ===", slug);
  const res = await getCategoriaShowcase(slug);
  console.log("categoria:", res.categoria ? `${res.categoria.slug} — ${res.categoria.nome}` : "NULL");
  console.log("totaleNegozi:", res.totaleNegozi);
  for (const n of res.negozi) {
    console.log(` - negozio slug=${n.slug}  nome=${n.nome}  id=${n.id.slice(0, 8)}`);
  }
}

main().catch((e) => { console.error("UNHANDLED:", e); process.exit(1); });
