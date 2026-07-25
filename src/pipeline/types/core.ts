export interface ULID {
  value: string;
}

export function generateULID(): ULID {
  const now = Date.now();
  const timestamp = now.toString(36).padStart(10, '0');
  const random = Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map(b => b.toString(36).padStart(2, '0'))
    .join('');
  return { value: timestamp + random };
}

export interface AcquiredImage {
  id: ULID;
  buffer: Buffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  size: number;
  source: 'camera' | 'upload' | 'url' | 'clipboard';
  capturedAt: Date;
  exif?: ExifData;
  hash: string;
  qualityScore: number;
}

export interface ExifData {
  orientation?: number;
  make?: string;
  model?: string;
  dateTimeOriginal?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
}

export interface PreprocessedImage {
  original: AcquiredImage;
  variants: ImageVariants;
  orientationCorrected: boolean;
  qualityScore: number;
}

export interface ImageVariants {
  fingerprint: Buffer;
  embedding: Buffer;
  ocr: Buffer;
  barcode: Buffer;
  thumbnail: Buffer;
}

export interface FingerprintResult {
  pHash: PHashResult;
  embedding: EmbeddingResult;
  ocr: OCRResult;
  barcode: BarcodeResult;
  features: FeatureResult;
  color: ColorHistogram;
}

export interface PHashResult {
  hash64: bigint;
  hash256: Buffer;
  algorithm: 'dct' | 'wavelet';
}

export interface EmbeddingResult {
  vector: Float32Array;
  model: 'dinov2' | 'clip';
  dimension: number;
  l2Normalized: true;
}

export interface OCRResult {
  text: string;
  blocks: OCRBlock[];
  language: string;
  productCodes: string[];
  confidence: number;
}

export interface OCRBlock {
  text: string;
  bbox: BoundingBox;
  confidence: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BarcodeResult {
  format: BarcodeFormat;
  value: string;
  confidence: number;
  bbox: BoundingBox;
}

export type BarcodeFormat =
  | 'EAN13'
  | 'EAN8'
  | 'UPC_A'
  | 'UPC_E'
  | 'CODE128'
  | 'QR'
  | 'DATAMATRIX'
  | 'PDF417';

export interface FeatureResult {
  keypoints: Keypoint[];
  descriptors: Buffer;
  count: number;
}

export interface Keypoint {
  x: number;
  y: number;
  scale: number;
  orientation: number;
  response: number;
}

export interface ColorHistogram {
  hsv: Float32Array;
  dominant: RGB[];
  palette: RGB[];
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface ProductCandidate {
  productId: string;
  sku: string;
  name: string;
  brand: string;
  category: CategoryPath;
  images: ProductImage[];
  price: PriceInfo;
  availability: Availability;
  attributes: Record<string, string>;
  embeddings: Float32Array[];
  fingerprints: ProductFingerprints;
  matchSignals: MatchSignals;
}

export interface CategoryPath {
  id: string;
  path: string[];
  level: number;
}

export interface ProductImage {
  id: string;
  url: string;
  isCanonical: boolean;
  phash64: bigint;
  phash256: Buffer;
  embeddingDinov2?: Float32Array;
  embeddingClip?: Float32Array;
}

export interface PriceInfo {
  amount: number;
  currency: string;
  originalAmount?: number;
  onSale: boolean;
}

export interface Availability {
  inStock: boolean;
  quantity?: number;
  location?: string;
}

export interface ProductFingerprints {
  phashCentroids: bigint[];
  embeddingCentroidDinov2: Float32Array;
  embeddingCentroidClip: Float32Array;
  ocrTexts: string[];
  barcodes: string[];
  colorHistograms: Float32Array[];
}

export interface MatchSignals {
  pHash: SignalScore;
  vector: SignalScore;
  ocr: OCRSignal;
  barcode: BarcodeSignal;
  features: FeatureSignal;
  color: SignalScore;
  catalog: CatalogSignal;
}

export interface SignalScore {
  score: number;
  distance?: number;
  cosine?: number;
}

export interface OCRSignal {
  exact: boolean;
  fuzzyScore: number;
  matchedCodes: string[];
}

export interface BarcodeSignal {
  matched: boolean;
  format?: BarcodeFormat;
  value?: string;
}

export interface FeatureSignal {
  inliers: number;
  homography: boolean;
  score: number;
}

export interface CatalogSignal {
  categoryMatch: boolean;
  attributeMatch: number;
}

export interface RankedResult {
  candidate: ProductCandidate;
  signals: MatchSignals;
  finalScore: number;
  tier: ResultTier;
  explanation: string;
}

export type ResultTier = 'exact' | 'high' | 'medium' | 'low' | 'none';

export interface SearchResult {
  queryId: ULID;
  results: RankedResult[];
  aiUsed: boolean;
  aiResult?: AIResult;
  latencyMs: number;
  timestamp: Date;
}

export interface AIResult {
  prediction: ProductPrediction | CategoryPrediction;
  confidence: number;
  reasoning: string;
  model: AIModel;
  latencyMs: number;
  costUsd: number;
}

export type AIModel = 'gemini-2.5-flash' | 'gemma-3-27b' | 'llava-local';

export interface ProductPrediction {
  productId: string;
  confidence: number;
  matchedImageId: string;
}

export interface CategoryPrediction {
  categoryId: string;
  categoryPath: string[];
  confidence: number;
  attributes: Record<string, string>;
}

export interface FeedbackEvent {
  queryId: ULID;
  imageHash: string;
  result: RankedResult | AIResult;
  userAction: 'accepted' | 'rejected' | 'corrected' | 'ignored';
  correction?: string;
  timestamp: Date;
}

export interface SearchOptions {
  maxResults?: number;
  threshold?: 'exact' | 'high' | 'medium' | 'low' | 'auto';
  includeAI?: boolean;
  filters?: SearchFilters;
  returnExplanations?: boolean;
}

export interface SearchFilters {
  categoryId?: string;
  brandId?: string;
  priceRange?: { min: number; max: number };
  inStock?: boolean;
  attributes?: Record<string, string>;
}

export const THRESHOLDS = {
  EXACT: 0.95,
  HIGH: 0.80,
  MEDIUM: 0.60,
  LOW: 0.40,
  AI_FALLBACK: 0.60,
} as const;

export const FUSION_WEIGHTS = {
  barcode: 0.35,
  ocrExact: 0.25,
  pHash: 0.15,
  vector: 0.15,
  features: 0.10,
  color: 0.05,
  catalog: 0.05,
} as const;

export function tierFromScore(score: number): ResultTier {
  if (score >= THRESHOLDS.EXACT) return 'exact';
  if (score >= THRESHOLDS.HIGH) return 'high';
  if (score >= THRESHOLDS.MEDIUM) return 'medium';
  if (score >= THRESHOLDS.LOW) return 'low';
  return 'none';
}

export function shouldUseAI(score: number, forceAI = false): boolean {
  if (forceAI) return true;
  return score < THRESHOLDS.AI_FALLBACK;
}