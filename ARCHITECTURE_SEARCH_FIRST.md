# Search-First AI-Last Architecture

## Executive Summary

Enterprise-grade visual search pipeline resolving >95% queries without AI inference through multi-layered fingerprint matching, vector search, and continuous learning.

---

## 1. Pipeline Overview

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐     ┌─────────────────┐
│  ACQUISITION │────▶│ PREPROCESSING │────▶│ FINGERPRINT EXTRACT │────▶│  LOCAL SEARCH   │
│  (Image In)  │     │ (Normalize)   │     │ (pHash, Embed, OCR, │     │ (Multi-Index)   │
└─────────────┘     └──────────────┘     │  Barcode, Features) │     └────────┬────────┘
                                          └────────────────────┘              │
                                                                              ▼
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐     ┌─────────────────┐
│  AI FALLBACK │◀───│ THRESHOLD    │◀───│ SCORING & RANKING  │◀───│ VECTOR SEARCH   │
│ (Gemini/     │     │ CHECK        │     │ (Multi-signal)     │     │ + CATALOG MATCH │
│  Gemma)      │     │              │     └────────────────────┘     └─────────────────┘
└─────────────┘     └──────────────┘
        │
        ▼
┌─────────────────┐
│ FEEDBACK LOOP   │
│ (Auto-DB Update)│
└─────────────────┘
```

---

## 2. Stage Specifications

### 2.1 Acquisition (`acquisition/`)

**Input**: Raw image (File, Blob, Buffer, URL, base64)
**Output**: `AcquiredImage` - normalized, validated, metadata-enriched

```typescript
interface AcquiredImage {
  id: string;                    // ULID
  buffer: Buffer;                // Normalized: JPEG 85%, max 2048px
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  size: number;
  source: 'camera' | 'upload' | 'url' | 'clipboard';
  capturedAt: Date;
  exif?: ExifData;
  hash: string;                  // SHA-256 for deduplication
}
```

**Operations**:
- Format normalization (HEIC→JPEG, PNG→JPEG, WebP→JPEG)
- Downscale to max 2048px (preserve aspect)
- Strip EXIF (privacy) but preserve orientation
- SHA-256 deduplication check against recent duplicates cache (Redis/Memory)
- Generate ULID for traceability

---

### 2.2 Preprocessing (`preprocessing/`)

**Input**: `AcquiredImage`
**Output**: `PreprocessedImage` - multiple variants for different extractors

```typescript
interface PreprocessedImage {
  original: AcquiredImage;
  variants: {
    fingerprint: Buffer;      // 256x256 grayscale - pHash, features
    embedding: Buffer;        // 224x224 RGB - CLIP/DINOv2 input
    ocr: Buffer;              // 1024px max, high contrast - Tesseract
    barcode: Buffer;          // 512x516 grayscale - ZXing
    thumbnail: Buffer;        // 320x320 - UI preview
  };
  orientationCorrected: boolean;
  qualityScore: number;       // 0-1 (blur, exposure, compression)
}
```

**Operations**:
- Orientation correction (EXIF)
- Quality assessment (Laplacian variance, BRISQUE)
- Multi-variant generation (single decode, multi-encode)
- Reject if quality < 0.3 (return error to client)

---

### 2.3 Fingerprint Extraction (`fingerprint/`)

**Parallel extraction** - all run concurrently on respective variants.

#### 2.3.1 Perceptual Hash (pHash)
```typescript
interface PHashResult {
  hash64: bigint;           // 64-bit DCT pHash
  hash256: Buffer;          // 256-bit for Hamming distance tiers
  algorithm: 'dct' | 'wavelet';
}
```
- Hamming distance tiers: ≤8 (identical), 9-16 (near-duplicate), 17-32 (similar)

#### 2.3.2 Visual Embedding
```typescript
interface EmbeddingResult {
  vector: Float32Array;     // 512-dim (DINOv2-S/14) or 768 (CLIP-ViT-B/32)
  model: 'dinov2' | 'clip';
  dimension: number;
  l2Normalized: true;
}
```
- ONNX Runtime (CPU) or TensorRT (GPU)
- Batch inference for throughput

#### 2.3.3 OCR
```typescript
interface OCRResult {
  text: string;             // Full extracted text
  blocks: OCRBlock[];       // With bbox, confidence
  language: string;         // Detected
  productCodes: string[];   // Regex: EAN13, UPC, ISBN, SKU patterns
}
```
- Tesseract + custom product code regex
- Confidence threshold: 0.7

#### 2.3.4 Barcode/QR
```typescript
interface BarcodeResult {
  format: 'EAN13' | 'EAN8' | 'UPC_A' | 'UPC_E' | 'CODE128' | 'QR' | 'DATAMATRIX';
  value: string;
  confidence: number;
  bbox: Box;
}
```
- ZXing (JavaScript port) or native via WASM

#### 2.3.5 Visual Features (ORB/SIFT)
```typescript
interface FeatureResult {
  keypoints: Keypoint[];    // x, y, scale, orientation, response
  descriptors: Buffer;      // Binary descriptors (ORB: 32 bytes each)
  count: number;
}
```
- OpenCV.js (WASM) for keypoint matching
- Used for geometric verification

#### 2.3.6 Color Histogram
```typescript
interface ColorHistogram {
  hsv: Float32Array;        // 50 bins (H:30, S:10, V:10)
  dominant: RGB[];          // Top 5 colors
  palette: RGB[];           // K-means 8 colors
}
```

---

### 2.4 Local Multi-Index Search (`search/`)

**All indices queried in parallel**. Results merged by candidate ID.

#### Index 1: pHash Index (LSH + BK-Tree)
- **Structure**: LSH buckets (16-bit prefixes) → BK-Tree per bucket
- **Query**: Hamming distance ≤16
- **Latency**: <5ms
- **Recall**: Near-duplicates, crops, edits

#### Index 2: Vector Index (HNSW)
- **Structure**: HNSW (M=16, efConstruction=200, efSearch=128)
- **Space**: Cosine similarity
- **Query**: Top-K (default 50)
- **Latency**: <15ms for 10M vectors
- **Recall**: Visual similarity, category-level

#### Index 3: OCR/Barcode Inverted Index
- **Structure**: Trie + Posting lists (Roaring Bitmaps)
- **Query**: Exact + fuzzy (Levenshtein ≤2) on product codes
- **Latency**: <3ms
- **Recall**: Exact product matches via codes

#### Index 4: Feature Index (Inverted File + Geometric Verification)
- **Structure**: Visual vocabulary (K=1M) → Inverted lists → RANSAC verification
- **Query**: Top-K candidates → Geometric verification
- **Latency**: <20ms
- **Recall**: Instance-level, viewpoint changes

#### Index 5: Color Histogram (L1/L2 Distance)
- **Structure**: VP-Tree or Annoy
- **Query**: Top-K by histogram distance
- **Latency**: <2ms
- **Recall**: Color-based filtering

---

### 2.5 Product Catalog Matching (`catalog/`)

**Input**: Candidate product IDs from search indices
**Output**: Enriched candidates with catalog data

```typescript
interface ProductCandidate {
  productId: string;
  sku: string;
  name: string;
  brand: string;
  category: CategoryPath;
  images: ProductImage[];      // Canonical + variants
  price: PriceInfo;
  availability: Availability;
  attributes: Record<string, string>;  // Color, size, material...
  embeddings: Float32Array[];  // Pre-computed catalog embeddings
  fingerprints: ProductFingerprints;
  matchSignals: MatchSignals;  // Per-index scores
}
```

**Matching Logic**:
1. Retrieve candidate products (union of all index results)
2. Fetch full catalog records (batched, cached)
3. Compute cross-index signal agreement
4. Geometric verification for feature matches
5. Attribute consistency check (color, category)

---

### 2.6 Scoring & Ranking (`ranking/`)

**Multi-signal fusion** with learned weights.

```typescript
interface MatchSignals {
  pHash: { distance: number; score: number };        // 0-1
  vector: { cosine: number; score: number };         // 0-1
  ocr: { exact: boolean; fuzzyScore: number };       // 0-1
  barcode: { matched: boolean; format: string };     // 0/1
  features: { inliers: number; homography: boolean }; // 0-1
  color: { distance: number; score: number };        // 0-1
  catalog: { categoryMatch: boolean; attrMatch: number }; // 0-1
}

