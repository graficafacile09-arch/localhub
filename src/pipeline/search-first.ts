import { Pool, PoolConfig } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { VisualSearchPipeline, PipelineConfig } from '../pipeline';
import { ProductProfileBuilder, createProductProfileBuilder } from './product-profile/builder';
import { createQueryProfileExtractor, QueryProfileExtractor } from './query-profile/extractor';
import { MultiLayerScorer, createMultiLayerScorer } from './scoring/multi-layer-scorer';
import { createExtendedAIFallback, ExtendedAIFallback } from './scoring/ambiguity-resolver';
import { ProfileUpdater, createProfileUpdater } from './product-profile/updater';
import { AIFallbackService } from '../ranking';
import { SearchCoordinator, createSearchCoordinator } from '../search';
import {
  QueryProfile,
  ProductProfile,
  ScoredCandidate,
  MultiLayerScore,
  ProfileUpdate,
  AIResolution,
  ULID,
  generateULID,
} from '../types/product-profile';
import { SearchOptions } from '../types/core';

export interface SearchFirstPipelineConfig {
  postgres: PoolConfig;
  redis: string;
  geminiApiKey: string;
  gemmaEndpoint?: string;
  aiThreshold?: number;
  enableAI?: boolean;
  deduplicationWindowMs?: number;
  scorerWeights?: any;
  updaterConfig?: any;
}

export class SearchFirstPipeline {
  private pg: Pool;
  private redis: RedisClientType;
  private search: SearchCoordinator;
  private profileBuilder: ProductProfileBuilder;
  private queryExtractor: QueryProfileExtractor;
  private scorer: MultiLayerScorer;
  private aiFallback: ExtendedAIFallback;
  private profileUpdater: ProfileUpdater;

  constructor(
    pg: Pool,
    redis: RedisClientType,
    search: SearchCoordinator,
    profileBuilder: ProductProfileBuilder,
    queryExtractor: QueryProfileExtractor,
    scorer: MultiLayerScorer,
    aiFallback: ExtendedAIFallback,
    profileUpdater: ProfileUpdater
  ) {
    this.pg = pg;
    this.redis = redis;
    this.search = search;
    this.profileBuilder = profileBuilder;
    this.queryExtractor = queryExtractor;
    this.scorer = scorer;
    this.aiFallback = aiFallback;
    this.profileUpdater = profileUpdater;
  }

  static async create(config: SearchFirstPipelineConfig): Promise<SearchFirstPipeline> {
    const pg = new Pool(config.postgres);
    const redis = createClient({ url: config.redis });
    await redis.connect();

    const search = await createSearchCoordinator(config.postgres, config.redis);
    const profileBuilder = await createProductProfileBuilder(pg);
    const queryExtractor = await createQueryProfileExtractor();
    const scorer = await createMultiLayerScorer(config.scorerWeights);
    
    const aiFallbackService = new AIFallbackService(config.geminiApiKey, config.gemmaEndpoint);
    const aiFallback = createExtendedAIFallback(aiFallbackService);
    
    const profileUpdater = await createProfileUpdater(pg, config.updaterConfig);

    return new SearchFirstPipeline(
      pg,
      redis,
      search,
      profileBuilder,
      queryExtractor,
      scorer,
      aiFallback,
      profileUpdater
    );
  }

