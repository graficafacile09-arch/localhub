# Product Profile Architecture: Search-First AI-Last

## Core Philosophy

**Products have identities. Images are just observations.**

Every product in the catalog accumulates a rich **ProductProfile** over time. Every query image generates a **QueryProfile**. Matching happens at the profile level using deterministic multi-layer scoring. AI only resolves ambiguity.

---

## 1. ProductProfile (The Product's Identity)

```typescript
interface ProductProfile {
  // Immutable identifiers
  productId: string;
  sku: string;
  
  // === DETERMINISTIC LAYER (exact matches) ===
  barcodes: BarcodeProfile;           // EAN13, UPC, QR, DataMatrix
  productCodes: OCRProfile;           // SKU, model numbers, batch codes
  
  // === PROBABILISTIC LAYER (similarity matches) ===
  visual: VisualProfile;              // pHash, embeddings, color, features
  packaging: PackagingProfile;        // Shape, material, logo, layout
  
  // === SEMANTIC LAYER (category/attribute consistency) ===
  semantics: SemanticProfile;         // Category, brand, attributes
  
  // === TEMPORAL LAYER (learning history) ===
  history: CorrectionHistory;         // User corrections, feedback
  
  // === METADATA ===
  canonicalImages: ImageRef[];        // Best representative images
  variantImages: ImageRef[];          // Angles, colors, packaging variants
  confidence: number;                 // 0-1, profile maturity
  lastUpdated: Date;
  version: number;
}

interface BarcodeProfile {
  primary: string | null;             // Main EAN13/UPC
  variants: string[];                 // All seen barcodes
  formats: BarcodeFormat[];           // EAN13, QR, DataMatrix...
  confidence: number;                 // How reliable is barcode match
}

interface OCRProfile {
  codes: Map<string, OCRCodeEntry>;   // code -> {count, confidence, locations}
  patterns: RegExp[];                 // Learned regex for this product
  languages: string[];                // Detected languages
}

interface VisualProfile {
  pHash: PHashProfile;                // Perceptual hashes with centroids
  embeddings: EmbeddingProfile;       // DINOv2, CLIP centroids + covariance
  color: ColorProfile;                // HSV histograms, dominant palettes
  features: FeatureProfile;           // ORB/SIFT keypoints, geometric layout
}

interface PackagingProfile {
  shape: ShapeDescriptor;             // Box, bottle, can, bag, blister...
  logo: LogoProfile;                  // Brand logo embeddings + positions
  layout: LayoutProfile;              // Text zones, graphic zones, whitespace
  material: MaterialHint;             // Glossy, matte, metallic, cardboard...
}

interface SemanticProfile {
  categoryPath: string[];             // [Electronics, Phones, Smartphones]
  brand: BrandProfile;                // Brand name, logo, typography
  attributes: AttributeProfile;       // Color, size, flavor, variant...
  priceRange: [number, number];       // Min/max observed prices
}

interface CorrectionHistory {
  totalQueries: number;
  accepted: number;
  rejected: number;
  corrected: CorrectionEntry[];       // {fromQuery, toProductId, timestamp}
  falsePositives: string[];           // Product IDs often confused with this
  falseNegatives: string[];           // Queries that should match but didn't
}

interface ImageRef {
  id: string;
  url: string;
  phash64: bigint;
  embedding: Float32Array;
  quality: number;
  variantType: 'canonical' | 'angle' | 'color' | 'packaging' | 'context';
  source: 'catalog' | 'user' | 'ai' | 'correction';
  addedAt: Date;
}
```

---

## 2. QueryProfile (The Observation's Identity)

