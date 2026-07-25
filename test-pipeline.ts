import { VisualSearchPipeline } from '../src/pipeline';
import { SearchOptions } from '../src/pipeline/types/core';

async function testPipeline() {
  console.log('🧪 Testing Visual Search Pipeline...\n');

  const pipeline = await VisualSearchPipeline.create({
    postgres: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'localhub',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      max: 5,
    },
    redis: process.env.REDIS_URL || 'redis://localhost:6379',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    aiThreshold: 0.60,
    enableAI: false,
  });

  const testImage = Buffer.from('fake-jpeg-data-for-testing');

  console.log('1. Testing basic search...');
  const result = await pipeline.search(testImage, {
    maxResults: 10,
    threshold: 'auto',
  });

  console.log('✅ Search completed');
  console.log(`   Query ID: ${result.queryId}`);
  console.log(`   Results: ${result.results.length}`);
  console.log(`   AI Used: ${result.aiUsed}`);
  console.log(`   Latency: ${result.latencyMs}ms\n`);

  console.log('2. Testing with different thresholds...');
  const thresholds: SearchOptions['threshold'][] = ['exact', 'high', 'medium', 'low', 'auto'];
  for (const threshold of thresholds) {
    const r = await pipeline.search(testImage, { maxResults: 5, threshold });
    console.log(`   ${threshold}: ${r.results.length} results, top score: ${r.results[0]?.finalScore?.toFixed(3) || 'N/A'}`);
  }

  console.log('\n3. Testing feedback...');
  if (result.results.length > 0) {
    await pipeline.submitFeedback(result.queryId, 'accepted');
    console.log('   ✅ Feedback accepted');
  }

  console.log('\n4. Testing with filters...');
  const filtered = await pipeline.search(testImage, {
    maxResults: 5,
    filters: {
      categoryId: '00000000-0000-0000-0000-000000000000',
      priceRange: { min: 10, max: 100 },
      inStock: true,
    },
  });
  console.log(`   Filtered results: ${filtered.results.length}`);

  console.log('\n✅ All tests passed!');
  await pipeline.close();
  process.exit(0);
}

testPipeline().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});