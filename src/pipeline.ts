// Search-First AI-Last Pipeline - Main Export

// Core Pipeline
export { SearchFirstPipeline, createSearchFirstPipeline } from './pipeline/search-first';

// Profile Building
export { ProductProfileBuilder, createProductProfileBuilder } from './pipeline/product-profile/builder';
export { QueryProfileExtractor, createQueryProfileExtractor } from './pipeline/query-profile/extractor';

// Scoring
export { MultiLayerScorer, createMultiLayerScorer } from './pipeline/scoring/multi-layer-scorer';
export { AmbiguityResolver, createExtendedAIFallback, ExtendedAIFallback } from './pipeline/scoring/ambiguity-resolver';

// Learning
export { ProfileUpdater, createProfileUpdater } from './pipeline/product-profile/updater';

// Legacy Pipeline (deprecated but kept for compatibility)
export { VisualSearchPipeline } from './pipeline';
export { SearchCoordinator, createSearchCoordinator } from './pipeline/search';
export { RankingService } from './pipeline/ranking';
export { AIFallbackService } from './pipeline/ai-fallback';
export { FeedbackLoop, createFeedbackLoop } from './pipeline/feedback';
export { acquireImage } from './pipeline/acquisition';
export { preprocess } from './pipeline/preprocessing';
export { createFingerprintExtractor } from './pipeline/fingerprint';

// Types
export type {
  AcquiredImage,
  PreprocessedImage,
  FingerprintResult,
  ProductCandidate,
  MatchSignals,
  RankedResult,
  SearchResult,
  SearchOptions,
  FeedbackEvent,
  AIResult,
  ULID,
  ResultTier,
  BarcodeFormat,
} from './pipeline/types/core';
export {
  THRESHOLDS,
  FUSION_WEIGHTS,
  tierFromScore,
  shouldUseAI,
  generateULID,
} from './pipeline/types/core';

// New Product Profile Types
export type {
  ProductProfile,
  QueryProfile,
  BarcodeSignal,
  OCRSignal,
  VisualSignal,
  PackagingSignal,
  SemanticSignal,
  QualitySignal,
  ContextSignal,
  PHashProfile,
  EmbeddingProfile,
  VectorProfile,
  ColorProfile,
  LocalFeatureProfile,
  ShapeProfile,
  LogoProfile,
  LayoutProfile,
  MaterialProfile,
  CategoryPrediction,
  AttributeProfile,
  BrandPrediction,
  PriceTierPrediction,
  OCRCodeMatch,
  OCRTextBlock,
  BrandOCRMatch,
  BoundingBox,
  RGB,
  KeypointCluster,
  GeometricLayout,
  TextRegion,
  GraphicElement,
  GridStructure,
  AttributeValue,
  CorrectionEvent,
  MultiLayerScore,
  ScoredCandidate,
  LayerScore,
  Evidence,
  AIResolution,
  AIResolutionRequest,
  AIModel,
  ProfileUpdate,
  ULID,
} from './pipeline/types/product-profile';
export {
  cosineSimilarity,
  hammingDistance,
  pHashSimilarity,
  histogramDistance,
  updateCentroid,
  mergePHashCentroids,
  generateULID,
} from './pipeline/types/product-profile';