  async search(
    imageInput: Buffer | string | File | Blob,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const startTime = Date.now();
    const queryId = generateULID();

    try {
      // 1. Extract QueryProfile (builds complete identity from image)
      const queryProfile = await this.queryExtractor.extract(imageInput, { queryId });
      
      // 2. Quick deduplication check
      const cached = await this.redis.get(`recent:queries:${queryProfile.imageHash}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // 3. Candidate retrieval from search indices
      const candidates = await this.search.search(queryProfile, options);
      
      // 4. Build full ProductProfiles for candidates
      const productIds = candidates.map(c => c.productId);
      const profiles = await this.profileBuilder.buildMultiple(productIds);
      
      // 5. Multi-layer scoring
      const scored = await this.scorer.scoreCandidates(queryProfile, Array.from(profiles.values()));
      
      // 6. Filter by threshold
      const filtered = this.filterByThreshold(scored, options.threshold || 'auto');
      
      // 7. Check if AI fallback needed
      let aiUsed = false;
      let aiResult: AIResolution | null = null;
      
      const topCandidate = filtered[0];
      const needsAI = this.shouldUseAI(topCandidate, options);
      
      if (needsAI && config.enableAI !== false) {
        aiUsed = true;
        aiResult = await this.aiFallback.fallback({
          query: queryProfile,
          candidates: filtered.slice(0, 3),
          ambiguityReason: this.getAmbiguityReason(topCandidate),
        });
        
        if (aiResult.resolved && aiResult.confidence >= 0.7) {
          // Insert AI result at top
          const aiProduct = await this.profileBuilder.build(aiResult.productId);
          if (aiProduct) {
            filtered.unshift({
              product: aiProduct,
              score: this.createAIScore(aiResult),
              rank: 0,
            });
            filtered.forEach((c, i) => c.rank = i + 1);
          }
        }
      }

      // 8. Format results
      const results = this.formatResults(filtered, options.returnExplanations);
      
      const finalResult: SearchResult = {
        queryId,
        results,
        aiUsed,
        aiResult,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
      };

      // 9. Cache for deduplication
      await this.redis.setEx(`recent:queries:${queryProfile.imageHash}`, 86400, JSON.stringify(finalResult));
      
      // 10. Log for analytics
      await this.logQuery(queryId, queryProfile, topCandidate, aiUsed, aiResult, Date.now() - startTime);

      return finalResult;
    } catch (error) {
      console.error('SearchFirstPipeline error:', error);
      throw error;
    }
  }

  private filterByThreshold(scored: ScoredCandidate[], threshold: string): ScoredCandidate[] {
    switch (threshold) {
      case 'exact': return scored.filter(s => s.score.confidence === 'exact');
      case 'high': return scored.filter(s => ['exact', 'high'].includes(s.score.confidence));
      case 'medium': return scored.filter(s => ['exact', 'high', 'medium'].includes(s.score.confidence));
      case 'low': return scored.filter(s => s.score.fusedScore >= 0.3);
      default: return scored; // 'auto' - return all
    }
  }

  private shouldUseAI(top: ScoredCandidate | undefined, options: SearchOptions): boolean {
    if (!top) return true;
    if (options.enableAI === false) return false;
    
    // Use AI if:
    // - No candidates at all
    // - Top score is ambiguous
    // - Top score requires AI
    return top.score.requiresAI || top.score.confidence === 'ambiguous' || top.score.confidence === 'low';
  }

  private getAmbiguityReason(top: ScoredCandidate | undefined): string {
    if (!top) return 'no_candidates';
    if (top.score.confidence === 'ambiguous') return 'ambiguous_scores';
    if (top.score.requiresAI) return 'low_confidence';
    return 'fallback';
  }

  private createAIScore(aiResult: AIResolution): MultiLayerScore {
    return {
      deterministic: { layer: 'deterministic', score: 0, evidence: [], matched: false },
      probabilistic: { layer: 'probabilistic', score: aiResult.confidence, evidence: [], matched: false },
      packaging: { layer: 'packaging', score: 0, evidence: [], matched: false },
      semantic: { layer: 'semantic', score: 0, evidence: [], matched: false },
      fusedScore: aiResult.confidence,
      confidence: 'ai_assisted',
      requiresAI: false,
      breakdown: {},
    };
  }

  private formatResults(scored: ScoredCandidate[], includeExplanations: boolean = true): SearchResultItem[] {
    return scored.map(s => ({
      product: {
        id: s.product.productId,
        sku: s.product.sku,
        barcode: s.product.barcode.primary,
        // ... other product fields
      },
      score: s.score.fusedScore,
      confidence: s.score.confidence,
      signals: includeExplanations ? s.score : undefined,
      explanation: includeExplanations ? this.generateExplanation(s.score) : undefined,
    }));
  }

  private generateExplanation(score: MultiLayerScore): string {
    const parts: string[] = [];
    if (score.deterministic.matched) parts.push('exact match');
    if (score.probabilistic.score > 0.7) parts.push(`visual ${(score.probabilistic.score * 100).toFixed(0)}%`);
    if (score.packaging.score > 0.7) parts.push(`packaging ${(score.packaging.score * 100).toFixed(0)}%`);
    if (score.semantic.score > 0.7) parts.push(`semantic ${(score.semantic.score * 100).toFixed(0)}%`);
    return parts.length > 0 ? parts.join(', ') : 'weak match';
  }

  async submitFeedback(update: ProfileUpdate): Promise<void> {
    await this.profileUpdater.processFeedback(update);
    
    // Also log to query_log
    await this.pg.query(`
      INSERT INTO feedback_events (query_id, event_type, correction_id)
      VALUES ($1, $2, $3)
    `, [update.queryId, update.action, update.correctionTargetId || null]);
  }

  private async logQuery(
    queryId: ULID,
    queryProfile: QueryProfile,
    top: ScoredCandidate | undefined,
    aiUsed: boolean,
    aiResult: AIResolution | null,
    latencyMs: number
  ): Promise<void> {
    await this.pg.query(`
      INSERT INTO query_log (
        id, query_hash, image_phash64, top_candidate_id, final_score, tier,
        ai_used, ai_model, ai_confidence, latency_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      queryId,
      queryProfile.imageHash,
      queryProfile.visual.pHash.centroids[0] || null,
      top?.product.productId || null,
      top?.score.fusedScore || 0,
      top?.score.confidence || 'none',
      aiUsed,
      aiResult?.model || null,
      aiResult?.confidence || null,
      latencyMs,
    ]);

    // Store query profile for training
    await this.pg.query(`
      INSERT INTO query_profiles (query_id, image_hash, visual_data, semantic_data, quality_data, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      queryId,
      queryProfile.imageHash,
      JSON.stringify({ pHash: queryProfile.visual.pHash.centroids, embedding: queryProfile.visual.embeddings }),
      JSON.stringify({ category: queryProfile.semantic.category, brand: queryProfile.semantic.brand }),
      JSON.stringify({ quality: queryProfile.quality }),
      queryProfile.timestamp,
    ]);
  }

  async close(): Promise<void> {
    await this.search.close();
    await this.pg.end();
    await this.redis.quit();
  }
}

export interface SearchResult {
  queryId: ULID;
  results: SearchResultItem[];
  aiUsed: boolean;
  aiResult: AIResolution | null;
  latencyMs: number;
  timestamp: Date;
}

export interface SearchResultItem {
  product: {
    id: string;
    sku: string;
    barcode: string | null;
    // ... other fields
  };
  score: number;
  confidence: MultiLayerScore['confidence'];
  signals?: MultiLayerScore;
  explanation?: string;
}

export async function createSearchFirstPipeline(
  config: SearchFirstPipelineConfig
): Promise<SearchFirstPipeline> {
  return SearchFirstPipeline.create(config);
}