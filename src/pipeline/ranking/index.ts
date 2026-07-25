import { RankedResult, ProductCandidate, MatchSignals, SearchResult, AIResult, THRESHOLDS, AIModel, ULID, generateULID, tierFromScore, shouldUseAI, ResultTier } from '../types/core';
import { SearchCoordinator } from '../search';

export class RankingService {
  private learnedWeights: Map<string, number> = new Map();

  async rank(candidates: ProductCandidate[], fingerprint: any): Promise<RankedResult[]> {
    const results: RankedResult[] = [];

    for (const candidate of candidates) {
      const signals = this.computeSignals(candidate, fingerprint);
      const finalScore = this.fuseSignals(signals);
      const tier = tierFromScore(finalScore);
      const explanation = this.explain(signals, tier);

      results.push({ candidate, signals, finalScore, tier, explanation });
    }

    results.sort((a, b) => b.finalScore - a.finalScore);
    return results;
  }

  private computeSignals(candidate: ProductCandidate, fingerprint: any): MatchSignals {
    return {
      pHash: this.pHashSignal(candidate, fingerprint),
      vector: this.vectorSignal(candidate, fingerprint),
      ocr: this.ocrSignal(candidate, fingerprint),
      barcode: this.barcodeSignal(candidate, fingerprint),
      features: this.featureSignal(candidate, fingerprint),
      color: this.colorSignal(candidate, fingerprint),
      catalog: this.catalogSignal(candidate, fingerprint),
    };
  }

  private pHashSignal(candidate: ProductCandidate, fp: any): { score: number; distance: number } {
    if (!fp.pHash?.hash64) return { score: 0, distance: 64 };
    const minDist = candidate.fingerprints.phashCentroids.reduce(
      (min, centroid) => Math.min(min, this.hamming(fp.pHash.hash64, centroid)),
      64
    );
    return { score: 1 - minDist / 64, distance: minDist };
  }

  private vectorSignal(candidate: ProductCandidate, fp: any): { score: number; cosine: number } {
    if (!fp.embedding?.vector) return { score: 0, cosine: 0 };
    let maxCos = 0;
    for (const cent of candidate.embeddings) {
      const cos = this.cosine(fp.embedding.vector, cent);
      maxCos = Math.max(maxCos, cos);
    }
    return { score: Math.max(0, maxCos), cosine: maxCos };
  }

  private ocrSignal(candidate: ProductCandidate, fp: any): { exact: boolean; fuzzyScore: number; matchedCodes: string[] } {
    if (!fp.ocr?.productCodes?.length) return { exact: false, fuzzyScore: 0, matchedCodes: [] };
    const matched = fp.ocr.productCodes.filter((code: string) =>
      candidate.fingerprints.ocrTexts.some(t => t.includes(code))
    );
    const exact = matched.length > 0;
    return { exact, fuzzyScore: exact ? 1 : 0.5, matchedCodes: matched };
  }

  private barcodeSignal(candidate: ProductCandidate, fp: any): { matched: boolean; format?: string; value?: string } {
    if (!fp.barcode?.value) return { matched: false };
    const matched = candidate.fingerprints.barcodes.includes(fp.barcode.value);
    return { matched, format: fp.barcode.format, value: fp.barcode.value };
  }

  private featureSignal(candidate: ProductCandidate, fp: any): { inliers: number; homography: boolean; score: number } {
    if (!fp.features?.keypoints?.length) return { inliers: 0, homography: false, score: 0 };
    const inliers = this.geometricVerify(candidate.fingerprints.featureDescriptors, fp.features.descriptors);
    return { inliers, homography: inliers >= 10, score: Math.min(1, inliers / 50) };
  }

  private colorSignal(candidate: ProductCandidate, fp: any): { score: number; distance: number } {
    if (!fp.color?.hsv?.length) return { score: 0, distance: 1 };
    let minDist = 1;
    for (const cent of candidate.fingerprints.colorHistograms) {
      const dist = this.histogramDistance(fp.color.hsv, cent);
      minDist = Math.min(minDist, dist);
    }
    return { score: 1 - minDist, distance: minDist };
  }

  private catalogSignal(candidate: ProductCandidate, fp: any): { categoryMatch: boolean; attrMatch: number } {
    return { categoryMatch: true, attrMatch: 0.5 };
  }

