# LOCALHUB — ARCHITETTURA DI PRODUZIONE VISION AI
## Documento di Progettazione Definitivo per il Riconoscimento Prodotti
## Versione 1.0 — Luglio 2026

---

## 1. CONCLUSIONI ARCHITETTURALI E RACCOMANDAZIONE TECNICA DEFINITIVA

### 1.1 Decisione Principale: Gemma 4 come Modello di Produzione

**Gemma 4 (Cloudflare Workers AI) rimane il provider principale** per il riconoscimento prodotti in LocalHub.

**Motivazioni tecniche:**

| Fattore | Gemma 4 (Cloudflare) | Gemini 2.5 Flash | Vincitore |
|---------|---------------------|------------------|-----------|
| **Infrastruttura già operativa** | ✅ Già in produzione, testata, monitorata | ❌ Nuova integrazione | Gemma 4 |
| **Costi operativi certi** | 10K neuroni/giorno free, $0.011/1K neuroni | $0.075/M in, $0.60/M out | Gemma 4 (più prevedibili) |
| **Latenza edge** | <500ms (Cloudflare edge, 300+ PoP) | 1.5–2.5s (API centrale Google) | Gemma 4 |
| **Cold start** | Nessuno (modello sempre caldo su edge) | Nessuno (ma API centrale) | Pari |
| **Affidabilità storica** | 2+ anni in produzione LocalHub | Nuova integrazione | Gemma 4 |
| **OCR/EAN/Multilingua** | Accettabile per prodotti comuni | Superiore | **Gemini** (solo come fallback) |
| **Quota free** | 10K neuroni/giorno (condivisi) | 1.5K req/giorno (Flash) | Pari |
| **Costo scala** | $0.011/1K neuroni | $0.075/M in, $0.60/M out | **Gemma 4** (più economico a volume) |

**Conclusione:** Gemma 4 offre la **migliore combinazione costo/performance/affidabilità** per il caso d'uso principale di LocalHub (riconoscimento prodotti da supermercato/casa). Gemini 2.5 Flash/Flash-Lite viene mantenuto come **fallback intelligente** solo quando Gemma 4 ha bassa confidenza o fallisce.

### 1.2 Ruolo di Gemini 2.5 Flash / Flash-Lite

Gemini non sostituisce Gemma 4, ma agisce come **safety net intelligente**:

- **Attivazione:** Solo quando `confidenza < SOGLIA_FALLBACK` (default: 65%)
- **Caso d'uso:** Prodotti difficili (etichette rovinate, angolazioni strane, prodotti nuovi non in catalogo)
- **Costo marginale:** Attivato solo ~15-20% delle richieste → costo operativo trascurabile
- **Valore aggiunto:** OCR superiore, multilingua nativa, reasoning su etichette complesse

---

