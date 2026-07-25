export type ULID = string & { readonly _brand: unique symbol };

export function generateULID(): ULID {
  const now = Date.now();
  const timestamp = now.toString(36).padStart(10, '0');
  const random = Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map(b => b.toString(36).padStart(2, '0'))
    .join('');
  return (timestamp + random) as ULID;
}

// ============================================================
// LAYER 1: DETERMINISTIC SIGNALS (Exact Match)
// ============================================================

export interface BarcodeSignal {
  primary: string | null;           // EAN13, UPC-A, etc.
  variants: string[];               // Other formats found
  format: BarcodeFormat | null;
  confidence: number;               // 0-1
  locations: BoundingBox[];
}

export type BarcodeFormat = 'EAN13' | 'EAN8' | 'UPC_A' | 'UPC_E' | 'CODE128' | 'QR' | 'DATAMATRIX' | 'PDF417';

export interface OCRSignal {
  productCodes: OCRCodeMatch[];     // EAN, SKU, ISBN, model numbers
  textBlocks: OCRTextBlock[];       // All extracted text
  brandDetections: BrandOCRMatch[]; // Brand names found in text
  confidence: number;
  language: string;
}

export interface OCRCodeMatch {
  code: string;
  type: 'EAN13' | 'EAN8' | 'UPC' | 'ISBN' | 'SKU' | 'MODEL' | 'SERIAL' | 'UNKNOWN';
  confidence: number;
  location: BoundingBox;
  sourceBlockIndex: number;
}

export interface OCRTextBlock {
  text: string;
  bbox: BoundingBox;
  confidence: number;
  isProductCode: boolean;
}

export interface BrandOCRMatch {
  brand: string;
  confidence: number;
  location: BoundingBox;
  matchedWords: string[];
}

export interface BoundingBox {
  x: number; y: number; width: number; height: number;
  normalized: boolean; // relative to image dimensions
}

// ============================================================
// LAYER 2: PROBABILISTIC VISUAL SIGNALS
// ============================================================

export interface VisualSignal {
  pHash: PHashProfile;
  embeddings: EmbeddingProfile;
  color: ColorProfile;
  localFeatures: LocalFeatureProfile;
}

export interface PHashProfile {
  centroids: bigint[];        // Multiple centroids for variants
  radius: number;             // Max Hamming distance within cluster
  sampleCount: number;
}

export interface EmbeddingProfile {
  dinov2: VectorProfile;      // DINOv2 ViT-S/14 (384-dim)
  clip?: VectorProfile;       // CLIP ViT-B/32 (512-dim) - optional
  covariance?: Float32Array;  // Flattened covariance matrix for Mahalanobis
}

export interface VectorProfile {
  centroid: Float32Array;
  variance: Float32Array;     // Per-dimension variance
  count: number;
  radius: number;             // Cosine distance radius covering 95%
}

export interface ColorProfile {
  hsvHistogram: Float32Array; // 50-bin normalized histogram
  dominant: RGB[];            // Top 5 dominant colors
  palette: RGB[];             // 8-color palette
  variance: Float32Array;     // Per-bin variance
}

export interface RGB { r: number; g: number; b: number; }

export interface LocalFeatureProfile {
  keypointClusters: KeypointCluster[]; // Compressed cluster centers
  descriptorVocabulary: Uint8Array;    // Visual vocabulary (optional)
  geometricLayout: GeometricLayout;    // Relative positions
}

export interface KeypointCluster {
  center: { x: number; y: number; scale: number; orientation: number };
  descriptor: Uint8Array;              // Average ORB/BRIEF descriptor
  count: number;
  variance: number;
}

export interface GeometricLayout {
  aspectRatio: number;
  keypointDensity: number;
  symmetryScore: number;
  layoutDescriptor: Float32Array;      // Compressed spatial layout
}

// ============================================================
// LAYER 3: PACKAGING & STRUCTURAL SIGNALS
// ============================================================

export interface PackagingSignal {
  shape: ShapeProfile;
  logos: LogoProfile[];
  layout: LayoutProfile;
  materials: MaterialProfile;
}

export interface ShapeProfile {
  type: 'box' | 'bottle' | 'can' | 'jar' | 'tube' | 'bag' | 'irregular' | 'unknown';
  aspectRatio: number;        // width/height of main object
  dimensions3D?: { w: number; h: number; d: number }; // estimated
  contourComplexity: number;  // 0-1
  symmetry: { vertical: number; horizontal: number; radial: number };
  keypoints: { x: number; y: number; type: string }[]; // corners, edges
}