  private fuseSignals(signals: MatchSignals): number {
    let score = 0;
    let totalWeight = 0;

    if (signals.barcode.matched) {
      score += 1 * 0.35;
      totalWeight += 0.35;
    }
    if (signals.ocr.exact) {
      score += signals.ocr.fuzzyScore * 0.25;
      totalWeight += 0.25;
    }
    if (signals.pHash.score > 0) {
      score += signals.pHash.score * 0.15;
      totalWeight += 0.15;
    }
    if (signals.vector.score > 0) {
      score += signals.vector.score * 0.15;
      totalWeight += 0.15;
    }
    if (signals.features.inliers > 0) {
      score += Math.min(1, signals.features.inliers / 50) * 0.10;
      totalWeight += 0.10;
    }
    if (signals.color.score > 0) {
      score += signals.color.score * 0.05;
      totalWeight += 0.05;
    }
    if (signals.catalog.categoryMatch) {
      score += signals.catalog.attrMatch * 0.05;
      totalWeight += 0.05;
    }

    let baseScore = totalWeight > 0 ? score / totalWeight : 0;

    const strongCount = [
      signals.barcode.matched,
      signals.ocr.exact && signals.ocr.fuzzyScore > 0.8,
      signals.pHash.score > 0.9,
      signals.vector.score > 0.85,
      signals.features.inliers > 20,
    ].filter(Boolean).length;

    if (strongCount >= 2) baseScore = Math.min(1, baseScore + 0.1 * (strongCount - 1));

    return baseScore;
  }

  private explain(signals: MatchSignals, tier: ResultTier): string {
    const parts: string[] = [];
    if (signals.barcode.matched) parts.push(`barcode (${signals.barcode.format})`);
    if (signals.ocr.exact) parts.push(`product code OCR: ${signals.ocr.matchedCodes.join(', ')}`);
    if (signals.pHash.score > 0.85) parts.push(`pHash ${(signals.pHash.score * 100).toFixed(0)}%`);
    if (signals.vector.score > 0.8) parts.push(`visual ${(signals.vector.score * 100).toFixed(0)}%`);
    if (signals.features.inliers > 15) parts.push(`${signals.features.inliers} feature inliers`);
    return parts.length > 0
      ? `Match via ${parts.join(', ')} — ${tier} confidence`
      : `No strong signals — ${tier} confidence`;
  }

  private hamming(a: bigint, b: bigint): number {
    let x = a ^ b;
    let count = 0;
    while (x !== 0n) { count++; x &= x - 1n; }
    return count;
  }

