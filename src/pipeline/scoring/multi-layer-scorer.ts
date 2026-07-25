import {
  QueryProfile,
  ProductProfile,
  MultiLayerScore,
  ScoredCandidate,
  LayerScore,
  Evidence,
  BarcodeSignal,
  OCRSignal,
  VisualSignal,
  PackagingSignal,
  SemanticSignal,
  QualitySignal,
  cosineSimilarity,
  hammingDistance,
  pHashSimilarity,
  histogramDistance,
} from '../types/product-profile';
import { ScorerWeights, DEFAULT_WEIGHTS } from './ambiguity-resolver';

export class MultiLayerScorer {
  private weights: ScorerWeights;
  private deterministicThreshold = 0.99;
  private highConfidenceThreshold = 0.85;
  private mediumConfidenceThreshold = 0.65;
  private ambiguityThreshold = 0.45;
  private maxScoreGapForAmbiguity = 0.15;

  constructor(weights: Partial<ScorerWeights> = {}) {
    this.weights = this.mergeWeights(DEFAULT_WEIGHTS, weights);
  }

  private mergeWeights(defaults: ScorerWeights, custom: Partial<ScorerWeights>): ScorerWeights {
    return {
      deterministic: { ...defaults.deterministic, ...custom.deterministic },
      probabilistic: { ...defaults.probabilistic, ...custom.probabilistic },
      packaging: { ...defaults.packaging, ...custom.packaging },
      semantic: { ...defaults.semantic, ...custom.semantic },
    };
  }

  updateWeights(newWeights: Partial<ScorerWeights>): void {
    this.weights = this.mergeWeights(this.weights, newWeights);
  }

  score(query: QueryProfile, product: ProductProfile): MultiLayerScore {
    // Layer 1: Deterministic (exact matches)
    const deterministic = this.scoreDeterministic(query, product);
    
    // Early exit if exact match found
    if (deterministic.matched && deterministic.score >= this.deterministicThreshold) {
      return this.buildFinalScore(
        deterministic,
        { layer: 'probabilistic', score: 0, evidence: [], matched: false },
        { layer: 'packaging', score: 0, evidence: [], matched: false },
        { layer: 'semantic', score: 0, evidence: [], matched: false }
      );
    }

    // Layer 2: Probabilistic visual
    const probabilistic = this.scoreProbabilistic(query, product);
    
    // Layer 3: Packaging
    const packaging = this.scorePackaging(query, product);
    
    // Layer 4: Semantic
    const semantic = this.scoreSemantic(query, product);

    // Compute agreement bonus
    const agreementBonus = this.computeAgreementBonus(
      deterministic,
      probabilistic,
      packaging,
      semantic
    );

    return this.buildFinalScore(deterministic, probabilistic, packaging, semantic, agreementBonus);
  }

  private scoreDeterministic(query: QueryProfile, product: ProductProfile): LayerScore {
    const evidence: Evidence[] = [];
    let maxScore = 0;
    let matchedLayer: string | null = null;

    // Barcode exact match
    if (query.barcode.primary && product.barcode.primary) {
      const match = query.barcode.primary === product.barcode.primary;
      const score = match ? 1.0 : 0;
      if (score > maxScore) {
        maxScore = score;
        matchedLayer = 'barcode';
      }
      evidence.push({
        signal: 'barcode',
        value: query.barcode.primary,
        weight: this.weights.deterministic.barcode,
        details: match 
          ? `Exact barcode match: ${query.barcode.primary}`
          : `Barcode mismatch: ${query.barcode.primary} vs ${product.barcode.primary}`,
      });
    }

    // Barcode variant match
    if (query.barcode.primary && product.barcode.variants.includes(query.barcode.primary)) {
      const score = 0.95;
      if (score > maxScore) {
        maxScore = score;
        matchedLayer = 'barcode_variant';
      }
      evidence.push({
        signal: 'barcode_variant',
        value: query.barcode.primary,
        weight: this.weights.deterministic.barcode * 0.95,
        details: `Barcode variant match: ${query.barcode.primary}`,
      });
    }

    // OCR product code exact match
    const ocrMatch = this.matchOCRCodes(query.ocr, product.ocr);
    if (ocrMatch.matched) {
      const score = 0.95;
      if (score > maxScore) {
        maxScore = score;
        matchedLayer = 'product_code';
      }
      evidence.push({
        signal: 'product_code',
        value: ocrMatch.matchedCode || '',
        weight: this.weights.deterministic.productCode,
        details: `Exact product code match: ${ocrMatch.matchedCode}`,
      });
    }

    // Exact OCR text match (brand/model)
    const exactOCRMatch = this.matchExactOCR(query.ocr, product.ocr);
    if (exactOCRMatch.matched) {
      const score = 0.9;
      if (score > maxScore) {
        maxScore = score;
        matchedLayer = 'exact_ocr';
      }
      evidence.push({
        signal: 'exact_ocr',
        value: exactOCRMatch.matchedText || '',
        weight: this.weights.deterministic.exactOCR,
        details: `Exact OCR text match: ${exactOCRMatch.matchedText}`,
      });
    }

    return {
      layer: 'deterministic',
      score: maxScore,
      evidence,
      matched: maxScore >= this.deterministicThreshold,
    };
  }

