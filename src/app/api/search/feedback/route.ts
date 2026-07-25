import { NextRequest, NextResponse } from 'next/server';
import { VisualSearchPipeline } from '@/pipeline';

let pipeline: VisualSearchPipeline | null = null;

async function getPipeline(): Promise<VisualSearchPipeline> {
  if (!pipeline) {
    pipeline = await VisualSearchPipeline.create({
      postgres: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'localhub',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD,
        max: 20,
      },
      redis: process.env.REDIS_URL || 'redis://localhost:6379',
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      gemmaEndpoint: process.env.GEMMA_ENDPOINT,
      aiThreshold: parseFloat(process.env.AI_THRESHOLD || '0.60'),
      enableAI: process.env.ENABLE_AI !== 'false',
    });
  }
  return pipeline;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { queryId, action, correctionProductId } = body;

    if (!queryId || !action) {
      return NextResponse.json(
        { error: 'queryId and action are required' },
        { status: 400 }
      );
    }

    if (!['accepted', 'rejected', 'corrected', 'ignored'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    if (action === 'corrected' && !correctionProductId) {
      return NextResponse.json(
        { error: 'correctionProductId required for corrected action' },
        { status: 400 }
      );
    }

    const pipe = await getPipeline();
    await pipe.submitFeedback(queryId, action, correctionProductId);

    return NextResponse.json({ accepted: true });
  } catch (error) {
    console.error('Feedback error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}