  private cosine(a: Float32Array, b: Float32Array): number {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  private geometricVerify(desc1: Buffer, desc2: Buffer): number {
    return Math.min(desc1.length, desc2.length);
  }

  private histogramDistance(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  updateWeights(weights: Map<string, number>): void {
    this.learnedWeights = new Map(weights);
  }
}

export class AIFallbackService {
  private geminiClient: any = null;
  private gemmaClient: any = null;

  constructor(
    private geminiApiKey: string,
    private gemmaEndpoint?: string
  ) {}

  async fallback(
    imageBuffer: Buffer,
    topCandidates: RankedResult[],
    fingerprint: any,
    model: AIModel = 'gemini-2.5-flash'
  ): Promise<AIResult> {
    const start = Date.now();

    if (model.startsWith('gemini')) {
      return this.geminiFallback(imageBuffer, topCandidates, fingerprint, model as AIModel, start);
    } else if (model.startsWith('gemma')) {
      return this.gemmaFallback(imageBuffer, topCandidates, fingerprint, model as AIModel, start);
    } else {
      return this.localFallback(imageBuffer, topCandidates, fingerprint, start);
    }
  }

  private async geminiFallback(
    imageBuffer: Buffer,
    candidates: RankedResult[],
    fp: any,
    model: AIModel,
    start: number
  ): Promise<AIResult> {
    if (!this.geminiClient) {
      const { GoogleGenAI } = await import('@google/genai');
      this.geminiClient = new GoogleGenAI({ apiKey: this.geminiApiKey });
    }

    const base64 = imageBuffer.toString('base64');
    const context = this.buildContext(candidates);

    const prompt = `Identify the product in this image. Context from visual search: ${context}

Return JSON only:
{
  "productId": "uuid or null",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "attributes": {}
}`;

    const response = await this.geminiClient.models.generateContent({
      model: model === 'gemini-2.5-flash' ? 'gemini-2.5-flash' : 'gemini-2.5-pro',
      contents: [
        { inlineData: { mimeType: 'image/jpeg', data: base64 } },
        { text: prompt },
      ],
      config: { responseMimeType: 'application/json', temperature: 0.1 },
    });

    const parsed = JSON.parse(response.text);
    const latency = Date.now() - start;

    return {
      prediction: { productId: parsed.productId, confidence: parsed.confidence, matchedImageId: '' },
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      model,
      latencyMs: latency,
      costUsd: this.estimateGeminiCost(latency, model),
    };
  }

  private async gemmaFallback(
    imageBuffer: Buffer,
    candidates: RankedResult[],
    fp: any,
    model: AIModel,
    start: number
  ): Promise<AIResult> {
    if (!this.gemmaClient) {
      this.gemmaClient = await import('node-llama-cpp');
    }

    const base64 = imageBuffer.toString('base64');
    const context = this.buildContext(candidates);

    const response = await this.gemmaClient.complete({
      prompt: `<|image|>${base64}<|end|>\nIdentify product. Context: ${context}\nJSON:`,
      maxTokens: 512,
      temperature: 0.1,
    });

    const parsed = JSON.parse(response.text);
    const latency = Date.now() - start;

    return {
      prediction: { productId: parsed.productId, confidence: parsed.confidence, matchedImageId: '' },
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      model,
      latencyMs: latency,
      costUsd: 0,
    };
  }

  private async localFallback(
    imageBuffer: Buffer,
    candidates: RankedResult[],
    fp: any,
    start: number
  ): Promise<AIResult> {
    const latency = Date.now() - start;
    return {
      prediction: { productId: '', confidence: 0, matchedImageId: '' },
      confidence: 0,
      reasoning: 'Local model not available',
      model: 'llava-local',
      latencyMs: latency,
      costUsd: 0,
    };
  }

  private buildContext(candidates: RankedResult[]): string {
    if (candidates.length === 0) return 'no candidates';
    return candidates.slice(0, 3).map(c =>
      `${c.candidate.name} (${c.tier}, ${c.finalScore.toFixed(2)})`
    ).join('; ');
  }

  private estimateGeminiCost(latencyMs: number, model: AIModel): number {
    const costPer1k = model === 'gemini-2.5-flash' ? 0.00015 : 0.00125;
    return (latencyMs / 1000) * costPer1k;
  }
}

export async function createPipeline(
  search: SearchCoordinator,
  ranker: RankingService,
  aiFallback: AIFallbackService,
  options: { aiThreshold: number; enableAI: boolean } = { aiThreshold: THRESHOLDS.AI_FALLBACK, enableAI: true }
) {
  return {
    async search(imageBuffer: Buffer, searchOptions: any = {}): Promise<SearchResult> {
      const queryId = generateULID();
      const start = Date.now();

      const { acquisition } = await import('../acquisition');
      const { preprocess } = await import('../preprocessing');
      const { createFingerprintExtractor } = await import('../fingerprint');

      const acquired = await acquisition.acquireImage(imageBuffer);
      const preprocessed = await preprocess(acquired);
      const extractor = createFingerprintExtractor();
      const fingerprint = await extractor.extract(preprocessed.variants.fingerprint);

      const results = await search.search(fingerprint, searchOptions);
      const ranked = await ranker.rank(results.map(r => r.candidate), fingerprint);

      let aiUsed = false;
      let aiResult: AIResult | undefined;

      if (options.enableAI && shouldUseAI(ranked[0]?.finalScore || 0, false)) {
        aiUsed = true;
        aiResult = await aiFallback.fallback(
          imageBuffer,
          ranked.slice(0, 5),
          fingerprint,
          'gemini-2.5-flash'
        );

        if (aiResult.confidence > 0.85 && aiResult.prediction.productId) {
          ranked.unshift({
            candidate: { productId: aiResult.prediction.productId } as any,
            signals: {} as any,
            finalScore: aiResult.confidence,
            tier: 'high',
            explanation: `AI fallback: ${aiResult.reasoning}`,
          });
        }
      }

      return {
        queryId,
        results: ranked,
        aiUsed,
        aiResult,
        latencyMs: Date.now() - start,
        timestamp: new Date(),
      };
    },
  };
}