```typescript
interface QueryProfile {
  queryId: string;
  timestamp: Date;
  
  // Mirrors ProductProfile structure exactly
  barcodes: BarcodeObservation;
  productCodes: OCRObservation;
  visual: VisualObservation;
  packaging: PackagingObservation;
  semantics: SemanticObservation;
  
  // Quality gates
  quality: QualityMetrics;
  completeness: number;  // 0-1, how many layers extracted successfully
}

interface BarcodeObservation {
  detected: BarcodeDetection[];
  primary: string | null;
  confidence: number;
}

interface OCRObservation {
  fullText: string;
  codes: OCRCodeMatch[];      // Matched against known patterns
  blocks: TextBlock[];
  confidence: number;
}

interface VisualObservation {
  pHash: bigint;
  embeddings: { dinov2: Float32Array; clip: Float32Array };
  colorHist: Float32Array;
  dominantColors: RGB[];
  features: FeatureObservation;
}

interface PackagingObservation {
  shape: ShapeDescriptor;
  logoDetections: LogoDetection[];
  layout: LayoutObservation;
}

interface SemanticObservation {
  predictedCategory: CategoryPrediction;
  predictedBrand: BrandPrediction;
  predictedAttributes: AttributePrediction;
}
```

---

## 3. Multi-Layer Scoring (The Matching Engine)

```typescript
class MultiLayerScorer {
  // Layer 1: DETERMINISTIC (exact, binary, instant)
  // If ANY passes threshold → MATCH, stop, no AI
  scoreDeterministic(query: QueryProfile, product: ProductProfile): DeterministicScore {
    const scores = {
      barcode: this.scoreBarcode(query.barcodes, product.barcodes),      // 1.0 or 0
      productCode: this.scoreProductCode(query.productCodes, product.productCodes), // 1.0 or 0
      exactOCR: this.scoreExactOCR(query.productCodes, product.productCodes),       // 1.0 or 0
    };
    
    const maxScore = Math.max(...Object.values(scores));
    const matchedLayer = Object.entries(scores).find(([_, v]) => v >= 0.99)?.[0];
    
    return { maxScore, matchedLayer, scores, isMatch: maxScore >= 0.99 };
  }

  // Layer 2: PROBABILISTIC (similarity, weighted fusion)
  // Runs only if Layer 1 returns no match
  scoreProbabilistic(query: QueryProfile, product: ProductProfile): ProbabilisticScore {
    const signals = {
      // Visual similarity (0-1 each)
      pHash: this.scorePHash(query.visual.pHash, product.visual.pHash),
      embedding: this.scoreEmbedding(query.visual.embeddings, product.visual.embeddings),
      color: this.scoreColor(query.visual.colorHist, product.visual.color),
      features: this.scoreFeatures(query.visual.features, product.visual.features),
      
      // Packaging similarity
      shape: this.scoreShape(query.packaging.shape, product.packaging.shape),
      logo: this.scoreLogo(query.packaging.logoDetections, product.packaging.logo),
      layout: this.scoreLayout(query.packaging.layout, product.packaging.layout),
      
      // Semantic consistency (0-1)
      category: this.scoreCategory(query.semantics.predictedCategory, product.semantics.categoryPath),
      brand: this.scoreBrand(query.semantics.predictedBrand, product.semantics.brand),
      attributes: this.scoreAttributes(query.semantics.predictedAttributes, product.semantics.attributes),
    };
    
    // Learned weights, updated via feedback loop
    const weights = this.getLearnedWeights();
    const fusedScore = this.fuseSignals(signals, weights);
    
    // Agreement bonus: multiple strong signals = higher confidence
    const agreementBonus = this.computeAgreementBonus(signals);
    
    return { fusedScore, signals, agreementBonus, finalScore: fusedScore + agreementBonus };
  }

  // Layer 3: AMBIGUITY RESOLUTION (AI)
  // Runs only if Layer 2 score < threshold AND top candidates are close
  async resolveAmbiguity(
    query: QueryProfile, 
    topCandidates: ScoredCandidate[]
  ): Promise<AIResolution> {
    // Only if: topScore < 0.75 AND (topScore - secondScore) < 0.15
    const isAmbiguous = topCandidates[0].score < 0.75 && 
                       (topCandidates[0].score - topCandidates[1].score) < 0.15;
    
    if (!isAmbiguous) return { resolved: false, reason: 'not_ambiguous' };
    
    return this.aiDisambiguate(query, topCandidates.slice(0, 3));
  }
}
```

