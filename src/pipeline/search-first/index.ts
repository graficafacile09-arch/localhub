import { Pool, PoolConfig } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { GoogleGenAI } from '@google/genai';
import {
  SearchFirstPipeline as SearchFirstPipelineType,
  SearchFirstPipelineConfig,
  SearchOptions,
  SearchResult,
  QueryProfile,
  ProductProfile,
  ScoredCandidate,
} from '../types/product-profile';
import { ProductProfileBuilder, createProductProfileBuilder } from './product-profile/builder';
import { QueryProfileExtractor, createQueryProfileExtractor } from './query-profile/extractor';
import { MultiLayerScorer, createMultiLayerScorer } from './scoring/multi-layer-scorer';
import { AmbiguityResolver, createExtendedAIFallback, ExtendedAIFallback } from './scoring/ambiguity-resolver';
import { ProfileUpdater, createProfileUpdater } from './product-profile/updater';
import { AIFallbackService } from './ai-fallback';

export class SearchFirstPipeline implements SearchFirstPipelineType {
  private profileBuilder: ProductProfileBuilder;
  private queryExtractor: QueryProfileExtractor;
  private scorer: MultiLayerScorer;
  private aiFallback: AIFallbackService;
  private extendedAI: ExtendedAIFallback;
  private ambiguityResolver: AmbiguityResolver;
  private feedbackUpdater: ProfileUpdater;
  private pg: Pool;
  private redis: RedisClientType;

  constructor(
    profileBuilder: ProductProfileBuilder,
    queryExtractor: QueryProfileExtractor,
    scorer: MultiLayerScorer,
    aiFallback: AIFallbackService,
    extendedAI: ExtendedAIFallback,
    ambiguityResolver: AmbiguityResolver,
    feedbackUpdater: ProfileUpdater,
    pg: Pool,
    redis: RedisClientType
  ) {
    this.profileBuilder = profileBuilder;
    this.queryExtractor = queryExtractor;
    this.scorer = scorer;
    this.aiFallback = aiFallback;
    this.extendedAI = extendedAI;
    this.ambiguityResolver = ambiguityResolver;
    this.feedbackUpdater = feedbackUpdater;
    this.pg = pg;
    this.redis = redis;
  }

  static async create(config: SearchFirstPipelineConfig): Promise<SearchFirstPipeline> {
    // PostgreSQL
    const pg = new Pool(config.postgres);
    
    // Redis
    const redis = createClient({ url: config.redis });
    await redis.connect();

    // Components
    const profileBuilder = await createProductProfileBuilder(pg);
    const queryExtractor = await createQueryProfileExtractor();
    const scorer = await createMultiLayerScorer();
    
    // AI Fallback
    const aiFallback = new AIFallbackService(config.geminiApiKey, config.gemmaEndpoint);
    const extendedAI = createExtendedAIFallback(aiFallback);
    const ambiguityResolver = new AmbiguityResolver(aiFallback);
    
    // Feedback Updater
    const feedbackUpdater = await createProfileUpdater(pg);

    return new SearchFirstPipeline(
      profileBuilder,
      queryExtractor,
      scorer,
      aiFallback,
      extendedAI,
      ambiguityResolver,
      feedbackUpdater,
      pg,
      redis
    );
  }