interface RankedResult {
  candidate: ProductCandidate;
  signals: MatchSignals;
  finalScore: number;          // 0-1 weighted fusion
  tier: 'exact' | 'high' | 'medium' | 'low' | 'none';
  explanation: string;         // Human-readable
}
```

**Fusion Formula**:
```
finalScore = Σ(w_i * signal_i) + bonus(agreement)

Weights (learned, defaults):
  w_barcode    = 0.35  (if present)
  w_ocr_exact  = 0.25  (if product code found)
  w_pHash      = 0.15
  w_vector     = 0.15
  w_features   = 0.10
  w_color      = 0.05
  w_catalog    = 0.05

Agreement Bonus: +0.1 per additional signal > 0.8
```

**Thresholds**:
- `EXACT`    : ≥0.95 → Return immediately (no AI)
- `HIGH`     : ≥0.80 → Return with confidence
- `MEDIUM`   : ≥0.60 → Return with "verify" flag
- `LOW`      : ≥0.40 → Queue for AI fallback
- `NONE`     : <0.40  → AI fallback required

---

### 2.7 AI Fallback (`ai-fallback/`)

**Only invoked when**: `max(finalScore) < THRESHOLD_AI` (default 0.60)

```typescript
interface AIFallbackRequest {
  image: AcquiredImage;
  topCandidates: RankedResult[];  // Top 5 for context
  signals: MatchSignals;
  task: 'identify' | 'classify' | 'attribute_extract';
}