---

## 4. Scoring Thresholds & Decision Flow

```
QUERY PROFILE
      │
      ▼
┌─────────────────────────────────────┐
│ LAYER 1: DETERMINISTIC              │
│ • Barcode exact match → 1.0         │
│ • Product code exact → 1.0          │
│ • OCR exact match → 1.0             │
└─────────────────────────────────────┘
      │ MATCH (score ≥ 0.99)
      ▼
   RETURN PRODUCT (confidence: exact)
      │
      │ NO MATCH
      ▼
┌─────────────────────────────────────┐
│ LAYER 2: PROBABILISTIC              │
│ • Fused similarity (learned weights)│
│ • Agreement bonus                   │
│ • Category/brand consistency        │
└─────────────────────────────────────┘
      │ HIGH (score ≥ 0.85)
      ▼
   RETURN PRODUCT (confidence: high)
      │
      │ MEDIUM (0.65 ≤ score < 0.85)
      ▼
   RETURN PRODUCT (confidence: medium, flag for review)
      │
      │ LOW (0.45 ≤ score < 0.65)
      ▼
┌─────────────────────────────────────┐
│ LAYER 3: AMBIGUITY CHECK            │
│ If top candidates are close → AI    │
└─────────────────────────────────────┘
      │ AMBIGUOUS
      ▼
   AI DISAMBIGUATION
      │
      ▼
   RETURN AI RESULT (confidence: ai_assisted)
      │
      │ NOT AMBIGUOUS / NO CANDIDATES
      ▼
   RETURN "UNKNOWN" (queue for manual review)
```

---

## 5. Continuous Learning (Profile Evolution)

```typescript
class ProfileUpdater {
  // Called after EVERY user interaction
  async updateProfiles(feedback: FeedbackEvent): Promise<void> {
    const { queryId, queryProfile, action, correction } = feedback;
    
    switch (action) {
      case 'accepted':
        await this.reinforceMatch(queryProfile, correction || queryProfile.topMatch);
        break;
      case 'corrected':
        await this.correctMatch(queryProfile, correction);
        break;
      case 'rejected':
        await this.weakenMatch(queryProfile, queryProfile.topMatch);
        break;
    }
    
    await this.recomputeWeights();
  }

  // Positive reinforcement: add observation to product profile
  private async reinforceMatch(query: QueryProfile, productId: string): Promise<void> {
    const product = await this.loadProductProfile(productId);
    
    // Add new image variant
    product.canonicalImages.push(this.createImageRef(query));
    
    // Update visual centroids (running average)
    product.visual.pHash.centroids = this.updateCentroid(
      product.visual.pHash.centroids, 
      query.visual.pHash
    );
    product.visual.embeddings.centroids = this.updateCentroid(
      product.visual.embeddings.centroids,
      query.visual.embeddings
    );
    
    // Update color profile
    product.visual.color = this.mergeColorProfile(product.visual.color, query.visual.colorHist);
    
    // Update packaging observations
    product.packaging.shape = this.mergeShape(product.packaging.shape, query.packaging.shape);
    product.packaging.logo = this.mergeLogo(product.packaging.logo, query.packaging.logoDetections);
    
    // Update semantic confidence
    product.semantics.attributes = this.mergeAttributes(product.semantics.attributes, query.semantics.predictedAttributes);
    
    // Update history
    product.history.accepted++;
    product.history.totalQueries++;
    product.confidence = this.computeConfidence(product);
    product.version++;
    
    await this.save(product);
  }

  // Negative: learn what this product is NOT
  private async weakenMatch(query: QueryProfile, productId: string): Promise<void> {
    const product = await this.loadProductProfile(productId);
    product.history.falsePositives.push(query.queryId);
    product.history.rejected++;
    await this.save(product);
  }

  // Correction: transfer observation to correct product, add negative to wrong
  private async correctMatch(query: QueryProfile, correctProductId: string): Promise<void> {
    const wrongProductId = query.topMatch?.productId;
    if (wrongProductId) await this.weakenMatch(query, wrongProductId);
    await this.reinforceMatch(query, correctProductId);
    
    // Record correction for confusion matrix
    const correct = await this.loadProductProfile(correctProductId);
    correct.history.corrected.push({ fromQuery: query.queryId, toProduct: correctProductId, timestamp: new Date() });
    if (wrongProductId) correct.history.falseNegatives.push(wrongProductId);
    await this.save(correct);
  }

  // Monthly: retrain fusion weights from all feedback
  private async recomputeWeights(): Promise<void> {
    const trainingData = await this.loadTrainingData();
    const weights = this.trainFusionWeights(trainingData);
    await this.saveWeights(weights);
  }
}
```

