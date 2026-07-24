import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import type { ProductVisionSuggestion } from "./types";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type CacheEntry = {
  id: string;
  image_hash: string;
  product_name: string;
  brand: string | null;
  category: string;
  ean: string | null;
  suggested_price: number | null;
  description: string;
  confidence: number;
  model_used: string;
  hit_count: number;
  created_at: string;
  updated_at: string;
  full_suggestion: ProductVisionSuggestion | null;
};

export type CacheResult =
  | { hit: true; entry: CacheEntry }
  | { hit: false };

async function computeAverageHash(buffer: Buffer): Promise<string> {
  const { data, info } = await sharp(buffer)
    .greyscale()
    .resize(8, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = data;
  if (pixels.length === 0) return "0".repeat(16);

  const sum = pixels.reduce((a, b) => a + b, 0);
  const avg = sum / pixels.length;

  let bits = "";
  for (let i = 0; i < pixels.length; i++) {
    bits += pixels[i] > avg ? "1" : "0";
  }

  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }

  return hex;
}

function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) dist++;
  }
  return dist;
}

function hexToBitString(hex: string): string {
  let bits = "";
  for (let i = 0; i < hex.length; i++) {
    const val = parseInt(hex[i], 16);
    bits += val.toString(2).padStart(4, "0");
  }
  return bits;
}

export async function checkImageCache(
  buffer: Buffer,
  hammingThreshold = 4
): Promise<CacheResult> {
  const supabase = getSupabase();
  if (!supabase) return { hit: false };

  const hash = await computeAverageHash(buffer);
  const hashBits = hexToBitString(hash);

  const { data: entries, error } = await supabase
    .from("product_vision_cache")
    .select("*")
    .limit(50);

  if (error || !entries || entries.length === 0) {
    return { hit: false };
  }

  let bestMatch: CacheEntry | null = null;
  let bestDist = hammingThreshold + 1;

  for (const entry of entries) {
    const entryBits = hexToBitString(entry.image_hash);
    const dist = hammingDistance(hashBits, entryBits);
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = entry as CacheEntry;
    }
  }

  if (bestMatch && bestDist <= hammingThreshold) {
    await supabase
      .from("product_vision_cache")
      .update({ hit_count: (bestMatch.hit_count ?? 0) + 1 })
      .eq("id", bestMatch.id);

    return { hit: true, entry: bestMatch };
  }

  return { hit: false };
}

export async function storeInCache(
  buffer: Buffer,
  suggestion: ProductVisionSuggestion,
  modelUsed: string
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const hash = await computeAverageHash(buffer);

  const existing = await supabase
    .from("product_vision_cache")
    .select("id, hit_count")
    .eq("image_hash", hash)
    .maybeSingle();

  if (existing.data) {
    await supabase
      .from("product_vision_cache")
      .update({
        product_name: suggestion.nome,
        brand: suggestion.marca,
        category: suggestion.categoria,
        ean: suggestion.codiceEan,
        suggested_price: suggestion.prezzoSuggerito,
        description: suggestion.descrizione,
        confidence: suggestion.confidenza,
        model_used: modelUsed,
        full_suggestion: suggestion,
      })
      .eq("id", existing.data.id);
  } else {
    await supabase
      .from("product_vision_cache")
      .insert({
        image_hash: hash,
        product_name: suggestion.nome,
        brand: suggestion.marca,
        category: suggestion.categoria,
        ean: suggestion.codiceEan,
        suggested_price: suggestion.prezzoSuggerito,
        description: suggestion.descrizione,
        confidence: suggestion.confidenza,
        model_used: modelUsed,
        full_suggestion: suggestion,
      } as any);
  }
}