## 2. PIPELINE DI PRODUZIONE COMPLETA

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PIPELINE VISION AI — LOCALHUB                        │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐     ┌─────────────────┐     ┌────────────────────────────┐
  │  SMARTPHONE  │────▶│  PREPROCESSING  │────▶│  PERCEPTUAL HASH (8×8)     │
  │  Camera API  │     │  • Resize 800px │     │  • Grayscale → 64-bit      │
  │  • 800px max │     │  • JPEG 80%     │     │  • Hamming distance ≤ 4   │
  │  • JPEG 80%  │     │  • Base64       │     └───────────┬────────────────┘
  └──────────────┘     └─────────────────┘                 │
                                                         ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                        CACHE LOOKUP (Supabase)                          │
  │  SELECT * FROM product_vision_cache WHERE hamming_distance(hash, :h) ≤ 4│
  └─────────────────────────────────────────────────────────────────────────┘
                    │                                    │
              HIT (≤4 bit)                          MISS (>4 bit)
                    │                                    │
                    ▼                                    ▼
        ┌─────────────────────┐              ┌─────────────────────────┐
        │  RETURN CACHED      │              │  GEMMA 4 (Cloudflare)   │
        │  • suggestion       │              │  • Prompt strutturato   │
        │  • cached: true     │              │  • Max 300 token        │
        │  • hit_count++      │              │  • Temp 0.1             │
        │  • <200ms total     │              │  • Timeout 30s          │
        └─────────────────────┘              └───────────┬─────────────┘
                                                           │
                                                         ▼
                                              ┌──────────────────────────┐
                                              │  CONFIDENZA ≥ 65% ?      │
                                              └───────────┬──────────────┘
                                              YES │       │ NO
                                                  ▼       ▼
                                        ┌─────────────┐ ┌───────────────────────┐
                                        │  RETURN     │ │  GEMINI 2.5 FLASH     │
                                        │  GEMMA 4    │ │  (Fallback)           │
                                        │  result     │ │  • Prompt avanzato    │
                                        │  • cached:  │ │  • OCR + reasoning    │
                                        │    false    │ │  • Multilingua        │
                                        │  • <3s tot  │ │  • Return + cache     │
                                        └─────────────┘ └───────────────────────┘
                                                  │
                                                  ▼
                                        ┌─────────────────────────┐
                                        │  STORE IN CACHE         │
                                        │  • perceptual_hash      │
                                        │  • full_suggestion JSON │
                                        │  • model_used           │
                                        │  • hit_count = 1        │
                                        └─────────────────────────┘
                                                  │
                                                  ▼
                                        ┌─────────────────────────┐
                                        │  PRODUCT DATA ENRICHMENT │
                                        │  • Lookup Supabase      │
                                        │    products (EAN/nome)  │
                                        │  • Merge suggestion +   │
                                        │    catalogo dati        │
                                        │  • Return final JSON    │
                                        └─────────────────────────┘
                                                  │
                                                  ▼
                                        ┌─────────────────────────┐
                                        │  FRONTEND RESPONSE      │
                                        │  {                      │
                                        │   success: true,        │
                                        │   suggestion: {...},    │
                                        │   lowConfidence: bool,  │
                                        │   cached: bool,         │
                                        │   fallbackUsed: bool,   │
                                        │   tempiFasi: {...}      │
                                        │ }                       │
                                        └─────────────────────────┘
```

---

## 3. SPECIFICHE DETTAGLIATE PER FASE

### 3.1 Acquisizione Immagine (Frontend)

```typescript
// Specifiche acquisizione
const CAMERA_CONSTRAINTS = {
  facingMode: 'environment',      // Camera posteriore
  width: { ideal: 800, max: 1920 },
  height: { ideal: 800, max: 1920 }
};

// Compressione client-side
const COMPRESSION_OPTIONS = {
  maxWidth: 800,
  maxHeight: 800,
  quality: 0.8,           // JPEG 80%
  maxSizeKB: 280,         // Hard limit
  fallbackToFile: true    // Se camera non disponibile
};

// Output: Blob JPEG ≤280KB, base64 per upload
```

### 3.2 Preprocessing (Backend — Sharp)

```typescript
const PREPROCESSING = {
  // Senza crop (default)
  noCrop: {
    resize: { width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true },
    jpeg: { quality: 80 }
  },
  // Con crop attention (opzionale ?crop=1)
  withCrop: {
    resize: { 
      width: 640, height: 640, 
      fit: 'cover', 
      position: 'attention',  // Smart crop su area d'interesse
      withoutEnlargement: true 
    },
    jpeg: { quality: 80 }
  }
};

// Output: Buffer JPEG ≤100KB, base64 per AI
```

### 3.3 Perceptual Hash (Cache Key)

```typescript
// Algoritmo: Average Hash (aHash) 8×8
async function computePerceptualHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .greyscale()
    .resize(8, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const pixels = new Uint8Array(data);
  const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length;
  
  let bits = '';
  for (const p of pixels) bits += p > avg ? '1' : '0';
  
  // 64 bit → 16 caratteri hex
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex; // 16 char hex = 64 bit
}

