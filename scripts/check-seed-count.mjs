import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20260802_seed_demo_completo.sql", "utf8");

const insertMatch = sql.match(/insert into public\.negozi\s*\(([\s\S]*?)\)\s*values\s*([\s\S]*?)\n\s*on conflict/);
if (!insertMatch) {
  console.error("INSERT negozi non trovato");
  process.exit(1);
}

const cols = insertMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
console.log("Colonne negozi:", cols.length);

// Le righe sono delimitate da "),\n("
const rowsRaw = insertMatch[2].split(/\),\s*\n\s*\(/);
const rows = rowsRaw.map((r) => r.replace(/^\(/, "").replace(/\)\s*$/, ""));

// Contatore di espressioni top-level (rispetta stringhe, ARRAY[...])
function countExpressions(inner) {
  let count = 0;
  let inString = false;
  let inArray = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inString) {
      if (c === "'" && inner[i - 1] !== "\\") inString = false;
      continue;
    }
    if (c === "'") { inString = true; continue; }
    if (c === "[") inArray++;
    if (c === "]") inArray--;
    if (c === "," && inArray === 0) count++;
  }
  return count + 1;
}

rows.forEach((row, i) => {
  const n = countExpressions(row);
  const ok = n === cols.length ? "OK" : "MISMATCH";
  console.log(`riga ${i + 1}: ${n} valori (colonne: ${cols.length}) ${ok}`);
  if (n !== cols.length) {
    // Mostra la zona finale della riga (dopo gli orari) per individuare il problema
    const idx = row.indexOf("ARRAY[");
    const slice = row.slice(idx > 0 ? idx - 220 : 0, idx > 0 ? idx + 60 : 300).replace(/\s+/g, " ");
    console.log("  …", slice);
  }
});