interface AIResult {
  prediction: ProductPrediction | CategoryPrediction;
  confidence: number;       // 0-1
  reasoning: string;
  model: 'gemini-2.5-flash' | 'gemma-3-27b' | 'local-llava';
  latencyMs: number;
  costUsd: number;
}
```

**Model Selection**:
| Scenario | Model | Reason |
|----------|-------|--------|
| High-res, complex | Gemini 2.5 Flash | Best accuracy |
| Low-res, simple | Gemma 3 27B (local) | Zero cost, privacy |
| Batch/offline | Local LLaVA | Throughput |
| Attributes only | Specialist small model | Speed |

**Post-AI**:
- If AI confidence ≥0.85: Accept, create new fingerprint records
- If AI confidence 0.6-0.85: Return with "AI suggested" flag
- If AI confidence <0.6: Return "unknown", log for review

---

### 2.8 Feedback Loop & Auto-DB Update (`feedback/`)

**Automatic enrichment** after every successful identification.

```typescript
interface FeedbackEvent {
  queryId: string;
  imageHash: string;
  result: RankedResult | AIResult;
  userAction: 'accepted' | 'rejected' | 'corrected' | 'ignored';
  correction?: ProductId;
  timestamp: Date;
}
```

**Auto-Update Rules**:
1. **User Accepted + High Confidence** (≥0.9):
   - Add image as new variant to product
   - Extract & store all fingerprints
   - Update embedding centroid (running average)

2. **User Corrected**:
   - Add to corrected product
   - Add negative example to original product
   - Trigger re-ranking weight adjustment

3. **AI Fallback Used + High Confidence** (≥0.85):
   - Create new product entry if novel
   - Store all fingerprints
   - Flag for human review if novel category

4. **Periodic Batch Jobs**:
   - Re-cluster embeddings (k-means per category)
   - Recompute pHash centroids
   - Prune stale/low-quality fingerprints
   - Retrain fusion weights (monthly)

---

## 3. Data Models

### 3.1 Core Entities

```sql
-- Products (Catalog)
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku             VARCHAR(100) UNIQUE NOT NULL,
  name            VARCHAR(500) NOT NULL,
  brand_id        UUID REFERENCES brands(id),
  category_id     UUID REFERENCES categories(id),
  attributes      JSONB NOT NULL DEFAULT '{}',
  canonical_image UUID REFERENCES product_images(id),
  status          VARCHAR(20) DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Product Images (Variants)
CREATE TABLE product_images (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id),
  url             VARCHAR(1000) NOT NULL,
  phash64         BIGINT NOT NULL,
  phash256        BYTEA NOT NULL,
  embedding_dinov2 VECTOR(512),
  embedding_clip   VECTOR(768),
  ocr_text        TEXT,
  barcode_value   VARCHAR(100),
  barcode_format  VARCHAR(20),
  color_hist      VECTOR(50),
  feature_descriptors BYTEA,      -- Compressed ORB
  quality_score   REAL,
  is_canonical    BOOLEAN DEFAULT false,
  source          VARCHAR(50),    -- 'catalog', 'user', 'ai_generated'
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Fingerprint Indices (Materialized for speed)
CREATE INDEX idx_phash_lsh ON product_images USING hash (phash64 >> 48);  -- 16-bit prefix
CREATE INDEX idx_embedding_dinov2 ON product_images USING hnsw (embedding_dinov2 vector_cosine_ops);
CREATE INDEX idx_embedding_clip ON product_images USING hnsw (embedding_clip vector_cosine_ops);
CREATE INDEX idx_barcode ON product_images (barcode_value) WHERE barcode_value IS NOT NULL;
CREATE INDEX idx_ocr_gin ON product_images USING gin (to_tsvector('simple', ocr_text));

