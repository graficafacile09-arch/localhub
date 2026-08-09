// Utility locale: verifica i modelli Groq disponibili con la chiave del progetto
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

if (!env.GROQ_API_KEY) {
  console.log("NO GROQ_API_KEY in .env.local");
  process.exit(0);
}

const res = await fetch("https://api.groq.com/openai/v1/models", {
  headers: { Authorization: "Bearer " + env.GROQ_API_KEY },
});
const data = await res.json();
if (!res.ok) {
  console.log("HTTP", res.status, JSON.stringify(data).slice(0, 300));
  process.exit(0);
}
const modelIds = (data.data || []).map((m) => m.id);
const whispers = modelIds.filter((m) => /whisper|audio|stt/i.test(m));
console.log("TOT MODELS:", modelIds.length);
console.log("WHISPER/AUDIO:", whispers.length ? whispers.join(", ") : "NESSUNO");
console.log("PRIMI 20:", modelIds.slice(0, 20).join(", "));
