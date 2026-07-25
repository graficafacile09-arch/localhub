import { NextRequest, NextResponse } from 'next/server';
import { createSearchFirstPipeline } from '@/pipeline/search-first';
import { SearchOptions } from '@/pipeline/types/core';

let pipeline: Awaited<ReturnType<typeof createSearchFirstPipeline>> | null = null;

async function getPipeline() {
  if (!pipeline) {
    pipeline = await createSearchFirstPipeline({
      postgres: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'localhub',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres',
        max: 20,
      },
      redis: process.env.REDIS_URL || 'redis://localhost:6379',
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      gemmaEndpoint: process.env.GEMMA_ENDPOINT,
      aiThreshold: 0.60,
      enableAI: true,
      scorerWeights: {},
      updaterConfig: {},
    });
  }
  return pipeline;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const imageUrl = formData.get('url') as string | null;
    const base64 = formData.get('base64') as string | null;

    if (!file && !imageUrl && !base64) {
      return NextResponse.json(
        { error: 'No image provided. Use "image" file, "url", or "base64" field.' },
        { status: 400 }
      );
    }

    const options: SearchOptions = {
      maxResults: parseInt(formData.get('maxResults') as string || '20'),
      threshold: (formData.get('threshold') as SearchOptions['threshold']) || 'auto',
      includeAI: formData.get('includeAI') === 'true',
      filters: {
        categoryId: formData.get('categoryId') as string || undefined,
        brandId: formData.get('brandId') as string || undefined,
        priceRange: formData.get('priceRange')
          ? JSON.parse(formData.get('priceRange') as string)
          : undefined,
        inStock: formData.get('inStock') === 'true',
      },
      returnExplanations: formData.get('explanations') !== 'false',
      deduplicationWindowMs: 5 * 60 * 1000,
    };

    let imageInput: Buffer | string | File | Blob;
    if (file) {
      imageInput = file;
    } else if (imageUrl) {
      imageInput = imageUrl;
    } else {
      imageInput = base64!;
    }

    const pl = await getPipeline();
    const result = await pl.search(imageInput, options);

    return NextResponse.json({
      queryId: result.queryId,
      results: result.results.map(r => ({
        product: r.product,
        score: r.score,
        confidence: r.confidence,
        signals: options.returnExplanations ? r.signals : undefined,
        explanation: options.returnExplanations ? r.explanation : undefined,
      })),
      aiUsed: result.aiUsed,
      aiResult: result.aiResult ? {
        confidence: result.aiResult.confidence,
        reasoning: result.aiResult.reasoning,
        model: result.aiResult.model,
      } : null,
      latencyMs: result.latencyMs,
      timestamp: result.timestamp,
    });

  } catch (error) {
    console.error('Visual search error:', error);

    if (error instanceof Error && error.message === 'DUPLICATE_IMAGE') {
      return NextResponse.json(
        { error: 'Duplicate image detected', code: 'DUPLICATE' },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message.startsWith('IMAGE_QUALITY_TOO_LOW')) {
      return NextResponse.json(
        { error: 'Image quality too low for reliable search', code: 'LOW_QUALITY' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    name: 'LocalHub Search-First AI-Last Visual Search',
    version: '2.0.0',
    description: 'Multi-layer product profile matching with AI only for ambiguity resolution',
    pipeline: {
      layers: [
        '1. Deterministic (Barcode/OCR exact match)',
        '2. Probabilistic Visual (pHash, Embeddings, Color, Features)',
        '3. Packaging (Shape, Logo, Layout)',
        '4. Semantic (Category, Attributes, Brand)',
        '5. AI Ambiguity Resolution (only when needed)'
      ],
      thresholds: {
        exact: 0.99,
        high: 0.85,
        medium: 0.65,
        low: 0.45,
        ai: 0.60,
      },
    },
    endpoints: {
      'POST /api/search/visual': 'Visual product search',
      'POST /api/search/feedback': 'Submit feedback on results',
    },
  });
}