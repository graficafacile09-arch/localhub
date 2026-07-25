import { MultiLayerScorer } from './multi-layer-scorer';
import { AIFallbackService } from '../ai-fallback';
import {
  QueryProfile,
  ProductProfile,
  ScoredCandidate,
  MultiLayerScore,
  AIResolution,
  AIResolutionRequest,
  AIModel,
} from '../types/product-profile';

export interface AmbiguityConfig {
  minScoreForAI: number;          // Minimum fused score to consider AI
  maxScoreGap: number;            // Max gap between top candidates for ambiguity
  maxCandidatesForAI: number;     // Max candidates to send to AI
  confidenceThreshold: number;    // AI confidence needed to accept
}

const DEFAULT_CONFIG: AmbiguityConfig = {
  minScoreForAI: 0.45,
  maxScoreGap: 0.15,
  maxCandidatesForAI: 3,
  confidenceThreshold: 0.7,
};

export class AmbiguityResolver {
  private ai: AIFallbackService;
  private config: AmbiguityConfig;

  constructor(ai: AIFallbackService, config: Partial<AmbiguityConfig> = {}) {
    this.ai = ai;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async resolve(
    query: QueryProfile,
    scored: ScoredCandidate[],
    scoreThreshold: number
  ): Promise<{ resolved: boolean; result: AIResolution | null; reason: string }> {
    if (scored.length === 0) {
      return { resolved: false, result: null, reason: 'no_candidates' };
    }

    const top = scored[0];
    const second = scored[1];

    // Check if deterministic match already found
    if (top.score.deterministic.matched && top.score.deterministic.score >= 0.99) {
      return { resolved: false, result: null, reason: 'deterministic_match' };
    }

    // Check if score is high enough without AI
    if (top.score.confidence === 'exact' || top.score.confidence === 'high') {
      return { resolved: false, result: null, reason: 'high_confidence' };
    }

    // Check ambiguity conditions
    const isAmbiguous = this.isAmbiguous(top, second);
    if (!isAmbiguous) {
      return { resolved: false, result: null, reason: 'not_ambiguous' };
    }

    // Check if we should use AI
    if (top.score.fusedScore < this.config.minScoreForAI) {
      return { resolved: false, result: null, reason: 'below_ai_threshold' };
    }

    // Build AI request
    const candidates = scored.slice(0, this.config.maxCandidatesForAI);
    const request = this.buildRequest(query, candidates);
    
    try {
      const aiResult = await this.ai.fallback(request);
      
      if (aiResult.confidence >= this.config.confidenceThreshold && aiResult.resolved) {
        return {
          resolved: true,
          result: aiResult,
          reason: 'ai_resolved',
        };
      }
      
      return { resolved: false, result: aiResult, reason: 'ai_low_confidence' };
    } catch (error) {
      console.error('AI resolution failed:', error);
      return { resolved: false, result: null, reason: 'ai_error' };
    }
  }

  private isAmbiguous(top: ScoredCandidate, second: ScoredCandidate | undefined): boolean {
    if (!second) return false; // Only one candidate - not ambiguous, just low confidence
    
    const scoreGap = top.score.fusedScore - second.score.fusedScore;
    
    // Ambiguous if top candidates are close in score
    return scoreGap < this.config.maxScoreGap;
  }

  private buildRequest(query: QueryProfile, candidates: ScoredCandidate[]): AIResolutionRequest {
    return {
      query,
      candidates,
      ambiguityReason: this.explainAmbiguity(candidates),
    };
  }

  private explainAmbiguity(candidates: ScoredCandidate[]): string {
    const top = candidates[0];
    const second = candidates[1];
    
    if (!second) {
      return `Single candidate with medium confidence (${(top.score.fusedScore * 100).toFixed(0)}%)`;
    }
    
    const gap = (top.score.fusedScore - second.score.fusedScore) * 100;
    return `Top candidates close: ${top.product.sku} (${(top.score.fusedScore * 100).toFixed(0)}%) vs ${second.product.sku} (${(second.score.fusedScore * 100).toFixed(0)}%), gap: ${gap.toFixed(0)}%`;
  }
}

// Extended AI Fallback Service for ambiguity resolution
export interface ExtendedAIFallback {
  fallback(request: AIResolutionRequest): Promise<AIResolution>;
}

export function createExtendedAIFallback(ai: AIFallbackService): ExtendedAIFallback {
  return {
    async fallback(request: AIResolutionRequest): Promise<AIResolution> {
      const { query, candidates } = request;
      
      // Build structured prompt for disambiguation
      const prompt = buildDisambiguationPrompt(query, candidates);
      
      // Call AI (reuse existing Gemini/Gemma infrastructure)
      // This is a placeholder - actual implementation uses the existing ai-fallback
      const start = Date.now();
      
      try {
        // In production: call this.ai.fallback with the disambiguation prompt
        const result = await callDisambiguationAI(prompt);
        
        return {
          resolved: result.choice !== null && result.confidence >= 0.7,
          productId: result.choice !== null ? candidates[result.choice].product.productId : null,
          confidence: result.confidence,
          reasoning: result.reasoning,
          tier: 'ai_assisted',
          model: 'gemini-2.5-flash',
          latencyMs: Date.now() - start,
          costUsd: 0.001,
        };
      } catch (error) {
        return {
          resolved: false,
          productId: null,
          confidence: 0,
          reasoning: `AI error: ${error}`,
          tier: 'ai_rejected',
          model: 'gemini-2.5-flash',
          latencyMs: Date.now() - start,
          costUsd: 0,
        };
      }
    },
  };
}

function buildDisambiguationPrompt(query: QueryProfile, candidates: ScoredCandidate[]): string {
  const querySummary = buildQuerySummary(query);
  const candidateSummaries = candidates.map((c, i) => buildCandidateSummary(i + 1, c)).join('\n\n');
  
  return `
You are a product disambiguation expert. The visual search system found ${candidates.length} similar candidates but cannot confidently distinguish between them.

QUERY OBSERVATION:
${querySummary}

CANDIDATES:
${candidateSummaries}

TASK: Analyze the visual and textual evidence to determine which candidate matches the query.
- Barcode/OCR exact matches are STRONGEST evidence
- Visual similarity (shape, color, logo, packaging) is MODERATE evidence  
- Category/brand consistency is SUPPORTING evidence
- If NO candidate matches well, respond with "none"

RESPOND WITH JSON ONLY:
{
  "choice": 0 | 1 | 2 | null,
  "confidence": 0.0-1.0,
  "reasoning": "specific visual/textual evidence for your choice"
}
`.trim();
}

function buildQuerySummary(query: QueryProfile): string {
  const parts: string[] = [];
  
  if (query.barcode.primary) {
    parts.push(`Barcode: ${query.barcode.primary} (${query.barcode.format})`);
  }
  
  if (query.ocr.productCodes.length > 0) {
    parts.push(`Product codes: ${query.ocr.productCodes.map(c => `${c.code} [${c.type}]`).join(', ')}`);
  }
  
  if (query.ocr.brandDetections.length > 0) {
    parts.push(`Brands detected: ${query.ocr.brandDetections.map(b => b.brand).join(', ')}`);
  }
  
  parts.push(`Dominant colors: ${query.visual.color.dominant.map(c => `rgb(${c.r},${c.g},${c.b})`).join(', ')}`);
  parts.push(`Shape: ${query.packaging.shape.type}`);
  parts.push(`Category: ${query.semantic.category.path.join(' > ')} (${(query.semantic.category.confidence * 100).toFixed(0)}%)`);
  parts.push(`Brand: ${query.semantic.brand.name || 'unknown'} (${(query.semantic.brand.confidence * 100).toFixed(0)}%)`);
  
  return parts.join('\n');
}

function buildCandidateSummary(index: number, candidate: ScoredCandidate): string {
  const p = candidate.product;
  const s = candidate.score;
  
  const parts: string[] = [
    `${index}. ${p.sku} - ${p.barcode.primary || 'no barcode'}`,
    `   Visual: pHash=${(s.breakdown.pHash * 100).toFixed(0)}% Emb=${(s.breakdown.embedding * 100).toFixed(0)}% Color=${(s.breakdown.color * 100).toFixed(0)}%`,
    `   Packaging: Shape=${(s.breakdown.shape * 100).toFixed(0)}% Logo=${(s.breakdown.logo * 100).toFixed(0)}%`,
    `   Semantic: Cat=${(s.breakdown.category * 100).toFixed(0)}% Brand=${(s.breakdown.brand * 100).toFixed(0)}% Attr=${(s.breakdown.attributes * 100).toFixed(0)}%`,
    `   Fused: ${(s.fusedScore * 100).toFixed(0)}% [${s.confidence}]`,
  ];
  
  return parts.join('\n');
}

// Placeholder - would integrate with actual AI client
async function callDisambiguationAI(prompt: string): Promise<{ choice: number | null; confidence: number; reasoning: string }> {
  // This would call the actual AI service
  // For now return a mock
  return {
    choice: null,
    confidence: 0,
    reasoning: 'AI disambiguation not yet implemented',
  };
}