export interface LogoProfile {
  brand: string | null;       // Recognized brand or null
  bbox: BoundingBox;
  confidence: number;
  embedding: Float32Array;    // Logo crop embedding for similarity
  position: 'front' | 'side' | 'top' | 'bottom' | 'cap' | 'label';
}

export interface LayoutProfile {
  textRegions: TextRegion[];  // Layout of text blocks
  graphicElements: GraphicElement[];
  gridStructure: GridStructure | null;
  visualHierarchy: number[];  // Saliency map compressed
}

export interface TextRegion {
  bbox: BoundingBox;
  role: 'brand' | 'product_name' | 'description' | 'ingredients' | 'nutritional' | 'legal' | 'unknown';
  readingOrder: number;
}

export interface GraphicElement {
  bbox: BoundingBox;
  type: 'logo' | 'illustration' | 'pattern' | 'seal' | 'certification' | 'unknown';
  colorDominance: RGB;
}

export interface GridStructure {
  rows: number;
  cols: number;
  cellBBoxes: BoundingBox[];
  regularity: number;
}

export interface MaterialProfile {
  surface: 'glossy' | 'matte' | 'metallic' | 'transparent' | 'paper' | 'plastic' | 'glass' | 'unknown';
  reflectivity: number;       // 0-1
  textureDescriptor: Float32Array;
}

// ============================================================
// LAYER 4: SEMANTIC SIGNALS
// ============================================================

export interface SemanticSignal {
  category: CategoryPrediction;
  attributes: AttributeProfile;
  brand: BrandPrediction;
  priceTier: PriceTierPrediction;
}

export interface CategoryPrediction {
  path: string[];             // e.g., ['Beverages', 'Soft Drinks', 'Cola']
  leafId: string;             // Category ID
  confidence: number;
  allPredictions: { path: string[]; confidence: number }[];
}

export interface AttributeProfile {
  color: AttributeValue;
  size: AttributeValue;
  volume: AttributeValue;
  weight: AttributeValue;
  material: AttributeValue;
  flavor: AttributeValue;
  packaging: AttributeValue;
  custom: Record<string, AttributeValue>;
}

export interface AttributeValue {
  value: string | number | null;
  confidence: number;
  source: 'ocr' | 'visual' | 'semantic' | 'catalog';
}

export interface BrandPrediction {
  brandId: string | null;
  name: string | null;
  confidence: number;
  alternatives: { brandId: string; name: string; confidence: number }[];
}

export interface PriceTierPrediction {
  tier: 'budget' | 'mid' | 'premium' | 'luxury';
  estimatedRange: { min: number; max: number; currency: string };
  confidence: number;
}

// ============================================================
// LAYER 5: QUALITY & CONTEXT
// ============================================================

export interface QualitySignal {
  overall: number;             // 0-1 composite
  sharpness: number;
  exposure: number;
  lighting: number;
  occlusion: number;           // 0-1 (1 = heavily occluded)
  perspective: number;         // 0-1 (1 = extreme angle)
  resolution: { width: number; height: number };
  compressionArtifacts: number;
  isSufficient: boolean;       // Meets minimum quality threshold
}

export interface ContextSignal {
  sceneType: 'studio' | 'shelf' | 'hand' | 'table' | 'outdoor' | 'unknown';
  backgroundComplexity: number;
  multipleObjects: boolean;
  objectProminence: number;    // 0-1 (how much of image is the product)
  lightingType: 'controlled' | 'natural' | 'mixed' | 'flash' | 'unknown';
}

// ============================================================
// COMPLETE PROFILES
// ============================================================

export interface ProductProfile {
  productId: string;
  sku: string;
  
  // Layer 1: Deterministic
  barcode: BarcodeSignal;
  ocr: OCRSignal;
  
  // Layer 2: Probabilistic Visual
  visual: VisualSignal;
  
  // Layer 3: Packaging
  packaging: PackagingSignal;
  
  // Layer 4: Semantic
  semantic: SemanticSignal;
  
  // Metadata
  version: number;
  confidence: number;          // Overall profile confidence
  totalQueries: number;
  acceptedCount: number;
  rejectedCount: number;
  correctionHistory: CorrectionEvent[];
  falsePositives: string[];    // Product IDs
  falseNegatives: string[];    // Product IDs
  