  async search(
    imageInput: Buffer | string | File | Blob,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const queryId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // 1. Build Query Profile
      const queryProfile = await this.queryExtractor.extract(imageInput, { queryId });

      // Check quality
      if (!queryProfile.quality.isSufficient) {
        throw new Error('IMAGE_QUALITY_TOO_LOW');
      }

      // Check for duplicates
      const dupKey = `query:${queryProfile.imageHash}`;
      const existing = await this.redis.get(dupKey);
      if (existing) {
        throw new Error('DUPLICATE_IMAGE');
      }

      // 2. Candidate Retrieval (from all product profiles)
      // For now, fetch all profiles - in production would use index filtering
      const allProfiles = await this.profileBuilder.buildMultiple([]);
      const candidates = Array.from(allProfiles.values());

      // 3. Multi-Layer Scoring
      const scored = await this.scorer.scoreCandidates(queryProfile, candidates);

      // 4. Apply Filters
      let filtered = this.applyFilters(scored, options.filters);

      // 5. Limit results
      const topResults = filtered.slice(0, options.maxResults || 20);

      // 6. Check for ambiguity / AI fallback
      const topResult = topResults[0];
      let aiUsed = false;
      let aiResult = null;

      if (options.includeAI !== false && topResult) {
        const { resolved, result, reason } = await this.ambiguityResolver.resolve(
          queryProfile,
          topResults,
          0.60 // AI threshold
        );

        if (resolved && result) {
          aiUsed = true;
          aiResult = {
            productId: result.productId,
            confidence: result.confidence,
            reasoning: result.reasoning,
            tier: result.tier,
            model: result.model,
            latencyMs: result.latencyMs,
            costUsd: result.costUsd,
          };

          // If AI found a match not in top results, prepend it
          if (result.productId && !topResults.some(r => r.product.productId === result.productId)) {
            const aiProduct = await this.profileBuilder.build(result.productId);
            if (aiProduct) {
              topResults.unshift({
                product: aiProduct,
                score: this.createAIScore(result.confidence, result.reasoning),
                rank: 0,
              });
              topResults.forEach((r, i) => r.rank = i + 1);
            }
          }
        }
      }

      // 7. Format results
      const formattedResults = topResults.map(r => ({
        product: {
          id: r.product.productId,
          sku: r.product.sku,
          name: r.product.semantic.category.path[r.product.semantic.category.path.length - 1] || 'Unknown',
          brand: r.product.semantic.brand.name || 'Unknown',
          category: r.product.semantic.category.path,
          attributes: this.flattenAttributes(r.product.semantic.attributes),
          confidence: r.score.confidence,
        },
        score: r.score.fusedScore,
        tier: r.score.confidence,
        signals: options.returnExplanations ? r.score.breakdown : undefined,
        explanation: options.returnExplanations ? this.generateExplanation(r.score) : undefined,
      }));

      // 8. Cache query hash for deduplication
      await this.redis.setEx(dupKey, 86400, JSON.stringify({
        queryId,
        topCandidate: topResult?.product.productId,
        score: topResult?.score.fusedScore,
        timestamp: Date.now(),
      }));

      // 9. Log query
      await this.logQuery(queryId, queryProfile, topResult, aiUsed, aiResult, Date.now() - startTime);

      return {
        queryId,
        results: formattedResults,
        aiUsed,
        aiResult,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
      };

    } catch (error) {
      await this.logError(queryId, error, Date.now() - startTime);
      throw error;
    }
  }

  async submitFeedback(
    queryId: string,
    action: 'accepted' | 'rejected' | 'corrected',
    correctionProductId?: string
  ): Promise<void> {
    // Build update from logged query
    // In production, would fetch the original query profile from DB
    await this.feedbackUpdater.processFeedback({
      productId: correctionProductId || '',
      queryId: queryId as any,
      action,
      correctionTargetId: correctionProductId,
      reinforcement: { barcode: true, ocr: true, visual: true, packaging: true, semantic: true },
    });
  }

  private applyFilters(scored: ScoredCandidate[], filters?: SearchOptions['filters']): ScoredCandidate[] {
    if (!filters) return scored;
    
    return scored.filter(r => {
      if (filters.categoryId && !r.product.semantic.category.path.includes(filters.categoryId)) return false;
      if (filters.brandId && r.product.semantic.brand.brandId !== filters.brandId) return false;
      if (filters.inStock !== undefined) return true; // Would check product availability
      return true;
    });
  }

  private flattenAttributes(attrs: any): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (value && value.value !== null) {
        result[key] = String(value.value);
      }
    }
    return result;
  }

  private generateExplanation(score: MultiLayerScore): string {
    const parts: string[] = [];
    
    if (score.deterministic.matched) {
      parts.push(`Deterministic: ${score.deterministic.evidence[0]?.details}`);
    }
    
    const topSignals = Object.entries(score.breakdown)
      .filter(([_, v]) => v > 0.7)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`);
    
    if (topSignals.length > 0) {
      parts.push(`Strong signals: ${topSignals.join(', ')}`);
    }
    
    return parts.join(' | ') || `Confidence: ${score.confidence} (${(score.fusedScore * 100).toFixed(0)}%)`;
  }

  private createAIScore(confidence: number, reasoning: string): MultiLayerScore {
    return {
      deterministic: { layer: 'deterministic', score: 0, evidence: [], matched: false },
      probabilistic: { layer: 'probabilistic', score: 0, evidence: [], matched: false },
      packaging: { layer: 'packaging', score: 0, evidence: [], matched: false },
      semantic: { layer: 'semantic', score: 0, evidence: [], matched: false },
      fusedScore: confidence,
      confidence: confidence >= 0.85 ? 'high' : 'medium',
      requiresAI: false,
      breakdown: {},
    };
  }

  private async logQuery(
    queryId: string,
    query: QueryProfile,
    topResult: ScoredCandidate | undefined,
    aiUsed: boolean,
    aiResult: any,
    latencyMs: number
  ): Promise<void> {
    await this.pg.query(`
      INSERT INTO query_log (
        id, query_hash, image_phash64, top_candidate_id, final_score, tier,
        ai_used, ai_model, ai_confidence, user_action, latency_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      queryId,
      query.imageHash,
      query.visual.pHash.centroids[0]?.toString() || null,
      topResult?.product.productId || null,
      topResult?.score.fusedScore || 0,
      topResult?.score.confidence || 'none',
      aiUsed,
      aiResult?.model || null,
      aiResult?.confidence || null,
      'pending',
      latencyMs,
    ]);
  }

  private async logError(queryId: string, error: unknown, latencyMs: number): Promise<void> {
    await this.pg.query(`
      INSERT INTO query_log (id, query_hash, final_score, tier, latency_ms)
      VALUES ($1, $2, 0, 'error', $3)
    `, [queryId, 'error', latencyMs]);
  }

  async close(): Promise<void> {
    await this.pg.end();
    await this.redis.quit();
  }

  getProfileBuilder(): ProductProfileBuilder {
    return this.profileBuilder;
  }

  getScorer(): MultiLayerScorer {
    return this.scorer;
  }

  getAmbiguityResolver(): AmbiguityResolver {
    return this.ambiguityResolver;
  }
}

export async function createSearchFirstPipeline(config: SearchFirstPipelineConfig): Promise<SearchFirstPipeline> {
  return SearchFirstPipeline.create(config);
}