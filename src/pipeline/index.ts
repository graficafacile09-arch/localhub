import { Pool, PoolConfig } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { SearchCoordinator, createSearchCoordinator } from '../search';
import { RankingService } from '../ranking';
import { AIFallbackService } from '../ranking';
import { FeedbackLoop } from '../feedback';
import { AcquiredImage, PreprocessedImage, FingerprintResult, SearchResult, SearchOptions } from '../types/core';
import { acquireImage } from '../acquisition';
import { preprocess } from '../preprocessing';
import { createFingerprintExtractor } from '../fingerprint';

export interface PipelineConfig {
  postgres: PoolConfig;
  redis: string;
  geminiApiKey: string;
  gemmaEndpoint?: string;
  aiThreshold?: number;
  enableAI?: boolean;
  deduplicationWindowMs?: number;
}

export class VisualSearchPipeline {
  private search: SearchCoordinator;
  private ranker: RankingService;
  private aiFallback: AIFallbackService;
  private feedback: FeedbackLoop;
  private pg: Pool;
  private redis: RedisClientType;

  constructor(
    search: SearchCoordinator,
    ranker: RankingService,
    aiFallback: AIFallbackService,
    feedback: FeedbackLoop,
    pg: Pool,
    redis: RedisClientType
  ) {
    this.search = search;
    this.ranker = ranker;
    this.aiFallback = aiFallback;
    this.feedback = feedback;
    this.pg = pg;
    this.redis = redis;
  }

  static async create(config: PipelineConfig): Promise<VisualSearchPipeline> {
    const pg = new Pool(config.postgres);
    const redis = createClient({ url: config.redis });
    await redis.connect();

    const search = await createSearchCoordinator(config.postgres, config.redis);
    const ranker = new RankingService();
    const aiFallback = new AIFallbackService(config.geminiApiKey, config.gemmaEndpoint);
    const feedback = new FeedbackLoop(pg, redis, search);

    return new VisualSearchPipeline(search, ranker, aiFallback, feedback, pg, redis);
  }