  private matchOCRCodes(queryOCR: OCRSignal, productOCR: OCRSignal): { matched: boolean; matchedCode?: string } {
    const queryCodes = new Set(queryOCR.productCodes.map(c => c.code));
    for (const code of productOCR.productCodes) {
      if (queryCodes.has(code.code)) {
        return { matched: true, matchedCode: code.code };
      }
    }
    return { matched: false };
  }

  private matchExactOCR(queryOCR: OCRSignal, productOCR: OCRSignal): { matched: boolean; matchedText?: string } {
    // Check brand names in OCR
    for (const qBrand of queryOCR.brandDetections) {
      for (const pBrand of productOCR.brandDetections) {
        if (qBrand.brand.toLowerCase() === pBrand.brand.toLowerCase()) {
          return { matched: true, matchedText: qBrand.brand };
        }
      }
    }
    return { matched: false };
  }

  private scoreProbabilistic(query: QueryProfile, product: ProductProfile): LayerScore {
    const evidence: Evidence[] = [];

    // pHash similarity
    let bestPHash = 0;
    for (const qHash of [query.visual.pHash.centroids[0]]) {
      for (const pHash of product.visual.pHash.centroids) {
        bestPHash = Math.max(bestPHash, pHashSimilarity(qHash, pHash));
      }
    }
    evidence.push({
      signal: 'pHash',
      value: bestPHash,
      weight: this.weights.probabilistic.pHash,
      details: `pHash similarity: ${(bestPHash * 100).toFixed(1)}%`,
    });

    // Embedding similarity (DINOv2)
    let bestEmbedding = 0;
    const qEmb = query.visual.embeddings.dinov2.centroid;
    for (const pEmb of [product.visual.embeddings.dinov2.centroid]) {
      bestEmbedding = Math.max(bestEmbedding, cosineSimilarity(qEmb, pEmb));
    }
    evidence.push({
      signal: 'embedding_dinov2',
      value: bestEmbedding,
      weight: this.weights.probabilistic.embedding,
      details: `DINOv2 embedding cosine: ${(bestEmbedding * 100).toFixed(1)}%`,
    });

    // Color histogram
    const colorDist = histogramDistance(query.visual.color.hsvHistogram, product.visual.color.hsvHistogram);
    const colorSim = Math.max(0, 1 - colorDist);
    evidence.push({
      signal: 'color',
      value: colorSim,
      weight: this.weights.probabilistic.color,
      details: `Color histogram similarity: ${(colorSim * 100).toFixed(1)}%`,
    });

    // Local features (simplified - would use geometric verification)
    const featureSim = query.visual.localFeatures.keypointClusters.length > 0 && 
                       product.visual.localFeatures.keypointClusters.length > 0 ? 0.5 : 0;
    evidence.push({
      signal: 'features',
      value: featureSim,
      weight: this.weights.probabilistic.features,
      details: `Local feature match: ${featureSim > 0 ? 'yes' : 'no'}`,
    });

    // Weighted fusion
    let weightedSum = 0;
    let totalWeight = 0;
    for (const e of evidence) {
      weightedSum += e.value * e.weight;
      totalWeight += e.weight;
    }

    return {
      layer: 'probabilistic',
      score: totalWeight > 0 ? weightedSum / totalWeight : 0,
      evidence,
      matched: false,
    };
  }