// Match: Hamming distance ≤ 4 bit (su 64 bit = 93.75% similarità)
function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) dist++;
  return dist;
}
```

### 3.4 Gemma 4 (Provider Principale)

```typescript
// Configurazione Gemma 4 su Cloudflare Workers AI
const GEMMA_CONFIG = {
  model: '@cf/google/gemma-4-26b-a4b-it',  // MoE 26B totali, 4B attivi
  endpoint: 'https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1/chat/completions',
  auth: 'Bearer {CLOUDFLARE_API_TOKEN}',
  
  params: {
    max_completion_tokens: 300,
    temperature: 0.1,
    chat_template_kwargs: { enable_thinking: false }
  },
  
  timeout: 30000,  // 30s hard timeout
  
  prompt: `Riconosci il prodotto nella foto. Restituisci SOLO JSON senza spiegazioni:
{
  "nome": "nome prodotto (max 80 caratteri)",
  "categoria": "categoria merceologica (es: Alimentari, Abbigliamento, Beauty, Casa, Elettronica, Sport)",
  "marca": "marca o null se non riconoscibile",
  "prezzo_suggerito": prezzo in euro o null,
  "descrizione": "descrivi in max 25 parole",
  "confidenza": 0-100
}
Regole: non inventare. confidenza onesta.`
};
```

### 3.5 Soglie di Confidenza e Fallback

| Soglia | Azione | Motivazione |
|--------|--------|-------------|
| **confidenza ≥ 85%** | ✅ Accetta risultato Gemma 4, no fallback | Alta affidabilità, risultato attendibile |
| **65% ≤ confidenza < 85%** | ⚠️ **Attiva fallback Gemini** | Zona grigia — Gemma incerto, Gemini può recuperare |
| **confidenza < 65%** | 🔴 **Attiva fallback Gemini obbligatorio** | Gemma non affidabile, serve secondo parere |
| **Errore Gemma / Timeout / HTTP 5xx** | 🔴 Fallback immediato a Gemini | Resilienza operativa |

```typescript
const CONFIDENCE_THRESHOLDS = {
  HIGH_CONFIDENCE: 85,      // Accetta Gemma, no fallback
  FALLBACK_TRIGGER: 65,     // Attiva Gemini come secondo parere
  LOW_CONFIDENCE: 65,       // Sotto = fallback obbligatorio
  
  // Override per categorie specifiche
  CATEGORY_OVERRIDES: {
    'Elettronica': { FALLBACK_TRIGGER: 75 },  // Codici/seriali difficili
    'Farmaceutici': { FALLBACK_TRIGGER: 80 }, // Sicurezza
    'Alimentari': { FALLBACK_TRIGGER: 65 }    // Standard
  }
};
```

### 3.6 Gemini 2.5 Flash / Flash-Lite (Fallback)

```typescript
const GEMINI_FALLBACK_CONFIG = {
  models: {
    primary: 'gemini-2.5-flash',           // Qualità massima
    fallback: 'gemini-2.0-flash-lite-001'  // Se quota esaurita
  },
  
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
  auth: 'key={GEMINI_API_KEY}',
  
  params: {
    maxOutputTokens: 300,
    temperature: 0.1,
    responseMimeType: 'application/json'  // Output JSON garantito
  },
  
  prompt: `Analizza l'immagine del prodotto. Restituisci JSON:
{
  "nome": "nome esatto prodotto",
  "marca": "marca/produttore",
  "categoria": "categoria",
  "codiceEan": "EAN-13 se leggibile o null",
  "descrizione": "descrizione breve",
  "prezzoSuggerito": numero o null,
  "confidenza": 0-100
}
Usa OCR per leggere testi, codici a barre, etichette. Non inventare.`
};
```

### 3.7 Cache (Supabase — product_vision_cache)

```sql
-- Tabella già creata (migration 20260724)
CREATE TABLE product_vision_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_hash TEXT NOT NULL,                    -- 16-char hex = 64-bit hash
  product_name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  ean TEXT,
  suggested_price NUMERIC,
  description TEXT,
  confidence INTEGER NOT NULL DEFAULT 0,
  model_used TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  full_suggestion JSONB
);

