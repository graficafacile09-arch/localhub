import { Pool } from 'pg';
import { Queue, Worker, Job } from 'bullmq';
import { FeedbackEvent, RankedResult, AIResult, ProductCandidate, FingerprintResult, ULID, generateULID } from '../types/core';

export interface FeedbackConfig {
  redisUrl: string;
  pgPool: Pool;
  autoUpdateThreshold: number;
  batchSize: number;
  flushIntervalMs: number;
}

export class FeedbackLoop {
  private queue: Queue;
  private worker: Worker;
  private buffer: FeedbackEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private config: FeedbackConfig) {
    this.queue = new Queue('feedback', { connection: { url: config.redisUrl } });
    this.worker = new Worker('feedback', this.processJob.bind(this), {
      connection: { url: config.redisUrl },
      concurrency: 5,
    });
  }

  async initialize(): Promise<void> {
    this.worker.on('completed', job => console.log(`Feedback job ${job.id} completed`));
    this.worker.on('failed', (job, err) => console.error(`Feedback job ${job?.id} failed:`, err));

    this.startPeriodicFlush();
  }

  async record(event: FeedbackEvent): Promise<void> {
    this.buffer.push(event);

    await this.config.pgPool.query(`
      INSERT INTO query_log (query_id, query_hash, image_phash64, top_candidate, final_score, tier, ai_used, ai_model, ai_confidence, user_action, correction, latency_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      event.queryId.value,
      event.imageHash,
      null,
      event.result.candidate?.productId || null,
      'finalScore' in event.result ? event.result.finalScore : null,
      'tier' in event.result ? event.result.tier : null,
      'aiUsed' in event.result ? event.result.aiUsed : false,
      'aiUsed' in event.result && event.result.aiUsed ? 'model' in event.result ? event.result.aiResult?.model : null : null,
      'aiUsed' in event.result && event.result.aiUsed ? event.result.aiResult?.confidence : null,
      event.userAction,
      event.correction || null,
      0,
    ]);

    if (this.shouldAutoUpdate(event)) {
      await this.queue.add('auto-update', { event }, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
    }

    if (this.buffer.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  private shouldAutoUpdate(event: FeedbackEvent): boolean {
    if (event.userAction !== 'accepted') return false;

    const result = event.result as RankedResult;
    return result.finalScore >= this.config.autoUpdateThreshold;
  }

  private async processJob(job: Job): Promise<void> {
    const { event } = job.data;
    await this.applyFeedback(event);
  }

  private async applyFeedback(event: FeedbackEvent): Promise<void> {
    const { queryId, imageHash, result, userAction, correction } = event;

    if (userAction === 'corrected' && correction) {
      await this.addNegativeExample(queryId.value, imageHash, correction);
      await this.addPositiveExample(correction, imageHash);
      await this.adjustFusionWeights(queryId.value, correction, -0.05);
    } else if (userAction === 'accepted') {
      const res = result as RankedResult;
      if (res.finalScore >= this.config.autoUpdateThreshold) {
        await this.addPositiveExample(res.candidate.productId, imageHash);
        await this.updateEmbeddingCentroid(res.candidate.productId, imageHash);
      }
    } else if (userAction === 'rejected') {
      const res = result as RankedResult;
      await this.addNegativeExample(queryId.value, imageHash, res.candidate.productId);
      await this.adjustFusionWeights(queryId.value, res.candidate.productId, -0.02);
    }
  }

  private async addPositiveExample(productId: string, imageHash: string): Promise<void> {
    await this.config.pgPool.query(`
      INSERT INTO product_images (product_id, phash64, phash256, embedding_dinov2, embedding_clip, ocr_text, barcode_value, barcode_format, color_hist, feature_descriptors, quality_score, is_canonical, source, status)
      SELECT $1, phash64, phash256, embedding_dinov2, embedding_clip, ocr_text, barcode_value, barcode_format, color_hist, feature_descriptors, quality_score, false, 'user_feedback', 'active'
      FROM query_images WHERE hash = $2
      ON CONFLICT DO NOTHING
    `, [productId, imageHash]);

    await this.config.pgPool.query(`
      INSERT INTO product_feedback (product_id, image_hash, feedback_type, created_at)
      VALUES ($1, $2, 'positive', NOW())
      ON CONFLICT DO NOTHING
    `, [productId, imageHash]);
  }

  private async addNegativeExample(queryId: string, imageHash: string, productId: string): Promise<void> {
    await this.config.pgPool.query(`
      INSERT INTO product_feedback (product_id, image_hash, feedback_type, created_at)
      VALUES ($1, $2, 'negative', NOW())
      ON CONFLICT DO NOTHING
    `, [productId, imageHash]);
  }

  private async updateEmbeddingCentroid(productId: string, imageHash: string): Promise<void> {
    const result = await this.config.pgPool.query(`
      SELECT embedding_dinov2 FROM product_images
      WHERE product_id = $1 AND embedding_dinov2 IS NOT NULL AND status = 'active'
    `, [productId]);

    if (result.rows.length === 0) return;

    const dim = result.rows[0].embedding_dinov2.length;
    const centroid = new Float32Array(dim);

    for (const row of result.rows) {
      const vec = row.embedding_dinov2 as Float32Array;
      for (let i = 0; i < dim; i++) centroid[i] += vec[i];
    }

    for (let i = 0; i < dim; i++) centroid[i] /= result.rows.length;

    const norm = Math.sqrt(centroid.reduce((s, v) => s + v * v, 0));
    if (norm > 0) for (let i = 0; i < dim; i++) centroid[i] /= norm;

    await this.config.pgPool.query(`
      UPDATE products SET embedding_centroid_dinov2 = $1 WHERE id = $2
    `, [JSON.stringify(Array.from(centroid)), productId]);
  }

  private async adjustFusionWeights(queryId: string, productId: string, delta: number): Promise<void> {
    await this.config.pgPool.query(`
      INSERT INTO fusion_weight_adjustments (query_id, product_id, adjustment, created_at)
      VALUES ($1, $2, $3, NOW())
    `, [queryId, productId, delta]);
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = this.buffer.splice(0, this.config.batchSize);
    console.log(`Flushing ${events.length} feedback events`);
  }

  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs);
  }

  async close(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush();
    await this.worker.close();
    await this.queue.close();
  }
}

export class ModelRetrainingPipeline {
  constructor(private pgPool: Pool) {}

  async retrainFusionWeights(): Promise<void> {
    const result = await this.pgPool.query(`
      SELECT
        fwa.adjustment,
        ql.final_score,
        ql.tier,
        ql.ai_used
      FROM fusion_weight_adjustments fwa
      JOIN query_log ql ON ql.query_id = fwa.query_id
      WHERE fwa.created_at > NOW() - INTERVAL '30 days'
    `);

    if (result.rows.length < 1000) {
      console.log('Insufficient data for retraining');
      return;
    }

    const features = result.rows.map(r => [
      r.tier === 'exact' ? 1 : 0,
      r.tier === 'high' ? 1 : 0,
      r.ai_used ? 1 : 0,
      r.final_score || 0,
    ]);
    const labels = result.rows.map(r => r.adjustment);

    const weights = this.trainLinear(features, labels);
    console.log('Retrained fusion weights:', weights);

    await this.pgPool.query(`
      INSERT INTO fusion_weights (weights, trained_at, sample_count)
      VALUES ($1, NOW(), $2)
    `, [JSON.stringify(weights), result.rows.length]);
  }

  private trainLinear(X: number[][], y: number[]): number[] {
    const n = X[0].length;
    const weights = new Array(n).fill(0);
    const lr = 0.01;
    const epochs = 100;

    for (let epoch = 0; epoch < epochs; epoch++) {
      for (let i = 0; i < X.length; i++) {
        let pred = 0;
        for (let j = 0; j < n; j++) pred += weights[j] * X[i][j];
        const error = pred - y[i];
        for (let j = 0; j < n; j++) weights[j] -= lr * error * X[i][j];
      }
    }

    return weights;
  }

  async retrainEmbeddings(): Promise<void> {
    console.log('Embedding retraining - placeholder for DINOv2 fine-tuning or centroid recomputation');
  }

  async pruneStaleFingerprints(): Promise<void> {
    await this.pgPool.query(`
      DELETE FROM product_images
      WHERE source = 'user_feedback'
      AND quality_score < 0.4
      AND created_at < NOW() - INTERVAL '90 days'
    `);
  }
}

export async function createFeedbackLoop(config: FeedbackConfig): Promise<FeedbackLoop> {
  const loop = new FeedbackLoop(config);
  await loop.initialize();
  return loop;
}