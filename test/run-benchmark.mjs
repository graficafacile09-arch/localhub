import { readFileSync, writeFileSync } from 'fs';

const BASE = 'https://localhub-eta.vercel.app';
const STORE_ID = 'test-' + Date.now();
const IMAGE_DATA = readFileSync('test/product-test.jpg');

const CONFIGS = [
  { label: 'Gemma 4',        url: `${BASE}/api/merchant/stores/${STORE_ID}/products/vision` },
  { label: 'Gemma 4 + Crop', url: `${BASE}/api/merchant/stores/${STORE_ID}/products/vision?crop=1` },
  { label: 'Moondream',      url: `${BASE}/api/merchant/stores/${STORE_ID}/products/vision?model=moondream` },
  { label: 'Moondream + Crop', url: `${BASE}/api/merchant/stores/${STORE_ID}/products/vision?model=moondream&crop=1` },
  // Cache hit: reuse the same image but keep URL consistent with Gemma 4 + Crop
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

    const t = parsed.tempiFasi || {};
    const suggestion = parsed.suggestion || {};
    const productName = suggestion.nome || suggestion.product_name || (suggestion.nome === '' ? '(vuoto)' : 'N/A');
    const confidence = suggestion.confidenza ?? suggestion.confidence ?? null;
    const category = suggestion.categoria || suggestion.category || 'N/A';
    const brand = suggestion.marca || suggestion.brand || null;
    const ean = suggestion.codiceEan || suggestion.ean || null;
    const price = suggestion.prezzoSuggerito ?? suggestion.suggested_price ?? null;

    return {
      label,
      success: parsed.success === true,
      totalTimeMs: Math.round(totalTime),
      uploadMs: t.upload ?? null,
      preprocMs: t.preprocessing ?? null,
      sharpMs: t.sharpResize ?? null,
      base64Ms: t.base64 ?? null,
      cacheLookupMs: t.cacheLookup ?? null,
      aiTimeMs: t.fase7A ?? null,
      parseMs: t.parseRisposta ?? null,
      extractionMs: t.estrazioneSuggestion ?? null,
      totaleMs: t.totale ?? null,
      cached: parsed.cached === true,
      productName,
      confidence,
      category,
      brand,
      ean,
      price,
      lowConfidence: parsed.lowConfidence === true,
      error: parsed.error?.message || parsed.error || null,
    };
  } catch (err) {
    const totalTime = performance.now() - startTotal;
    return { label, success: false, totalTimeMs: Math.round(totalTime), error: err.message };
  }
}

function formatMs(ms) {
  if (ms == null) return 'N/A'.padStart(8);
  return (ms + ' ms').padStart(8);
}

function formatPct(ms, total) {
  if (ms == null || !total) return '';
  return ` (${Math.round(ms / total * 100)}%)`;
}