-- Query Log (Analytics + Training)
CREATE TABLE query_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash      CHAR(64) NOT NULL,           -- SHA-256 of image
  image_phash64   BIGINT,
  top_candidate   UUID REFERENCES products(id),
  final_score     REAL,
  tier            VARCHAR(20),
  ai_used         BOOLEAN DEFAULT false,
  ai_model        VARCHAR(50),
  ai_confidence   REAL,
  user_action     VARCHAR(20),
  correction      UUID REFERENCES products(id),
  latency_ms      INTEGER,
  created_at      TIMESTAMPTZ DEFAULT now()
);

PARTITION BY RANGE (created_at);  -- Monthly partitions
```

### 3.2 Redis Caches

```redis
# Recent query deduplication (TTL 24h)
recent:queries:{sha256} → {queryId, result, timestamp}

# Embedding centroid cache (per product, updated async)
catalog:centroid:{productId}:dinov2 → Float32Array[512]
catalog:centroid:{productId}:clip   → Float32Array[768]

# pHash buckets for fast candidate retrieval
phash:bucket:{16bit_prefix} → [productImageId...]

# Rate limiting
ratelimit:{ip}:minute → count
ratelimit:{ip}:hour   → count
```

---

## 4. Infrastructure & Scaling

### 4.1 Service Topology

```
┌─────────────────────────────────────────────────────────────────┐
                        API GATEWAY (Kong/Envoy)
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  ACQUISITION  │     │  PREPROCESSING │     │  FINGERPRINT  │
│   SERVICE     │     │   SERVICE      │     │   SERVICE     │
│  (Stateless)  │     │  (Stateless)   │     │  (GPU Pool)   │
│  xN replicas  │     │  xN replicas   │     │  xM replicas  │
└───────┬───────┘     └───────┬───────┘     └───────┬───────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
                    SEARCH COORDINATOR (Stateless)
                    Parallel fan-out to indices
└─────────────────────────────────────────────────────────────────┘
        │           │           │           │           │
        ▼           ▼           ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ pHash    │ │ Vector   │ │ OCR/     │ │ Feature  │ │ Color    │
│ Index    │ │ Index    │ │ Barcode  │ │ Index    │ │ Index    │
│ (Redis + │ │ (pgvector│ │ (Redis + │ │ (Redis + │ │ (Redis)  │
│  PG)     │ │  HNSW)   │ │  PG)     │ │  PG)     │ │          │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
                      CATALOG SERVICE (Read Replicas)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
                      RANKING SERVICE (Stateless)
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
      ┌───────────────┐              ┌───────────────┐
      │ THRESHOLD ≥.6 │              │ THRESHOLD <.6 │
      │ RETURN RESULT │              │ AI FALLBACK   │
      └───────────────┘              └───────┬───────┘
                                             │
                                             ▼
                                    ┌───────────────┐
                                    │ FEEDBACK LOOP │
                                    │ (Async Queue) │
                                    └───────────────┘
```

### 4.2 Capacity Planning (10M Products, 100M Images)

| Component | Spec | Est. Cost/Month |
|-----------|------|-----------------|
| API Gateway | 3x c6i.xlarge | $500 |
| Acquisition/Preprocess | 10x c6i.2xlarge | $2,500 |
| Fingerprint (GPU) | 8x g5.2xlarge (A10G) | $6,000 |
| Search Coordinator | 6x c6i.xlarge | $1,000 |
| pHash Index (Redis) | 3x r6g.2xlarge (50GB) | $1,200 |
| Vector Index (pgvector) | 3x r6g.4xlarge (128GB) | $3,500 |
| OCR/Barcode Index | 2x r6g.xlarge | $400 |
| Feature Index | 3x r6g.2xlarge | $1,200 |
| Catalog (Aurora PG) | 1 writer + 3 readers (db.r6g.2xlarge) | $2,800 |
| AI Fallback (GPU) | 4x g5.xlarge (burst) | $1,500 |
| Feedback/Async | 3x c6i.large + SQS | $300 |
| **Total** | | **~$20,900/mo** |

**Query Latency Budget (P99)**:
- Acquisition + Preprocess: 50ms
- Fingerprint Extraction: 120ms (parallel)
- Multi-Index Search: 40ms
- Catalog Fetch: 20ms
- Ranking: 10ms
- **Total (no AI): ~240ms P99**
- AI Fallback: +800-2000ms

---

## 5. API Contract

### 5.1 Visual Search Endpoint

```typescript
POST /api/v1/search/visual

