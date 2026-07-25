import { Pool } from 'pg';
import {
  ProductProfile,
  QueryProfile,
  MultiLayerScore,
  ScoredCandidate,
  ProfileUpdate,
  ULID,
  BarcodeSignal,
  OCRSignal,
  VisualSignal,
  PackagingSignal,
  SemanticSignal,
  CorrectionEvent,
  updateCentroid,
  mergePHashCentroids,
} from '../types/product-profile';
import { ProductProfileBuilder } from '../product-profile/builder';

export interface UpdateConfig {
  autoReinforceThreshold: number;  // Score above which to auto-reinforce
  autoWeakenThreshold: number;     // Score below which to auto-weaken
  maxCentroidsPerProduct: number;  // Max pHash centroids to store
  learningRate: number;            // For embedding centroid updates
}

const DEFAULT_CONFIG: UpdateConfig = {
  autoReinforceThreshold: 0.85,
  autoWeakenThreshold: 0.3,
  maxCentroidsPerProduct: 20,
  learningRate: 0.1,
};

export class ProfileUpdater {
  private builder: ProductProfileBuilder;
  private config: UpdateConfig;

  constructor(pg: Pool, config: Partial<UpdateConfig> = {}) {
    this.builder = new ProductProfileBuilder(pg);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async processFeedback(update: ProfileUpdate): Promise<void> {
    const product = await this.builder.build(update.productId);
    if (!product) {
      console.warn(`Product ${update.productId} not found for feedback update`);
      return;
    }

    switch (update.action) {
      case 'accepted':
        await this.reinforce(product, update);
        break;
      case 'rejected':
        await this.weaken(product, update);
        break;
      case 'corrected':
        if (update.correctionTargetId) {
          await this.correct(product, update);
        }
        break;
    }
  }

  private async reinforce(product: ProductProfile, update: ProfileUpdate): Promise<void> {
    product.totalQueries++;
    product.acceptedCount++;
    product.confidence = Math.min(1, product.confidence + 0.01);
    product.version++;

    // Add to correction history
    product.correctionHistory.push({
      fromQueryId: update.queryId,
      toProductId: update.productId,
      timestamp: new Date(),
      wasFalsePositive: false,
    });

    // Reinforce deterministic signals
    if (update.reinforcement.barcode && update.newVisualData?.pHash) {
      // Barcode already in profile, just ensure it's primary
    }

    if (update.reinforcement.ocr) {
      // Could add new OCR codes
    }

    // Reinforce visual signals
    if (update.reinforcement.visual && update.newVisualData?.pHash) {
      const newHash = update.newVisualData.pHash.centroids[0];
      product.visual.pHash.centroids = mergePHashCentroids(
        product.visual.pHash.centroids,
        newHash,
        12
      ).slice(0, this.config.maxCentroidsPerProduct);
      
      product.visual.pHash.sampleCount++;
      product.visual.pHash.radius = Math.max(
        product.visual.pHash.radius,
        this.computeMaxDistance(product.visual.pHash.centroids)
      );
    }

    if (update.reinforcement.visual && update.newVisualData?.embeddings) {
      // Update DINOv2 centroid with running average
      const updateResult = updateCentroid(
        product.visual.embeddings.dinov2.centroid,
        product.visual.embeddings.dinov2.count,
        update.newVisualData.embeddings.dinov2.centroid
      );
      product.visual.embeddings.dinov2.centroid = updateResult.centroid;
      product.visual.embeddings.dinov2.count = updateResult.count;
      
      // Update variance
      product.visual.embeddings.dinov2.variance = this.updateVariance(
        product.visual.embeddings.dinov2.variance,
        update.newVisualData.embeddings.dinov2.centroid,
        product.visual.embeddings.dinov2.centroid,
        product.visual.embeddings.dinov2.count
      );
    }

    // Reinforce color profile
    if (update.reinforcement.visual && update.newVisualData?.color) {
      product.visual.color = this.mergeColorProfiles(
        product.visual.color,
        update.newVisualData.color,
        this.config.learningRate
      );
    }

    // Reinforce packaging
    if (update.reinforcement.packaging && update.newPackagingData) {
      product.packaging = this.mergePackagingProfiles(
        product.packaging,
        update.newPackagingData
      );
    }

    // Reinforce semantic
    if (update.reinforcement.semantic && update.newSemanticData) {
      product.semantic = this.mergeSemanticProfiles(
        product.semantic,
        update.newSemanticData
      );
    }

    await this.builder.save(product);
  }

  private async weaken(product: ProductProfile, update: ProfileUpdate): Promise<void> {
    product.totalQueries++;
    product.rejectedCount++;
    product.confidence = Math.max(0, product.confidence - 0.02);
    product.version++;

    // Add to false positives
    product.falsePositives.push(update.productId);
    
    // Add to correction history
    product.correctionHistory.push({
      fromQueryId: update.queryId,
      toProductId: update.productId,
      timestamp: new Date(),
      wasFalsePositive: true,
    });

    await this.builder.save(product);
  }

  private async correct(wrongProduct: ProductProfile, update: ProfileUpdate): Promise<void> {
    // Weaken the wrong product
    wrongProduct.falsePositives.push(update.correctionTargetId!);
    wrongProduct.rejectedCount++;
    wrongProduct.correctionHistory.push({
      fromQueryId: update.queryId,
      toProductId: update.correctionTargetId!,
      timestamp: new Date(),
      wasFalsePositive: true,
    });

    // Strengthen the correct product
    const correctProduct = await this.builder.build(update.correctionTargetId!);
    if (correctProduct) {
      correctProduct.falseNegatives.push(wrongProduct.productId);
      correctProduct.acceptedCount++;
      
      correctProduct.correctionHistory.push({
        fromQueryId: update.queryId,
        toProductId: update.correctionTargetId!,
        timestamp: new Date(),
        wasFalsePositive: false,
      });

      // Transfer visual data from query to correct product
      if (update.newVisualData) {
        // Same logic as reinforce
        const newHash = update.newVisualData.pHash?.centroids[0];
        if (newHash) {
          correctProduct.visual.pHash.centroids = mergePHashCentroids(
            correctProduct.visual.pHash.centroids,
            newHash,
            12
          ).slice(0, this.config.maxCentroidsPerProduct);
        }
      }

      await this.builder.save(correctProduct);
    }

    await this.builder.save(wrongProduct);
  }

  // Helper methods for profile merging
  private computeMaxDistance(centroids: bigint[]): number {
    let maxDist = 0;
    for (let i = 0; i < centroids.length; i++) {
      for (let j = i + 1; j < centroids.length; j++) {
        const dist = this.hammingDistance(centroids[i], centroids[j]);
        maxDist = Math.max(maxDist, dist);
      }
    }
    return maxDist;
  }

  private hammingDistance(a: bigint, b: bigint): number {
    let x = a ^ b;
    let count = 0;
    while (x !== 0n) { count++; x &= x - 1n; }
    return count;
  }

  private updateVariance(
    currentVar: Float32Array,
    newVector: Float32Array,
    newCentroid: Float32Array,
    count: number
  ): Float32Array {
    // Welford's online algorithm for variance
    const updated = new Float32Array(currentVar.length);
    for (let i = 0; i < currentVar.length; i++) {
      const diff = newVector[i] - newCentroid[i];
      // This is simplified; real implementation would track M2
      updated[i] = (currentVar[i] * (count - 1) + diff * diff) / count;
    }
    return updated;
  }

  private mergeColorProfiles(
    existing: any,
    newColor: any,
    lr: number
  ): any {
    const merged = { ...existing };
    
    // Blend histograms
    if (existing.hsvHistogram && newColor.hsvHistogram) {
      merged.hsvHistogram = new Float32Array(existing.hsvHistogram.length);
      for (let i = 0; i < existing.hsvHistogram.length; i++) {
        merged.hsvHistogram[i] = existing.hsvHistogram[i] * (1 - lr) + newColor.hsvHistogram[i] * lr;
      }
    }

    // Merge dominant colors (keep unique)
    const allColors = [...existing.dominant, ...newColor.dominant];
    const unique = new Map<string, { r: number; g: number; b: number }>();
    for (const c of allColors) {
      const key = `${c.r},${c.g},${c.b}`;
      if (!unique.has(key)) unique.set(key, c);
    }
    merged.dominant = Array.from(unique.values()).slice(0, 5);

    return merged;
  }

  private mergePackagingProfiles(
    existing: PackagingSignal,
    newData: Partial<PackagingSignal>
  ): PackagingSignal {
    const merged = { ...existing };
    
    if (newData.shape) {
      merged.shape = { ...existing.shape, ...newData.shape };
    }
    
    if (newData.logos && newData.logos.length > 0) {
      // Add new logos not already present
      for (const logo of newData.logos) {
        const exists = merged.logos.some(l => 
          l.brand === logo.brand && l.position === logo.position
        );
        if (!exists) merged.logos.push(logo);
      }
    }
    
    return merged;
  }

  private mergeSemanticProfiles(
    existing: SemanticSignal,
    newData: Partial<SemanticSignal>
  ): SemanticSignal {
    const merged = { ...existing };
    
    if (newData.attributes) {
      // Merge attributes - keep highest confidence
      for (const [key, value] of Object.entries(newData.attributes)) {
        const existingAttr = existing.attributes[key as keyof typeof existing.attributes];
        if (!existingAttr || value.confidence > existingAttr.confidence) {
          (merged.attributes as any)[key] = value;
        }
      }
    }
    
    return merged;
  }

  // Batch retraining of fusion weights
  async retrainFusionWeights(): Promise<void> {
    // This would query the query_log and feedback_events tables
    // and retrain the scorer weights using gradient descent or XGBoost
    console.log('Retraining fusion weights...');
    // Implementation would go here
  }
}

export async function createProfileUpdater(
  pg: Pool,
  config?: Partial<UpdateConfig>
): Promise<ProfileUpdater> {
  return new ProfileUpdater(pg, config);
}