  private scorePackaging(query: QueryProfile, product: ProductProfile): LayerScore {
    const evidence: Evidence[] = [];

    // Shape similarity
    const shapeSim = this.compareShapes(query.packaging.shape, product.packaging.shape);
    evidence.push({
      signal: 'shape',
      value: shapeSim,
      weight: this.weights.packaging.shape,
      details: `Shape similarity (${query.packaging.shape.type} vs ${product.packaging.shape.type}): ${(shapeSim * 100).toFixed(0)}%`,
    });

    // Logo similarity
    let bestLogo = 0;
    for (const qLogo of query.packaging.logos) {
      for (const pLogo of product.packaging.logos) {
        if (qLogo.brand && pLogo.brand && qLogo.brand === pLogo.brand) {
          bestLogo = 1.0;
        } else if (qLogo.embedding.length > 0 && pLogo.embedding.length > 0) {
          bestLogo = Math.max(bestLogo, cosineSimilarity(qLogo.embedding, pLogo.embedding));
        }
      }
    }
    evidence.push({
      signal: 'logo',
      value: bestLogo,
      weight: this.weights.packaging.logo,
      details: bestLogo > 0.8 ? 'Same brand logo detected' : bestLogo > 0 ? 'Similar logo' : 'No logo match',
    });

    // Layout similarity (simplified)
    const layoutSim = 0; // Would compare layout signatures
    evidence.push({
      signal: 'layout',
      value: layoutSim,
      weight: this.weights.packaging.layout,
      details: 'Layout comparison not yet implemented',
    });

    let weightedSum = 0;
    let totalWeight = 0;
    for (const e of evidence) {
      weightedSum += e.value * e.weight;
      totalWeight += e.weight;
    }

    return {
      layer: 'packaging',
      score: totalWeight > 0 ? weightedSum / totalWeight : 0,
      evidence,
      matched: false,
    };
  }

  private compareShapes(q: any, p: any): number {
    if (q.type !== p.type) return 0.3; // Different type but could be similar
    
    let sim = 1.0;
    // Aspect ratio similarity
    const arDiff = Math.abs(q.aspectRatio - p.aspectRatio) / Math.max(q.aspectRatio, p.aspectRatio);
    sim *= (1 - arDiff * 0.5);
    
    // Symmetry
    sim *= (1 - Math.abs(q.symmetry.vertical - p.symmetry.vertical) * 0.2);
    
    return Math.max(0, sim);
  }

  private scoreSemantic(query: QueryProfile, product: ProductProfile): LayerScore {
    const evidence: Evidence[] = [];

    // Category consistency
    const categoryMatch = this.compareCategoryPaths(
      query.semantic.category.path,
      product.semantic.category.path
    );
    evidence.push({
      signal: 'category',
      value: categoryMatch,
      weight: this.weights.semantic.category,
      details: `Category match: ${query.semantic.category.path.join(' > ')} vs ${product.semantic.category.path.join(' > ')}`,
    });

    // Attribute consistency
    const attrSim = this.compareAttributes(query.semantic.attributes, product.semantic.attributes);
    evidence.push({
      signal: 'attributes',
      value: attrSim,
      weight: this.weights.semantic.attributes,
      details: `Attribute similarity: ${(attrSim * 100).toFixed(0)}%`,
    });

    // Brand consistency
    let brandSim = 0;
    if (query.semantic.brand.brandId && product.semantic.brand.brandId) {
      brandSim = query.semantic.brand.brandId === product.semantic.brand.brandId ? 1.0 : 0;
    } else if (query.semantic.brand.name && product.semantic.brand.name) {
      brandSim = query.semantic.brand.name.toLowerCase() === product.semantic.brand.name.toLowerCase() ? 1.0 : 0;
    }
    evidence.push({
      signal: 'brand',
      value: brandSim,
      weight: this.weights.semantic.brand,
      details: brandSim > 0 ? 'Same brand' : 'Different brands',
    });

    // Price tier consistency
    const priceSim = this.comparePriceTiers(query.semantic.priceTier, product.semantic.priceTier);
    evidence.push({
      signal: 'price_tier',
      value: priceSim,
      weight: this.weights.semantic.priceTier,
      details: `Price tier: ${query.semantic.priceTier.tier} vs ${product.semantic.priceTier.tier}`,
    });

    let weightedSum = 0;
    let totalWeight = 0;
    for (const e of evidence) {
      weightedSum += e.value * e.weight;
      totalWeight += e.weight;
    }

    return {
      layer: 'semantic',
      score: totalWeight > 0 ? weightedSum / totalWeight : 0,
      evidence,
      matched: false,
    };
  }

  private compareCategoryPaths(q: string[], p: string[]): number {
    if (q.length === 0 || p.length === 0) return 0.3;
    
    let matchDepth = 0;
    for (let i = 0; i < Math.min(q.length, p.length); i++) {
      if (q[i] === p[i]) matchDepth++;
      else break;
    }
    
    return matchDepth / Math.max(q.length, p.length);
  }