  async search(
    input: Buffer | string | File | Blob,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const queryId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      const acquired = await acquireImage(input, {
        deduplicationWindowMs: options.deduplicationWindowMs,
      });

      const preprocessed = await preprocess(acquired);

      const qualityCheck = this.validateQuality(preprocessed.qualityScore);
      if (!qualityCheck.valid) {
        throw new Error(`IMAGE_QUALITY_TOO_LOW: ${qualityCheck.reason}`);
      }

      const extractor = createFingerprintExtractor();
      const fingerprint = await extractor.extract(preprocessed.variants.fingerprint);

      const candidates = await this.search.search(fingerprint, options);
      const ranked = await this.ranker.rank(candidates, fingerprint);

      let aiUsed = false;
      let aiResult = undefined;

      const topScore = ranked[0]?.finalScore || 0;
      const shouldUseAI = options.enableAI !== false && topScore < (options.aiThreshold || 0.60);

      if (shouldUseAI && ranked.length > 0) {
        aiUsed = true;
        aiResult = await this.aiFallback.fallback(
          acquired.buffer,
          ranked.slice(0, 5),
          fingerprint,
          'gemini-2.5-flash'
        );

        if (aiResult.confidence >= 0.85 && aiResult.prediction.productId) {
          ranked.unshift({
            candidate: { productId: aiResult.prediction.productId } as any,
            signals: {} as any,
            finalScore: aiResult.confidence,
            tier: 'high' as any,
            explanation: `AI fallback: ${aiResult.reasoning}`,
          });
        }
      }

      await this.logQuery(queryId, acquired, ranked, aiUsed, aiResult, Date.now() - startTime);

      return {
        queryId: { value: queryId },
        results: ranked,
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
    await this.feedback.record(queryId, action, correctionProductId);
  }

  private validateQuality(score: number): { valid: boolean; reason?: string } {
    if (score < 0.3) return { valid: false, reason: `Quality score ${(score * 100).toFixed(0)}% below 30%` };
    return { valid: true };
  }

  private async logQuery(
    queryId: string,
    acquired: AcquiredImage,
    ranked: any[],
    aiUsed: boolean,
    aiResult: any,
    latencyMs: number
  ): Promise<void> {
    const top = ranked[0];
    await this.pg.query(`
      INSERT INTO query_log (
        id, query_hash, image_phash64, top_candidate_id, final_score, tier,
        ai_used, ai_model, ai_confidence, latency_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      queryId,
      acquired.hash,
      acquired.id.value,
      top?.candidate?.productId || null,
      top?.finalScore || 0,
      top?.tier || 'none',
      aiUsed,
      aiResult?.model || null,
      aiResult?.confidence || null,
      latencyMs,
    ]);

    await this.redis.setEx(`recent:queries:${acquired.hash}`, 86400, JSON.stringify({
      queryId,
      topCandidate: top?.candidate?.productId,
      score: top?.finalScore,
      timestamp: Date.now(),
    }));
  }

  private async logError(queryId: string, error: unknown, latencyMs: number): Promise<void> {
    await this.pg.query(`
      INSERT INTO query_log (id, query_hash, final_score, tier, latency_ms)
      VALUES ($1, $2, 0, 'error', $3)
    `, [queryId, 'error', latencyMs]);
  }

  async close(): Promise<void> {
    await this.search.close();
    await this.pg.end();
    await this.redis.quit();
  }

  getSearchCoordinator(): SearchCoordinator {
    return this.search;
  }

  getRanker(): RankingService {
    return this.ranker;
  }

  getAIFallback(): AIFallbackService {
    return this.aiFallback;
  }

  getFeedback(): FeedbackLoop {
    return this.feedback;
  }
}

export interface FeedbackConfig {
  pg: Pool;
  redis: RedisClientType;
  search: SearchCoordinator;
}

export class FeedbackLoop {
  constructor(
    private pg: Pool,
    private redis: RedisClientType,
    private search: SearchCoordinator
  ) {}

  async initialize(): Promise<void> {}

  async record(
    queryId: string,
    action: 'accepted' | 'rejected' | 'corrected' | 'ignored',
    correctionProductId?: string
  ): Promise<void> {
    const client = await this.pg.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        INSERT INTO feedback_events (query_id, event_type, correction_id)
        VALUES ($1, $2, $3)
      `, [queryId, action, correctionProductId || null]);

      if (action === 'accepted' || action === 'corrected') {
        const targetProductId = correctionProductId || await this.getTopCandidate(queryId);
        if (targetProductId) {
          await this.enrichProduct(targetProductId, queryId, action === 'corrected');
        }
      }

      if (action === 'rejected') {
        const topProductId = await this.getTopCandidate(queryId);
        if (topProductId) {
          await client.query(`
            INSERT INTO product_feedback (product_id, image_hash, feedback_type)
            SELECT top_candidate_id, query_hash, 'negative'
            FROM query_log WHERE id = $1
            ON CONFLICT DO NOTHING
          `, [queryId]);
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async getTopCandidate(queryId: string): Promise<string | null> {
    const result = await this.pg.query(
      'SELECT top_candidate_id FROM query_log WHERE id = $1',
      [queryId]
    );
    return result.rows[0]?.top_candidate_id || null;
  }

  private async enrichProduct(productId: string, queryId: string, isCorrection: boolean): Promise<void> {
    const queryImg = await this.pg.query(
      'SELECT * FROM query_images WHERE hash = (SELECT query_hash FROM query_log WHERE id = $1)',
      [queryId]
    );

    if (queryImg.rows.length === 0) return;

    const img = queryImg.rows[0];
    await this.search.addProductImage({
      id: crypto.randomUUID(),
      productId,
      url: `feedback://${queryId}`,
      phash64: img.phash64,
      phash256: img.phash256,
      embeddingDinov2: img.embedding_dinov2,
      embeddingClip: img.embedding_clip,
      ocrText: img.ocr_text || '',
      barcodeValue: img.barcode_value,
      barcodeFormat: img.barcode_format,
      colorHist: img.color_hist,
      featureDescriptors: img.feature_descriptors,
      qualityScore: img.quality_score || 0.5,
      isCanonical: false,
    });

    await this.pg.query(`
      INSERT INTO product_feedback (product_id, image_hash, feedback_type)
      VALUES ($1, $2, 'positive')
      ON CONFLICT DO NOTHING
    `, [productId, img.hash]);

    if (isCorrection) {
      const topProductId = await this.getTopCandidate(queryId);
      if (topProductId && topProductId !== productId) {
        await this.pg.query(`
          INSERT INTO product_feedback (product_id, image_hash, feedback_type)
          VALUES ($1, $2, 'negative')
          ON CONFLICT DO NOTHING
        `, [topProductId, img.hash]);
      }
    }
  }

  async runBatchJobs(): Promise<void> {
    await this.recomputeCentroids();
    await this.pruneStaleFingerprints();
    await this.retrainFusionWeights();
  }

  private async recomputeCentroids(): Promise<void> {
    const products = await this.pg.query(`
      SELECT product_id, embedding_dinov2
      FROM product_images
      WHERE status = 'active' AND embedding_dinov2 IS NOT NULL
    `);

    const centroids = new Map<string, Float32Array[]>();
    for (const row of products.rows) {
      if (!centroids.has(row.product_id)) centroids.set(row.product_id, []);
      centroids.get(row.product_id)!.push(row.embedding_dinov2);
    }

    for (const [productId, embeddings] of centroids) {
      const centroid = this.averageVectors(embeddings);
      await this.pg.query(`
        UPDATE products SET embedding_centroid_dinov2 = $1 WHERE id = $2
      `, [JSON.stringify(Array.from(centroid)), productId]);
    }
  }

  private averageVectors(vectors: Float32Array[]): Float32Array {
    const dim = vectors[0].length;
    const sum = new Float32Array(dim);
    for (const v of vectors) {
      for (let i = 0; i < dim; i++) sum[i] += v[i];
    }
    for (let i = 0; i < dim; i++) sum[i] /= vectors.length;
    return sum;
  }

  private async pruneStaleFingerprints(): Promise<void> {
    await this.pg.query(`
      DELETE FROM product_images
      WHERE source = 'user_feedback'
      AND quality_score < 0.4
      AND created_at < NOW() - INTERVAL '90 days'
    `);
  }

  private async retrainFusionWeights(): Promise<void> {
    console.log('Fusion weight retraining - placeholder for ML pipeline');
  }
}