---

## 6. AI Role: Ambiguity Resolution ONLY

```typescript
class AmbiguityResolver {
  // AI prompt template - NO recognition, ONLY disambiguation
  private buildPrompt(query: QueryProfile, candidates: ScoredCandidate[]): string {
    return `
You are a product disambiguation expert. 
The visual search system found ${candidates.length} similar candidates but cannot decide.

QUERY OBSERVATION:
- Barcode: ${query.barcodes.primary || 'none'}
- OCR codes: ${query.productCodes.codes.map(c => c.value).join(', ') || 'none'}
- Dominant colors: ${query.visual.dominantColors.map(c => `rgb(${c.r},${c.g},${c.b})`).join(', ')}
- Shape: ${query.packaging.shape.type}
- Detected logos: ${query.packaging.logoDetections.map(l => l.brand).join(', ') || 'none'}
- Predicted category: ${query.semantics.predictedCategory.name} (${query.semantics.predictedCategory.confidence})

CANDIDATES:
${candidates.map((c, i) => `
${i+1}. ${c.product.name} (${c.product.brand})
   SKU: ${c.product.sku}
   Category: ${c.product.semantics.categoryPath.join(' > ')}
   Visual score: ${c.scores.probabilistic.fusedScore.toFixed(2)}
   Barcode: ${c.product.barcodes.primary || 'none'}
   Colors: ${c.product.visual.color.dominant.map(rgb => `rgb(${rgb.r},${rgb.g},${rgb.b})`).join(', ')}
   Shape: ${c.product.packaging.shape.type}
`).join('\n')}

TASK: Which candidate matches the query? 
Consider: barcode/OCR exact matches > visual similarity > semantic consistency.
If none match well, say "none".

RESPOND WITH JSON ONLY:
{
  "choice": 0 | 1 | 2 | null,
  "confidence": 0.0-1.0,
  "reasoning": "specific visual/semantic evidence"
}
    `.trim();
  }

  async resolve(query: QueryProfile, candidates: ScoredCandidate[]): Promise<AIResolution> {
    if (candidates.length === 0) return { resolved: false, reason: 'no_candidates' };
    
    const prompt = this.buildPrompt(query, candidates);
    const response = await this.callAI(prompt);
    const parsed = JSON.parse(response);
    
    if (parsed.choice === null || parsed.confidence < 0.7) {
      return { resolved: false, reason: 'ai_uncertain' };
    }
    
    const chosen = candidates[parsed.choice];
    return {
      resolved: true,
      productId: chosen.product.productId,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      tier: 'ai_assisted'
    };
  }
}
```

---

## 7. Database Schema (Profile-Centric)

