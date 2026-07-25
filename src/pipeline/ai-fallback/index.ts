import { GoogleGenAI } from '@google/genai';
import { AIResult, AIFallbackRequest, AIModel, ProductPrediction, CategoryPrediction, RankedResult, FingerprintResult, ULID } from '../types/core';

export class AIFallbackService {
  private gemini: GoogleGenAI | null = null;
  private gemmaEndpoint: string | null = null;

  constructor() {
    if (process.env.GEMINI_API_KEY) {
      this.gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    this.gemmaEndpoint = process.env.GEMMA_ENDPOINT || null;
  }

  async fallback(request: AIFallbackRequest): Promise<AIResult> {
    const model = this.selectModel(request);
    const startTime = Date.now();

    try {
      let result: AIResult;

      switch (model) {
        case 'gemini-2.5-flash':
          result = await this.geminiFallback(request);
          break;
        case 'gemma-3-27b':
          result = await this.gemmaFallback(request);
          break;
        case 'local-llava':
          result = await this.llavaFallback(request);
          break;
        default:
          throw new Error(`Unknown model: ${model}`);
      }

      result.latencyMs = Date.now() - startTime;
      return result;
    } catch (err) {
      console.error('AI fallback failed:', err);
      return this.errorResult(model, Date.now() - startTime, String(err));
    }
  }

  private selectModel(request: AIFallbackRequest): AIModel {
    if (process.env.GEMINI_API_KEY && request.options?.forceGemini) {
      return 'gemini-2.5-flash';
    }
    if (this.gemmaEndpoint) {
      return 'gemma-3-27b';
    }
    return 'local-llava';
  }

  private async geminiFallback(request: AIFallbackRequest): Promise<AIResult> {
    if (!this.gemini) throw new Error('Gemini not configured');

    const imagePart = {
      inlineData: {
        mimeType: 'image/jpeg',
        data: request.image.buffer.toString('base64'),
      },
    };

    const context = request.topCandidates.length > 0
      ? `Top candidates from visual search:\n${request.topCandidates.map((c, i) =>
          `${i + 1}. ${c.candidate.name} (${c.candidate.brand}) - score: ${c.finalScore.toFixed(2)}`
        ).join('\n')}`
      : 'No strong visual matches found.';

    const prompt = `You are a product identification expert. ${context}

Analyze the provided image and identify the product. Look for:
- Brand logos, text, distinctive packaging
- Barcodes, QR codes, model numbers
- Color scheme, shape, materials
- Category indicators (electronics, clothing, food, etc.)

Respond with JSON only:
{
  "productId": "uuid-or-null",
  "confidence": 0.0-1.0,
  "reasoning": "detailed explanation",
  "attributes": {"color": "...", "category": "..."}
}`;

    const response = await this.gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 512,
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const costUsd = this.estimateGeminiCost(response.usageMetadata);

    return {
      prediction: {
        productId: parsed.productId,
        confidence: parsed.confidence,
        matchedImageId: '',
      },
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      model: 'gemini-2.5-flash',
      latencyMs: 0,
      costUsd,
    };
  }

  private async gemmaFallback(request: AIFallbackRequest): Promise<AIResult> {
    const response = await fetch(`${this.gemmaEndpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma-3-27b',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: this.buildPrompt(request) },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${request.image.buffer.toString('base64')}` } },
          ],
        }],
        temperature: 0.1,
        max_tokens: 512,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    return {
      prediction: {
        productId: parsed.productId,
        confidence: parsed.confidence,
        matchedImageId: '',
      },
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      model: 'gemma-3-27b',
      latencyMs: 0,
      costUsd: 0,
    };
  }

  private async llavaFallback(request: AIFallbackRequest): Promise<AIResult> {
    return {
      prediction: {
        productId: '',
        confidence: 0.3,
        matchedImageId: '',
      },
      confidence: 0.3,
      reasoning: 'Local LLaVA not configured - using placeholder',
      model: 'local-llava',
      latencyMs: 0,
      costUsd: 0,
    };
  }

  private buildPrompt(request: AIFallbackRequest): string {
    const context = request.topCandidates.length > 0
      ? `Visual search found: ${request.topCandidates.slice(0, 3).map(c => c.candidate.name).join(', ')}.`
      : 'No strong visual matches.';

    return `${context} Identify the product in this image. Return JSON: {"productId": "uuid|null", "confidence": 0.0-1.0, "reasoning": "...", "attributes": {}}`;
  }

  private estimateGeminiCost(usage: any): number {
    if (!usage) return 0.001;
    const inputTokens = usage.promptTokenCount || 0;
    const outputTokens = usage.candidatesTokenCount || 0;
    return (inputTokens * 0.000075 + outputTokens * 0.0003) / 1000;
  }

  private errorResult(model: AIModel, latencyMs: number, error: string): AIResult {
    return {
      prediction: { productId: '', confidence: 0, matchedImageId: '' },
      confidence: 0,
      reasoning: `AI fallback failed: ${error}`,
      model,
      latencyMs,
      costUsd: 0,
    };
  }
}

export function shouldTriggerAI(
  topScore: number,
  options: { threshold?: number; forceAI?: boolean } = {}
): boolean {
  if (options.forceAI) return true;
  const threshold = options.threshold ?? 0.60;
  return topScore < threshold;
}

export function mergeAIResult(
  searchResults: RankedResult[],
  aiResult: AIResult,
  aiWeight = 0.3
): RankedResult[] {
  if (!aiResult.prediction.productId) return searchResults;

  const existing = searchResults.find(r => r.candidate.productId === aiResult.prediction.productId);
  if (existing) {
    existing.finalScore = Math.max(existing.finalScore, aiResult.confidence * aiWeight);
    existing.explanation += ` | AI suggested (conf: ${aiResult.confidence.toFixed(2)})`;
    return searchResults;
  }

  const aiCandidate: RankedResult = {
    candidate: {
      productId: aiResult.prediction.productId,
      sku: '',
      name: 'AI Prediction',
      brand: '',
      category: [],
      images: [],
      price: { amount: 0, currency: 'EUR' },
      availability: { inStock: true },
      attributes: aiResult.prediction.productId ? {} : {},
      embeddings: [],
      fingerprints: {},
      matchSignals: {
        pHash: { distance: 0, score: 0 },
        vector: { cosine: 0, score: 0 },
        ocr: { exact: false, fuzzyScore: 0 },
        barcode: { matched: false, format: '' },
        features: { inliers: 0, homography: false },
        color: { distance: 0, score: 0 },
        catalog: { categoryMatch: false, attrMatch: 0 },
      },
    },
    signals: {
      pHash: { distance: 0, score: 0 },
      vector: { cosine: 0, score: 0 },
      ocr: { exact: false, fuzzyScore: 0 },
      barcode: { matched: false, format: '' },
      features: { inliers: 0, homography: false },
      color: { distance: 0, score: 0 },
      catalog: { categoryMatch: false, attrMatch: 0 },
    },
    finalScore: aiResult.confidence * aiWeight,
    tier: 'low',
    explanation: `AI fallback (${aiResult.model}): ${aiResult.reasoning}`,
  };

  return [aiCandidate, ...searchResults].sort((a, b) => b.finalScore - a.finalScore);
}