CREATE UNIQUE INDEX product_vision_cache_hash_idx ON product_vision_cache (image_hash);
CREATE INDEX product_vision_cache_name_idx ON product_vision_cache (product_name text_pattern_ops);
CREATE INDEX product_vision_cache_brand_idx ON product_vision_cache (brand);
CREATE INDEX product_vision_cache_ean_idx ON product_vision_cache (ean);

-- RLS: lettura pubblica, insert/update pubblici
ALTER TABLE product_vision_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON product_vision_cache FOR SELECT USING (true);
CREATE POLICY "public_insert" ON product_vision_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "public_update" ON product_vision_cache FOR UPDATE USING (true) WITH CHECK (true);
```

```typescript
// Cache lookup con Hamming distance ≤ 4
async function checkImageCache(buffer: Buffer): Promise<CacheResult> {
  const hash = await computePerceptualHash(buffer);
  const { data: entries } = await supabase
    .from('product_vision_cache')
    .select('*')
    .limit(50);  // Prendi ultimi 50, calcola Hamming in memoria
  
  let bestMatch = null, bestDist = 5;
  for (const entry of entries) {
    const dist = hammingDistance(hash, entry.image_hash);
    if (dist < 4 && dist < bestDist) { bestDist = dist; bestMatch = entry; }
  }
  
  if (bestMatch) {
    await supabase
      .from('product_vision_cache')
      .update({ hit_count: bestMatch.hit_count + 1 })
      .eq('id', bestMatch.id);
    return { hit: true, entry: bestMatch, distance: bestDist };
  }
  return { hit: false };
}
```

### 3.8 Recupero Dati Prodotto (Enrichment)

```typescript
async function enrichWithCatalog(suggestion: Suggestion): Promise<EnrichedSuggestion> {
  // 1. Cerca per EAN (match esatto)
  if (suggestion.codiceEan) {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('ean', suggestion.codiceEan)
      .maybeSingle();
    if (data) return mergeSuggestionWithCatalog(suggestion, data);
  }
  
  // 2. Cerca per nome + marca (fuzzy)
  if (suggestion.nome && suggestion.marca) {
    const { data } = await supabase
      .from('products')
      .select('*')
      .ilike('nome', `%${suggestion.nome}%`)
      .ilike('brand', `%${suggestion.marca}%`)
      .limit(1)
      .maybeSingle();
    if (data) return mergeSuggestionWithCatalog(suggestion, data);
  }
  
  // 3. Solo per nome (fuzzy)
  if (suggestion.nome) {
    const { data } = await supabase
      .from('products')
      .select('*')
      .ilike('nome', `%${suggestion.nome}%`)
      .limit(1)
      .maybeSingle();
    if (data) return mergeSuggestionWithCatalog(suggestion, data);
  }
  
  // 4. Nessun match in catalogo → restituisci solo suggestion AI
  return { ...suggestion, fromCatalog: false };
}