```sql
-- Product Profiles (one per product, updated incrementally)
CREATE TABLE product_profiles (
    product_id        UUID PRIMARY KEY REFERENCES products(id),
    sku               VARCHAR(100) NOT NULL,
    
    -- Deterministic layer
    barcode_primary   VARCHAR(20),
    barcode_variants  VARCHAR(20)[],
    ocr_codes         JSONB,           -- {code: {count, confidence, locations}[]}
    
    -- Probabilistic layer
    phash_centroids   BIGINT[],        -- Multiple centroids for variants
    embedding_dinov2_centroid VECTOR(384),
    embedding_clip_centroid   VECTOR(512),
    embedding_covariance      FLOAT8[], -- For Mahalanobis distance
    color_hist_centroid       VECTOR(50),
    feature_centroids         BYTEA,    -- Compressed keypoint clusters
    
    -- Packaging layer
    shape_descriptor  JSONB,           -- {type, aspect_ratio, keypoints}
    logo_embeddings   VECTOR(512)[],
    layout_signature  BYTEA,           -- Compressed layout descriptor
    
    -- Semantic layer
    category_path     TEXT[],
    brand_id          UUID REFERENCES brands(id),
    attributes        JSONB,           -- {color: "red", size: "500ml", ...}
    price_range       NUMRANGE,
    
    -- History layer
    total_queries     INT DEFAULT 0,
    accepted_count    INT DEFAULT 0,
    rejected_count    INT DEFAULT 0,
    corrections       JSONB,           -- [{from_query, to_product, timestamp}]
    false_positives   UUID[],
    false_negatives   UUID[],
    
    -- Metadata
    confidence        REAL DEFAULT 0,
    version           INT DEFAULT 1,
    last_updated      TIMESTAMPTZ DEFAULT now(),
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- Product Images (linked to profile)
CREATE TABLE product_profile_images (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id       UUID REFERENCES product_profiles(product_id),
    image_url        VARCHAR(1000),
    phash64          BIGINT,
    embedding_dinov2 VECTOR(384),
    variant_type     VARCHAR(30),
    quality          REAL,
    source           VARCHAR(20),
    added_at         TIMESTAMPTZ DEFAULT now()
);

-- Query Profiles (for training/analysis)
CREATE TABLE query_profiles (
    query_id         CHAR(26) PRIMARY KEY,  -- ULID
    image_hash       CHAR(64),
    
    -- All layers (same structure as product profile)
    barcode_data     JSONB,
    ocr_data         JSONB,
    visual_data      JSONB,
    packaging_data   JSONB,
    semantic_data    JSONB,
    quality_data     JSONB,
    
    -- Results
    top_candidate    UUID REFERENCES products(id),
    deterministic_score REAL,
    probabilistic_score REAL,
    ai_used          BOOLEAN,
    ai_result        JSONB,
    user_action      VARCHAR(20),
    correction       UUID REFERENCES products(id),
    
    created_at       TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Fusion Weights (learned monthly)
CREATE TABLE fusion_weights (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layer            VARCHAR(20),           -- 'probabilistic'
    signal           VARCHAR(50),           -- 'pHash', 'embedding', 'color', ...
    weight           REAL,
    trained_at       TIMESTAMPTZ DEFAULT now(),
    training_samples INT,
    validation_auc   REAL,
    is_active        BOOLEAN DEFAULT true
);
```

---

## 8. Key Properties

| Property | How It's Achieved |
|----------|-------------------|
| **Zero AI for known products** | Layer 1 (barcode/OCR) + Layer 2 (learned probabilistic) cover >95% |
| **AI only for ambiguity** | Layer 3 triggers ONLY when top candidates are close AND scores medium |
| **Profiles improve over time** | Every accepted query reinforces centroids, adds variants, updates weights |
| **Confusion learning** | Corrections build false-positive/false-negative lists per product |
| **New products auto-onboard** | AI-assisted identification creates initial profile, then learns from usage |
| **No re-indexing needed** | Centroids updated incrementally (running average), HNSW handles new vectors |
| **Explainable decisions** | Every layer produces human-readable evidence |

---

## 9. Implementation Priority

1. **ProductProfile + QueryProfile types** - Core data structures
2. **Deterministic Layer** - Barcode/OCR exact match (fastest, highest precision)
3. **Probabilistic Layer** - Visual + packaging + semantic fusion with learned weights
4. **Profile Builder** - Extract all layers from image, build QueryProfile
5. **Profile Updater** - Reinforce/correct/weaken based on feedback
6. **AmbiguityResolver** - AI disambiguation with structured prompt
7. **Weight Retrainer** - Monthly XGBoost/LightGBM on feedback data
8. **API Integration** - Replace existing search endpoint