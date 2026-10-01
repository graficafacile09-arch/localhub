import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { normalizzaRichiesta } from "./local-intents";
import type { PinoIntentAnalysis } from "./intent";

export type PinoMemoriaVoce = {
  termine: string;
  concetto: string;
  tipo: string;
  frequenza: number;
  successi: number;
  fallimenti: number;
  confidence: number;
};

const STOPWORDS = new Set([
  "dove","come","cosa","quale","quali","vorrei","voglio","cerco","cerca",
  "cercando","trovami","trova","posso","puoi","potrei","serve","servirebbe",
  "bisogno","comprare","acquistare","una","uno","un","il","lo","la","i",
  "gli","le","di","del","della","dei","degli","delle","a","da","in","con",
  "per","su","mi","me","e","o","che","qui","oggi","domani",
]);

function normalizzaTermine(value: string): string {
  return normalizzaRichiesta(value ?? "")
    .replace(/[^a-z0-9àèéìòù\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function terminiDellaQuery(query: string, analisi: PinoIntentAnalysis): string[] {
  const q = normalizzaTermine(query);
  if (!q) return [];
  const segnali = analisi.segnali
    .map((s) => s.includes(":") ? s.split(":").slice(1).join(":") : "")
    .map(normalizzaTermine)
    .filter(Boolean);
  const token = q.split(/\s+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  return Array.from(new Set([
    ...segnali,
    ...(token.length <= 3 ? [q] : token.slice(0, 3)),
  ])).slice(0, 4);
}

export async function recuperaMemoria(query: string): Promise<PinoMemoriaVoce[]> {
  try {
    const supabase = createAdminSupabaseClient();
    const termini = Array.from(new Set(
      normalizzaTermine(query).split(/\s+/).filter((t) => t.length >= 3).slice(0, 6)
    ));
    if (!termini.length) return [];
    const { data, error } = await supabase
      .from("pino_memoria")
      .select("termine, concetto, tipo, frequenza, successi, fallimenti, confidence")
      .in("termine", termini)
      .gte("frequenza", 2)
      .gte("confidence", 0.70)
      .order("confidence", { ascending: false })
      .order("frequenza", { ascending: false })
      .limit(8);
    if (error) {
      console.warn("[pino-memoria] recupero fallito:", error.message);
      return [];
    }
    return (data ?? []) as PinoMemoriaVoce[];
  } catch (error) {
    console.warn("[pino-memoria] recupero non disponibile:", error);
    return [];
  }
}

export async function registraEsitoMemoria(params: {
  query: string;
  analisi: PinoIntentAnalysis;
  categorie?: string[];
  risultati: number;
  memoriaUsata?: PinoMemoriaVoce[];
}): Promise<void> {
  try {
    const supabase = createAdminSupabaseClient();
    const termini = terminiDellaQuery(params.query, params.analisi);
    const concettiIntento = params.analisi.terminiPrioritari.map(normalizzaTermine).filter(Boolean).slice(0, 3);
    const concettiCatalogo = (params.categorie ?? []).map(normalizzaTermine).filter(Boolean).slice(0, 3);

    const associazioni = params.risultati > 0
      ? termini.flatMap((termine) =>
          Array.from(new Set([...concettiIntento, ...concettiCatalogo]))
            .filter((concetto) => concetto && concetto !== termine)
            .slice(0, 4)
            .map((concetto) => ({ termine, concetto, tipo: "semantica" }))
        )
      : (params.memoriaUsata ?? []).map((v) => ({
          termine: v.termine, concetto: v.concetto, tipo: v.tipo || "semantica",
        }));

    if (!associazioni.length) return;

    const chiavi = Array.from(new Set(associazioni.map((a) => a.termine)));
    const { data: esistenti } = await supabase
      .from("pino_memoria")
      .select("id, termine, concetto, tipo, frequenza, successi, fallimenti")
      .in("termine", chiavi);
    const byKey = new Map((esistenti ?? []).map((v) => [`${v.termine}::${v.concetto}`, v]));

    for (const a of associazioni) {
      const old = byKey.get(`${a.termine}::${a.concetto}`);
      const frequenza = (old?.frequenza ?? 0) + 1;
      const successi = (old?.successi ?? 0) + (params.risultati > 0 ? 1 : 0);
      const fallimenti = (old?.fallimenti ?? 0) + (params.risultati > 0 ? 0 : 1);
      const confidence = Number(((successi + 1) / (successi + fallimenti + 2)).toFixed(4));
      const { error } = await supabase.from("pino_memoria").upsert({
        ...(old?.id ? { id: old.id } : {}),
        termine: a.termine,
        concetto: a.concetto,
        tipo: a.tipo,
        frequenza,
        successi,
        fallimenti,
        confidence,
        ultima_utilizzazione: new Date().toISOString(),
      }, { onConflict: "termine,concetto" });
      if (error) console.warn("[pino-memoria] scrittura fallita:", error.message);
    }
  } catch (error) {
    console.warn("[pino-memoria] aggiornamento non disponibile:", error);
  }
}