function mergeSuggestionWithCatalog(ai: Suggestion, catalog: Product): EnrichedSuggestion {
  return {
    ...ai,
    // Sovrascrivi con dati catalogo certi
    prezzoSuggerito: catalog.price ?? ai.prezzoSuggerito,
    descrizione: catalog.description ?? ai.descrizione,
    categoria: catalog.category ?? ai.categoria,
    codiceEan: catalog.ean ?? ai.codiceEan,
    marca: catalog.brand ?? ai.marca,
    fromCatalog: true,
    catalogId: catalog.id
  };
}
```

---

## 4. PIANO DI VALIDAZIONE FINALE (100+ FOTO REALI)

### 4.1 Dataset di Test

| Categoria | Prodotti | Foto per prodotto | Totale |
|-----------|----------|-------------------|--------|
| Alimentari confezionati | Nutella, Barilla, Mulino Bianco, Kinder, Rio Mare, Estathé | 4 (frontale, 45°, laterale, controluce) | 24 |
| Bevande | Coca-Cola 1.5L, San Benedetto 1.5L, Red Bull, Estathé | 4 | 16 |
| Cura casa | Dash, Finish, Viakal, Chanteclair | 3 | 12 |
| Cura persona | Nivea, Dove, Colgate, Oral-B | 3 | 12 |
| Snack | Kinder Bueno, Oreo, Pringles, Patatine San Carlo | 3 | 12 |
| **VARIABILI AMBIENTALI** | | | |
| Luce naturale (giorno) | 40% | — | — |
| Luce artificiale (LED casa) | 30% | — | — |
| Luce mista | 20% | — | — |
| Controluce / ombra | 10% | — | — |
| **ANGOLO** | | | |
| Frontale perfetto | 30% | — | — |
| 45° inclinato | 40% | — | — |
| Laterale 90° | 20% | — | — |
| Angolazione estrema (>60°) | 10% | — | — |
| **QUALITÀ** | | | |
| Fuoco perfetto | 60% | — | — |
| Leggero mosso | 25% | — | — |
| Forte mosso / sfocato | 15% | — | — |
| **TOTALE** | | | **≥ 100** |

### 4.2 Metriche di Valutazione

| Metrica | Target | Metodo |
|---------|--------|--------|
| **Accuratezza Nome** | ≥ 90% | Match esatto o Levenshtein ≤ 3 |
| **Accuratezza Marca** | ≥ 95% | Match esatto o Levenshtein ≤ 2 |
| **Accuratezza Categoria** | ≥ 95% | Match esatto su tassonomia fissa |
| **OCR EAN** | ≥ 80% | Match esatto 13 cifre |
| **OCR Testo Etichetta** | ≥ 85% | Contenuto chiave presente in descrizione |
| **Confidenza Calibrata** | ECE ≤ 0.10 | Expected Calibration Error |
| **Falso Positivo Rate** | ≤ 2% | Prodotto inesistente riconosciuto come esistente |
| **Falso Negativo Rate** | ≤ 5% | Prodotto reale non riconosciuto |

### 4.3 Metriche Temporali

| Fase | Target P50 | Target P95 | Target P99 |
|------|------------|------------|------------|
| Upload (client → edge) | ≤ 500ms | ≤ 1.5s | ≤ 3s |
| Preprocessing (Sharp) | ≤ 100ms | ≤ 200ms | ≤ 300ms |
| Cache Lookup | ≤ 50ms | ≤ 100ms | ≤ 150ms |
| Gemma 4 Inference | ≤ 800ms | ≤ 1.5s | ≤ 2.5s |
| Gemini Fallback | ≤ 1.5s | ≤ 2.5s | ≤ 4s |
| Cache Store | ≤ 50ms | ≤ 100ms | ≤ 200ms |
| Enrichment Catalog | ≤ 100ms | ≤ 200ms | ≤ 300ms |
| **TOTALE (cache miss, Gemma)** | **≤ 1.5s** | **≤ 2.5s** | **≤ 4s** |
| **TOTALE (cache hit)** | **≤ 300ms** | **≤ 500ms** | **≤ 800ms** |

### 4.4 Matrice di Test

| Test ID | Condizione | Modello Atteso | Fallback Atteso | Pass Criteria |
|---------|------------|----------------|-----------------|---------------|
| T001 | Nutella frontale, luce giorno | Gemma ≥85% | No | Nome=Marca=Categoria=EAN corretti |
| T002 | Nutella 45°, luce LED | Gemma ≥75% | Sì (Gemini) | Gemini recupera corretto |
| T003 | Nutella controluce | Gemma <65% | Sì (Gemini) | Gemini recupera corretto |
| T004 | Coca-Cola laterale, mosso | Gemma <65% | Sì | Entrambi falliscono → lowConfidence=true |
| T005 | Barilla frontale, luce giorno | Gemma ≥85% | No | Tutto corretto |
| T006 | Barilla 45°, ombra | Gemma 70% | Sì | Gemini recupera |
| T007 | Dash etichetta rovinata | Gemma 50% | Sì | Gemini OCR recupera EAN |
| T008 | Kinder Bueno 45°, luce mista | Gemma 80% | No | Tutto corretto |
| T009 | Estathé frontale, giorno | Gemma ≥85% | No | Tutto corretto |
| T010 | Rio Mare laterale, mosso | Gemma 60% | Sì | Gemini recupera |
| ... | ... | ... | ... | ... |
| T100 | Red Bull 90°, controluce | Gemma <50% | Sì | Entrambi falliscono → lowConfidence |

### 4.4 Report Finale di Validazione

Il report finale conterrà:

```
LOCALHUB VISION AI — VALIDATION REPORT v1.0
============================================