async function main() {
  console.log('='.repeat(80));
  console.log('  LOCALHUB — VISION AI BENCHMARK REPORT');
  console.log('='.repeat(80));
  console.log(`  Image:    ${(IMAGE_DATA.length / 1024).toFixed(1)} KB synthetic test image`);
  console.log(`  Date:     ${new Date().toISOString()}`);
  console.log(`  Base URL: ${BASE}`);
  console.log('='.repeat(80));

  const results = [];
  for (const cfg of CONFIGS) {
    console.log(`\n  ┌─ ${cfg.label}`);
    console.log(`  │  ${cfg.url}`);
    console.log('  ├' + '─'.repeat(60));

    const r = await runTest(cfg.label, cfg.url, IMAGE_DATA);
    results.push(r);

    if (!r.success) {
      console.log(`  │  ❌ ERROR: ${r.error}`);
      console.log(`  │  Total: ${r.totalTimeMs} ms (${(r.totalTimeMs / 1000).toFixed(2)} s)`);
      console.log(`  └${'─'.repeat(60)}`);
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    console.log(`  │  ✅ Success`);
    console.log(`  │  Cache:      ${r.cached ? '✅ HIT' : 'MISS'}`);
    console.log(`  │  Total time: ${r.totalTimeMs} ms (${(r.totalTimeMs / 1000).toFixed(2)} s)`);
    if (r.uploadMs != null) console.log(`  │  ├─ Upload:           ${formatMs(r.uploadMs)}${formatPct(r.uploadMs, r.totaleMs)}`);
    if (r.preprocMs != null) console.log(`  │  ├─ Pre-processing:   ${formatMs(r.preprocMs)}${formatPct(r.preprocMs, r.totaleMs)}`);
    if (r.sharpMs != null) console.log(`  │  │  └─ Sharp resize:  ${formatMs(r.sharpMs)}`);
    if (r.base64Ms != null) console.log(`  │  │  └─ Base64:        ${formatMs(r.base64Ms)}`);
    if (r.cacheLookupMs != null) console.log(`  │  ├─ Cache lookup:    ${formatMs(r.cacheLookupMs)}`);
    if (r.aiTimeMs != null) console.log(`  │  ├─ AI inference:    ${formatMs(r.aiTimeMs)}${formatPct(r.aiTimeMs, r.totaleMs)}`);
    if (r.parseMs != null) console.log(`  │  ├─ Parse response:   ${formatMs(r.parseMs)}`);
    if (r.extractionMs != null) console.log(`  │  └─ Extraction:      ${formatMs(r.extractionMs)}`);
    if (r.totaleMs != null) console.log(`  │  Server total: ${r.totaleMs} ms`);
    console.log(`  │`);
    console.log(`  │  Product:   ${r.productName}`);
    console.log(`  │  Category:  ${r.category}`);
    console.log(`  │  Brand:     ${r.brand || 'N/A'}`);
    console.log(`  │  EAN:       ${r.ean || 'N/A'}`);
    console.log(`  │  Price:     ${r.price != null ? '€' + r.price : 'N/A'}`);
    console.log(`  │  Confidence: ${r.confidence != null ? r.confidence + '%' : 'N/A'}`);
    console.log(`  │  Low conf:  ${r.lowConfidence ? '⚠ YES' : 'No'}`);
    console.log(`  └${'─'.repeat(60)}`);

    // Pause between requests (1s)
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n');
  console.log('='.repeat(80));
  console.log('  SUMMARY TABLE');
  console.log('='.repeat(80));
  console.log('');
  const header = 'Configurazione'.padEnd(22) + ' | ' +
    'Totale'.padEnd(9) + ' | ' +
    'AI'.padEnd(9) + ' | ' +
    'Upload'.padEnd(9) + ' | ' +
    'Server'.padEnd(9) + ' | ' +
    'Confid.'.padEnd(8) + ' | ' +
    'Cache';
  console.log(header);
  console.log('-'.repeat(80));
  for (const r of results) {
    const cfg = r.label.padEnd(22);
    const tot = (r.totalTimeMs + ' ms').padEnd(9);
    const ai = (r.aiTimeMs != null ? r.aiTimeMs + ' ms' : 'N/A').padEnd(9);
    const up = (r.uploadMs != null ? r.uploadMs + ' ms' : 'N/A').padEnd(9);
    const sv = (r.totaleMs != null ? r.totaleMs + ' ms' : 'N/A').padEnd(9);
    const conf = (r.confidence != null ? r.confidence + '%' : (r.success ? 'OK' : 'ERR')).padEnd(8);
    const cache = r.cached ? 'HIT' : 'MISS';
    console.log(`${cfg} | ${tot} | ${ai} | ${up} | ${sv} | ${conf} | ${cache}`);
  }
  console.log('-'.repeat(80));

  // Save results
  writeFileSync('test/benchmark-results.json', JSON.stringify(results, null, 2));
  console.log('\n  Results saved to test/benchmark-results.json');
}

main().catch(console.error);