Request:
{
  "image": "base64..." | { "url": "..." } | { "fileId": "..." },
  "options": {
    "maxResults": 20,           // default 20
    "threshold": "auto",        // 'exact'|'high'|'medium'|'low'|'auto'
    "includeAI": false,         // force AI even if threshold met
    "filters": {
      "categoryId": "uuid",
      "brandId": "uuid",
      "priceRange": { "min": 0, "max": 1000 },
      "inStock": true
    },
    "returnExplanations": true
  }
}

Response (200):
{
  "queryId": "ulid",
  "results": [
    {
      "product": { ... },
      "score": 0.97,
      "tier": "exact",
      "matchedImage": { "url": "...", "variantId": "uuid" },
      "signals": { "pHash": 0.99, "vector": 0.92, "barcode": 1.0, ... },
      "explanation": "Exact barcode match (EAN13: 8001234567890), pHash distance 3"
    }
  ],
  "aiUsed": false,
  "latencyMs": 187,
  "timestamp": "2026-07-25T10:30:00Z"
}

Response (200) - AI Fallback:
{
  "queryId": "ulid",
  "results": [...],  // May be empty or low-confidence
  "aiUsed": true,
  "aiResult": {
    "prediction": { "productId": "uuid", "confidence": 0.91 },
    "model": "gemini-2.5-flash",
    "reasoning": "Matches visual pattern of Nike Air Max 270, colorway 'Triple White'"
  },
  "latencyMs": 1240
}
```

### 5.2 Feedback Endpoint

```typescript
POST /api/v1/search/feedback

Request:
{
  "queryId": "ulid",
  "action": "accepted" | "rejected" | "corrected",
  "correctionProductId": "uuid"  // required if action=corrected
}

Response (202): { "accepted": true }
```

---

## 6. Implementation Roadmap

### Phase 1: Core Pipeline (Weeks 1-4)
- [ ] Acquisition & Preprocessing service
- [ ] Fingerprint extractors (pHash, DINOv2, OCR, Barcode, ORB, Color)
- [ ] PostgreSQL + pgvector schema + indices
- [ ] Search coordinator with parallel index queries
- [ ] Basic ranking + threshold logic
- [ ] API endpoint + contract tests

### Phase 2: Production Hardening (Weeks 5-8)
- [ ] Redis caching layer (pHash buckets, centroids, dedup)
- [ ] HNSW index tuning + partitioning
- [ ] Feature index with geometric verification
- [ ] AI fallback integration (Gemini + local Gemma)
- [ ] Feedback loop + async queue (BullMQ/Redis)
- [ ] Observability (traces, metrics, logs)

### Phase 3: Scale & Optimize (Weeks 9-12)
- [ ] Load testing + bottleneck elimination
- [ ] Learned fusion weights (XGBoost/LightGBM)
- [ ] Embedding quantization (PQ/OPQ) for memory
- [ ] Multi-region deployment
- [ ] A/B testing framework for thresholds
- [ ] Automated retraining pipeline

### Phase 4: Enterprise Features (Weeks 13-16)
- [ ] Tenant isolation + RBAC
- [ ] Custom catalog ingestion pipeline
- [ ] Real-time index updates (CDC from catalog)
- [ ] Advanced analytics dashboard
- [ ] SLA monitoring + alerting
- [ ] Disaster recovery + backup

---

## 7. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Multi-index parallel search** | No single fingerprint covers all cases; union maximizes recall |
| **pHash LSH + BK-Tree** | Sub-linear exact/near-duplicate search at scale |
| **HNSW on pgvector** | Native PG, no separate vector DB, ACID, hybrid queries |
| **ONNX Runtime for embeddings** | Vendor-neutral, CPU/GPU, no Python dependency |
| **Threshold-based AI gating** | Hard cost/latency control, measurable ROI |
| **Async feedback loop** | Non-blocking, eventual consistency, batch optimization |
| **ULID for traceability** | Sortable, distributed, no coordination |
| **Monthly query_log partitions** | Efficient time-range analytics, easy retention |

---

## 8. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **No-AI Resolution Rate** | >95% | `1 - (ai_fallback_count / total_queries)` |
| **P99 Latency (no AI)** | <300ms | End-to-end trace |
| **P99 Latency (with AI)** | <2.5s | End-to-end trace |
| **Top-1 Accuracy** | >92% | Human eval on sampled queries |
| **Top-5 Accuracy** | >97% | Human eval on sampled queries |
| **Index Freshness** | <5min | `max(created_at) - now()` for new products |
| **False Positive Rate** | <2% | User rejection rate on tier≥high |
| **Cost per 1M queries** | <$50 | Infrastructure + AI API costs |

---

*Architecture Version: 1.0*  
*Author: Search-First AI-Last Design*  
*Date: 2026-07-25*