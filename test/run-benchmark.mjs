import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const BASE = 'https://localhub-eta.vercel.app';
const STORE_ID = '1'; // test store
const IMAGE_PATH = resolve('test/product-test.jpg');
const IMAGE_DATA = readFileSync(IMAGE_PATH);

const CONFIGS = [
  { label: 'Gemma 4',        url: `${BASE}/api/merchant/stores/${STORE_ID}/products/vision` },
  { label: 'Gemma 4 + Crop', url: `${BASE}/api/merchant/stores/${STORE_ID}/products/vision?crop=1` },
  { label: 'Moondream',      url: `${BASE}/api/merchant/stores/${STORE_ID}/products/vision?model=moondream` },
  { label: 'Moondream + Crop', url: `${BASE}/api/merchant/stores/${STORE_ID}/products/vision?model=moondream&crop=1` },
  { label: 'Gemma 4 + Crop (cache hit)', url: `${BASE}/api/merchant/stores/${STORE_ID}/products/vision?crop=1` },
];

async function runTest(label, url, imageData) {
  const boundary = '----' + Math.random().toString(36).slice(2);
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from('Content-Disposition: form-data; name="image"; filename="product-test.jpg"\r\n'));
  parts.push(Buffer.from('Content-Type: image/jpeg\r\n'));
  parts.push(Buffer.from('\r\n'));
  parts.push(imageData);
  parts.push(Buffer.from('\r\n'));
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const bodyBuffer = Buffer.concat(parts);

  const startTotal = performance.now();
  let response;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: bodyBuffer,
    });
    const text = await res.text();
    const totalTime = performance.now() - startTotal;

    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { rawText: text.slice(0, 500) }; }

    const timings = parsed.tempiFasi || parsed.timings || {};
    const aiTime = timings.fase7A != null ? timings.fase7A :
                   timings.fase7 != null ? timings.fase7 :
                   timings.inference || null;
    const serverTime = parsed.serverTime || parsed.durationMs || null;
    const uploadTime = timings.upload || timings.fase1 || null;
    const cacheInfo = parsed.cache || parsed.cacheHit || null;

    const success = parsed.success === true || (parsed.productName || parsed.product_name);
    const productName = parsed.productName || parsed.product_name || 'N/A';
    const category = parsed.category || 'N/A';
    const confidence = parsed.confidence ?? null;
    const error = parsed.error?.message || parsed.error || null;

    return {
      label, url,
      success,
      totalTimeMs: Math.round(totalTime),
      aiTimeMs: aiTime != null ? Math.round(aiTime) : null,
      uploadTimeMs: uploadTime != null ? Math.round(uploadTime) : null,
      serverTimeMs: serverTime != null ? Math.round(serverTime) : null,
      cacheHit: cacheInfo?.hit ?? (typeof cacheInfo === 'boolean' ? cacheInfo : false),
      productName: typeof productName === 'string' ? productName : (productName?.nome || 'N/A'),
      confidence,
      error,
      raw: parsed,
    };
  } catch (err) {
    const totalTime = performance.now() - startTotal;
    return { label, url, success: false, totalTimeMs: Math.round(totalTime), aiTimeMs: null, error: err.message };
  }
}

async function main() {
  const results = [];
  console.log('='.repeat(70));
  console.log('LOCALHUB — VISION AI BENCHMARK');
  console.log('='.repeat(70));
  console.log(`Image: ${IMAGE_PATH} (${(IMAGE_DATA.length / 1024).toFixed(1)} KB)`);
  console.log(`Date:  ${new Date().toISOString()}`);
  console.log(`Base:  ${BASE}`);
  console.log('='.repeat(70));
  console.log('');

  for (const cfg of CONFIGS) {
    console.log(`\n▶ ${cfg.label}`);
    console.log(`  ${cfg.url}`);
    console.log('-'.repeat(40));

    const result = await runTest(cfg.label, cfg.url, IMAGE_DATA);

    console.log(`  Success:     ${result.success ? '✅ YES' : '❌ NO'}`);
    console.log(`  Total time:  ${result.totalTimeMs} ms (${(result.totalTimeMs / 1000).toFixed(2)} s)`);
    if (result.uploadTimeMs) console.log(`  Upload:      ${result.uploadTimeMs} ms`);
    if (result.aiTimeMs) console.log(`  AI time:     ${result.aiTimeMs} ms`);
    if (result.serverTimeMs) console.log(`  Server time: ${result.serverTimeMs} ms`);
    if (result.cacheHit) console.log(`  Cache:       ✅ HIT`);
    else console.log(`  Cache:       MISS`);
    console.log(`  Product:     ${result.productName}`);
    if (result.confidence != null) console.log(`  Confidence:  ${result.confidence}%`);
    if (result.error) console.log(`  Error:       ${result.error}`);
    console.log('');

    results.push(result);

    // Brief pause between requests
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('='.repeat(70));
  console.log('SUMMARY TABLE');
  console.log('='.repeat(70));
  console.log('');
  console.log('Configurazione'.padEnd(24), 'Totale'.padEnd(10), 'AI'.padEnd(10), 'Upload'.padEnd(10), 'Accuratezza'.padEnd(15), 'Cache');
  console.log('-'.repeat(70));
  for (const r of results) {
    const cfg = r.label.padEnd(24);
    const tot = (r.totalTimeMs + ' ms').padEnd(10);
    const ai = (r.aiTimeMs != null ? r.aiTimeMs + ' ms' : 'N/A').padEnd(10);
    const up = (r.uploadTimeMs != null ? r.uploadTimeMs + ' ms' : 'N/A').padEnd(10);
    const acc = (r.confidence != null ? r.confidence + '%' : (r.success ? 'OK' : 'ERR')).padEnd(15);
    const cache = r.cacheHit ? 'HIT' : 'MISS';
    console.log(`${cfg} ${tot} ${ai} ${up} ${acc} ${cache}`);
  }

  // Save results
  writeFileSync('test/benchmark-results.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to test/benchmark-results.json');
}

main().catch(console.error);