DATASET: 100 foto reali, 10 categorie, 10 brand
MODELLI TESTATI: Gemma 4 (primario), Gemini 2.5 Flash (fallback)

RISULTATI AGGREGATI:
├── Accuratezza Nome:      XX.X% (target ≥90%)
├── Accuratezza Marca:     XX.X% (target ≥95%)
├── Accuratezza Categoria: XX.X% (target ≥95%)
├── OCR EAN:               XX.X% (target ≥80%)
├── OCR Testo:             XX.X% (target ≥85%)
├── ECE (Calibration):     X.XX  (target ≤0.10)
├── False Positive Rate:   X.X%  (target ≤2%)
├── False Negative Rate:   X.X%  (target ≤5%)

TEMPI (P50 / P95 / P99):
├── Cache Hit:      XXXms / XXXms / XXXms  (target ≤300/500/800ms)
├── Gemma 4:        XXXms / XXXms / XXXms  (target ≤800/1500/2500ms)
├── Gemini Fallback: XXXms / XXXms / XXXms (target ≤1500/2500/4000ms)
└── Totale Miss:    XXXms / XXXms / XXXms  (target ≤1500/2500/4000ms)

FALLBACK STATISTICS:
├── Fallback Rate:        XX.X% (target 15-20%)
├── Fallback Success:     XX.X% (Gemini corregge Gemma)
├── Double Fail Rate:     X.X%  (entrambi sbagliano)