  // Stats
  lastUpdated: Date;
  createdAt: Date;
}

export interface CorrectionEvent {
  fromQueryId: ULID;
  toProductId: string;
  timestamp: Date;
  wasFalsePositive: boolean;
}

export interface QueryProfile {
  queryId: ULID;
  imageHash: string;
  
  // Layer 1: Deterministic
  barcode: BarcodeSignal;
  ocr: OCRSignal;
  
  // Layer 2: Probabilistic Visual
  visual: VisualSignal;
  
  // Layer 3: Packaging
  packaging: PackagingSignal;
  
  // Layer 4: Semantic
  semantic: SemanticSignal;
  
  // Layer 5: Quality & Context
  quality: QualitySignal;
  context: ContextSignal;
  
  // Metadata
  timestamp: Date;
  source: 'camera' | 'upload' | 'url' | 'clipboard';
}

// ============================================================
// SCORING & MATCHING
// ============================================================

export interface LayerScore {
  layer: 'deterministic' | 'probabilistic' | 'packaging' | 'semantic';
  score: number;               // 0-1
  evidence: Evidence[];
  matched: boolean;            // Whether this layer alone can confirm match
}

export interface Evidence {
  signal: string;              // e.g., 'barcode', 'pHash', 'embedding_dinov2', 'logo'
  value: string | number;      // The actual match value
  weight: number;              // Contribution to score
  details: string;             // Human-readable
}

export interface MultiLayerScore {
  deterministic: LayerScore;
  probabilistic: LayerScore;
  packaging: LayerScore;
  semantic: LayerScore;
  
  fusedScore: number;          // Final 0-1 score
  confidence: 'exact' | 'high' | 'medium' | 'low' | 'ambiguous';
  requiresAI: boolean;
  
  // Per-layer breakdown for debugging
  breakdown: {
    barcode: number;
    ocr: number;
    pHash: number;
    embedding: number;
    color: number;
    features: number;
    shape: number;
    logo: number;
    layout: number;
    category: number;
    attributes: number;
    brand: number;
  };
}

export interface ScoredCandidate {
  product: ProductProfile;
  score: MultiLayerScore;
  rank: number;
}

// ============================================================
// AI RESOLUTION (Layer 5: Ambiguity Only)
// ============================================================

export interface AIResolutionRequest {
  query: QueryProfile;
  candidates: ScoredCandidate[];  // Top 3-5, all with medium scores
  ambiguityReason: string;        // Why deterministic/probabilistic failed
}

export interface AIResolution {
  resolved: boolean;
  productId: string | null;
  confidence: number;
  reasoning: string;
  tier: 'ai_assisted' | 'ai_rejected';
  model: string;
  latencyMs: number;
  costUsd: number;
}

// ============================================================
// PROFILE UPDATES (Continuous Learning)
// ============================================================

export interface ProfileUpdate {
  productId: string;
  queryId: ULID;
  action: 'accepted' | 'rejected' | 'corrected';
  
  // For accepted: reinforce
  // For rejected: weaken
  // For corrected: transfer to correct product
  
  reinforcement: {
    barcode?: boolean;
    ocr?: boolean;
    visual?: boolean;
    packaging?: boolean;
    semantic?: boolean;
  };
  
  // New data to incorporate
  newVisualData?: Partial<VisualSignal>;
  newPackagingData?: Partial<PackagingSignal>;
  newSemanticData?: Partial<SemanticSignal>;
  
  // For corrections
  correctionTargetId?: string;
  wasFalsePositive?: boolean;
}

// ============================================================
// HELPERS
// ============================================================

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x !== 0n) { count++; x &= x - 1n; }
  return count;
}

export function pHashSimilarity(a: bigint, b: bigint): number {
  return 1 - hammingDistance(a, b) / 64;
}

export function histogramDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function updateCentroid(
  current: Float32Array,
  currentCount: number,
  newVector: Float32Array
): { centroid: Float32Array; count: number } {
  const updated = new Float32Array(current.length);
  const n = currentCount + 1;
  for (let i = 0; i < current.length; i++) {
    updated[i] = (current[i] * currentCount + newVector[i]) / n;
  }
  return { centroid: updated, count: n };
}

export function mergePHashCentroids(centroids: bigint[], newHash: bigint, threshold = 8): bigint[] {
  for (const c of centroids) {
    if (hammingDistance(c, newHash) <= threshold) return centroids;
  }
  return [...centroids, newHash];
}