  private compareAttributes(q: any, p: any): number {
    const keys = ['color', 'size', 'volume', 'weight', 'material', 'flavor', 'packaging'] as const;
    let matches = 0;
    let total = 0;
    
    for (const key of keys) {
      const qv = q[key]?.value;
      const pv = p[key]?.value;
      if (qv !== null && pv !== null) {
        total++;
        if (String(qv).toLowerCase() === String(pv).toLowerCase()) matches++;
      }
    }
    
    return total > 0 ? matches / total : 0.5;
  }

  private comparePriceTiers(q: any, p: any): number {
    const tiers = { budget: 0, mid: 1, premium: 2, luxury: 3 };
    const qTier = tiers[q.tier as keyof typeof tiers] ?? 1;
    const pTier = tiers[p.tier as keyof typeof tiers] ?? 1;
    return 1 - Math.abs(qTier - pTier) / 3;
  }

  private computeAgreementBonus(
    det: LayerScore,
    prob: LayerScore,
    pack: LayerScore,
    sem: LayerScore
  ): number {
    const strongSignals = [
      det.score > 0.95,
      prob.score > 0.8,
      pack.score > 0.7,
      sem.score > 0.8,
    ].filter(Boolean).length;

    if (strongSignals >= 2) return 0.05 * (strongSignals - 1);
    if (strongSignals >= 3) return 0.1 + 0.05 * (strongSignals - 2);
    return 0;
  }

  private buildFinalScore(
    deterministic: LayerScore,
    probabilistic: LayerScore,
    packaging: LayerScore,
    semantic: LayerScore,
    agreementBonus = 0
  ): MultiLayerScore {
    // Layer weights for final fusion
    const layerWeights = {
      deterministic: 0.50,
      probabilistic: 0.30,
      packaging: 0.10,
      semantic: 0.10,
    };

    let fusedScore = 0;
    fusedScore += deterministic.score * layerWeights.deterministic;
    fusedScore += probabilistic.score * layerWeights.probabilistic;
    fusedScore += packaging.score * layerWeights.packaging;
    fusedScore += semantic.score * layerWeights.semantic;
    fusedScore = Math.min(1, fusedScore + agreementBonus);

    // Determine confidence tier
    let confidence: MultiLayerScore['confidence'];
    let requiresAI = false;

    if (deterministic.matched && deterministic.score >= this.deterministicThreshold) {
      confidence = 'exact';
    } else if (fusedScore >= this.highConfidenceThreshold) {
      confidence = 'high';
    } else if (fusedScore >= this.mediumConfidenceThreshold) {
      confidence = 'medium';
    } else if (fusedScore >= this.ambiguityThreshold) {
      confidence = 'low';
      requiresAI = true;
    } else {
      confidence = 'ambiguous';
      requiresAI = true;
    }

    // Build breakdown for debugging
    const breakdown = {
      barcode: deterministic.evidence.find(e => e.signal === 'barcode')?.value || 0,
      ocr: deterministic.evidence.find(e => e.signal === 'exact_ocr')?.value || 0,
      pHash: probabilistic.evidence.find(e => e.signal === 'pHash')?.value || 0,
      embedding: probabilistic.evidence.find(e => e.signal === 'embedding_dinov2')?.value || 0,
      color: probabilistic.evidence.find(e => e.signal === 'color')?.value || 0,
      features: probabilistic.evidence.find(e => e.signal === 'features')?.value || 0,
      shape: packaging.evidence.find(e => e.signal === 'shape')?.value || 0,
      logo: packaging.evidence.find(e => e.signal === 'logo')?.value || 0,
      layout: packaging.evidence.find(e => e.signal === 'layout')?.value || 0,
      category: semantic.evidence.find(e => e.signal === 'category')?.value || 0,
      attributes: semantic.evidence.find(e => e.signal === 'attributes')?.value || 0,
      brand: semantic.evidence.find(e => e.signal === 'brand')?.value || 0,
    };

    return {
      deterministic,
      probabilistic,
      packaging,
      semantic,
      fusedScore,
      confidence,
      requiresAI,
      breakdown,
    };
  }

  async scoreCandidates(query: QueryProfile, products: ProductProfile[]): Promise<ScoredCandidate[]> {
    const scored: ScoredCandidate[] = [];
    
    for (const product of products) {
      const score = this.score(query, product);
      scored.push({ product, score, rank: 0 });
    }
    
    // Sort by fused score descending
    scored.sort((a, b) => b.score.fusedScore - a.score.fusedScore);
    
    // Assign ranks
    scored.forEach((s, i) => { s.rank = i + 1; });
    
    return scored;
  }
}

export async function createMultiLayerScorer(
  weights?: Partial<ScorerWeights>
): Promise<MultiLayerScorer> {
  return new MultiLayerScorer(weights);
}