DECISIONE PRODUZIONE:  ☐ APPROVATO  ☐ CON RISERVE  ☐ RESPINTO
```

---

## 5. CHECKLIST PRONTA PRODUZIONE

### 5.1 Codice (Completato)
- [x] `vision-cache.ts` — Perceptual hash + Hamming ≤4 + Supabase cache
- [x] `route.ts` — Endpoint `/vision` con supporto `?model=gemma|gemini|moondream` e `?crop=1`
- [x] `providers/gemini.ts` — Funzione `callGeminiGeneration` pronta
- [ ] `providers/gemini.ts` — **DA FARE**: Classe `GeminiProvider` implements `VisionProvider`
- [ ] `vision-service.ts` — **DA FARE**: Integra `GeminiProvider` in `PROVIDER_CHAIN` dopo Cloudflare

### 5.2 Infrastruttura (Completato)
- [x] Tabella `product_vision_cache` su Supabase (migration 20260724)
- [x] Indici: hash (unique), name, brand, ean
- [x] RLS policies: public read/insert/update
- [x] Trigger `updated_at` automatico

### 5.3 Configurazione (Da fare)
- [ ] `.env` produzione: `GEMINI_MODEL=gemini-2.0-flash-lite-001`
- [ ] `.env` produzione: `GEMINI_FALLBACK_MODEL=gemini-flash-lite-latest`
- [ ] `.env` produzione: `GEMINI_API_KEY` (già presente)
- [ ] `.env` produzione: `GROQ_API_KEY` (opzionale, per futuro)
- [ ] `.env` produzione: `MISTRAL_API_KEY` (opzionale, fallback futuro)

### 5.4 Monitoraggio Produzione (Da implementare)

```typescript
// Metriche da loggare per ogni richiesta
interface VisionMetrics {
  requestId: string;
  model: 'gemma' | 'gemini' | 'gemini-fallback';
  cached: boolean;
  cacheDistance?: number;      // Hamming distance se hit
  totalMs: number;
  uploadMs: number;
  preprocessMs: number;
  aiMs: number;                // Gemma o Gemini
  parseMs: number;
  enrichMs: number;
  totalMs: number;
  confidence: number;
  fallbackUsed: boolean;
  fallbackReason?: 'low_confidence' | 'error' | 'timeout';
  success: boolean;
  errorCode?: string;
}
```

### 5.5 Alerting Soglie

| Metrica | Warning | Critical |
|---------|---------|----------|
| P95 Total Time | > 3s | > 5s |
| Fallback Rate | > 30% | > 50% |
| Double Fail Rate | > 5% | > 10% |
| Cache Hit Rate | < 60% | < 40% |
| Error Rate (5xx) | > 1% | > 5% |
| Avg Confidence | < 70% | < 60% |

---

## 6. APPROVAZIONE E PROSSIMI PASSI

### Decisione Architetturale
> **APPROVATA**: Gemma 4 come provider primario, Gemini 2.5 Flash/Flash-Lite come fallback intelligente, cache percettiva attiva, enrichment catalogo Supabase.

### Prossimi Step (Ordinati)

| Step | Attività | Owner | Stima | Dipendenze |
|------|----------|-------|-------|------------|
| 1 | Implementare `GeminiProvider` class | Dev | 2h | `providers/base.ts`, `providers/utils.ts` |
| 2 | Integrare `GeminiProvider` in `vision-service.ts` | Dev | 1h | Step 1 |
| 3 | Test `?model=gemini` endpoint locale | Dev/QA | 1h | Step 2 |
| 4 | Deploy staging + test 20 foto reali | Dev/QA | 4h | Step 3 |
| 5 | Benchmark 100 foto reali (piano §4) | QA | 8h | Step 4 |
| 6 | Analisi report validazione (§4.4) | Tech Lead | 2h | Step 5 |
| 7. | **GO/NO-GO Produzione** | Tech Lead + PM | 1h | Step 6 |
| 8 | Deploy produzione + monitoraggio | DevOps | 1h | Step 7 |
| 9 | Documentazione runbook ops | DevOps | 2h | Step 8 |

---

## 7. ALLEGATO: PROMPT DEFINITIVI

### A.1 Gemma 4 (Primario)
```
Riconosci il prodotto nella foto. Restituisci SOLO JSON senza spiegazioni:
{
  "nome": "nome prodotto (max 80 caratteri)",
  "categoria": "categoria merceologica (es: Alimentari, Abbigliamento, Beauty, Casa, Elettronica, Sport)",
  "marca": "marca o null se non riconoscibile",
  "prezzo_suggerito": prezzo in euro o null,
  "descrizione": "descrivi in max 25 parole",
  "confidenza": 0-100
}
Regole: non inventare. confidenza onesta.
```

### A.2 Gemini 2.5 Flash (Fallback)
```
Analizza l'immagine del prodotto. Restituisci JSON:
{
  "nome": "nome esatto prodotto",
  "marca": "marca/produttore",
  "categoria": "categoria",
  "codiceEan": "EAN-13 se leggibile o null",
  "descrizione": "descrizione breve",
  "prezzoSuggerito": numero o null,
  "confidenza": 0-100
}
Usa OCR per leggere testi, codici a barre, etichette. Non inventare.
```

### A.3 Arricchimento Catalogo (Post-processing)
```json
// Input: suggestion AI + record catalogo Supabase
// Output: suggestion arricchita con dati certi da catalogo
{
  ...suggestion,
  "prezzoSuggerito": catalog.price ?? suggestion.prezzoSuggerito,
  "descrizione": catalog.description ?? suggestion.descrizione,
  "categoria": catalog.category ?? suggestion.categoria,
  "codiceEan": catalog.ean ?? suggestion.codiceEan,
  "marca": catalog.brand ?? suggestion.marca,
  "fromCatalog": true,
  "catalogId": catalog.id
}
```

---

## 8. FIRME E APPROVAZIONE

| Ruolo | Nome | Data | Firma |
|-------|------|------|-------|
| Tech Lead | | | |
| Product Manager | | | |
| DevOps Lead | | | |
| QA Lead | | | |

---

**Documento versione 1.0 — Approvato per implementazione produzione LocalHub Vision AI**
**Data: Luglio 2026 — Prossima revisione: Post-deployment (30 giorni)**