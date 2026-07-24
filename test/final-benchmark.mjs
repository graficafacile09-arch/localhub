import { readFileSync, writeFileSync } from 'fs';

const BASE = 'https://localhub-eta.vercel.app';
const STORE_ID = 'bench-' + Date.now();

// 4 DIFFERENT images so each triggers a fresh AI call (no cache cross-match)
const TESTS = [
  {
    label: 'Gemma 4',
    url: `${BASE}/api/merchant/stores/${STORE_ID}/products/vision`,
    image: readFileSync('test/img1-red.jpg'),
    file: 'img1-red.jpg',
  },
  {
    label: 'Gemma 4 + Crop',
    url: `${BASE}/api/merchant/stores/${STORE_ID}/products/vision?crop=1`,
    image: readFileSync('test/img2-blue.jpg'),
    file: 'img2-blue.jpg',
  },
  {
    label: 'Moondream',
    url: `${BASE}/api/merchant/stores/${STORE_ID}/products/vision?model=moondream`,
    image: readFileSync('test/img3-green.jpg'),
    file: 'img3-green.jpg',
  },
  {
    label: 'Moondream + Crop',
    url: `${BASE}/api/merchant/stores/${STORE_ID}/products/vision?model=moondream&crop=1`,
    image: readFileSync('test/img4-yellow.jpg'),
    file: 'img4-yellow.jpg',
  },
  // Cache hit: same image AND same config as test 2 (Gemma 4 + Crop)
  {
    label: 'Gemma 4 + Crop (cache hit)',
    url: `${BASE}/api/merchant/stores/${STORE_ID}/products/vision?crop=1`,
    image: readFileSync('test/img2-blue.jpg'),
    file: 'img2-blue.jpg',
  },
];

async function runTest(label, url, imageData, fileName) {
  const boundary = '----' + Math.random().toString(36).slice(2);
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="image"; filename="${fileName}"\r\n`));
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
    const sug = parsed.suggestion || {};

    return {
      label, success: parsed.success === true, totalTimeMs: Math.round(totalTime),
      uploadMs: t.upload, preprocMs: t.preprocessing, sharpMs: t.sharpResize,
      base64Ms: t.base64, cacheLookupMs: t.cacheLookup,
      aiTimeMs: t.fase7A, parseMs: t.parseRisposta, extractionMs: t.estrazioneSuggestion,
      serverTotalMs: t.totale,
      cached: parsed.cached === true,
      productName: sug.nome || '(vuoto)',
      confidence: sug.confidenza ?? null,
      category: sug.categoria || null,
      brand: sug.marca || null,
      ean: sug.codiceEan || null,
      price: sug.prezzoSuggerito,
      lowConfidence: parsed.lowConfidence === true,
      error: parsed.error?.message || parsed.error || null,
      raw: parsed,
    };
  } catch (err) {
    const totalTime = performance.now() - startTotal;
    return { label, success: false, totalTimeMs: Math.round(totalTime), error: err.message };
  }
}

function fmt(ms) {
  if (ms == null) return '   N/A  ';
  return (ms + ' ms').padStart(8);
}

async function main() {
  console.log('='.repeat(90));
  console.log('  LOCALHUB — VISION AI BENCHMARK REPORT (FINAL)');
  console.log('='.repeat(90));
  console.log(`  Date:     ${new Date().toISOString()}`);
  console.log(`  Base URL: ${BASE}`);
  console.log('='.repeat(90));

  const results = [];
  for (const test of TESTS) {
    console.log(`\n  ▶ ${test.label}`);
    console.log(`  ${test.url}`);
    console.log('  ' + '-'.repeat(70));

    const r = await runTest(test.label, test.url, test.image, test.file);
    results.push(r);

    if (!r.success) {
      console.log(`  ❌ ERROR: ${r.error}`);
      console.log(`  Total: ${r.totalTimeMs} ms`);
      console.log(`  ${'-'.repeat(70)}`);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    console.log(`  ✅ Risposta OK`);
    console.log(`  Cache:       ${r.cached ? '✅ HIT' : 'MISS'}`);
    console.log(`  Total time:  ${r.totalTimeMs} ms (${(r.totalTimeMs / 1000).toFixed(2)} s)`);
    console.log(`  Upload:      ${fmt(r.uploadMs)}  │  Preproc:  ${fmt(r.preprocMs)}`);
    console.log(`  Sharp:       ${fmt(r.sharpMs)}  │  Base64:   ${fmt(r.base64Ms)}`);
    console.log(`  Cache look:  ${fmt(r.cacheLookupMs)}  │  AI (fase7A): ${fmt(r.aiTimeMs)}`);
    console.log(`  Parse:       ${fmt(r.parseMs)}  │  Extract:  ${fmt(r.extractionMs)}`);
    console.log(`  Server tot:  ${fmt(r.serverTotalMs)}`);
    console.log(`  Prodotto:    ${r.productName}`);
    if (r.category) console.log(`  Categoria:   ${r.category}`);
    if (r.brand) console.log(`  Marca:       ${r.brand}`);
    if (r.ean) console.log(`  EAN:         ${r.ean}`);
    if (r.price != null) console.log(`  Prezzo:      €${r.price}`);
    console.log(`  Confidenza:  ${r.confidence != null ? r.confidence + '%' : 'N/A'}`);
    console.log(`  Low conf:    ${r.lowConfidence ? '⚠ Sì' : 'No'}`);
    console.log(`  ${'-'.repeat(70)}`);

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n\n' + '='.repeat(90));
  console.log('  TABELLA RIASSUNTIVA');
  console.log('='.repeat(90));

  const hdr = 'Configurazione'.padEnd(24) + ' │ ' +
    'Totale'.padEnd(8) + ' │ ' +
    'AI'.padEnd(8) + ' │ ' +
    'Upload'.padEnd(8) + ' │ ' +
    'Server'.padEnd(8) + ' │ ' +
    'Conf.'.padEnd(6) + ' │ ' +
    'Cache';
  console.log(hdr);
  console.log('─'.repeat(90));

  for (const r of results) {
    const cfg = r.label.padEnd(24);
    const tot = (r.totalTimeMs + ' ms').padEnd(8);
    const ai = (r.aiTimeMs != null ? r.aiTimeMs + ' ms' : 'N/A').padEnd(8);
    const up = (r.uploadMs != null ? r.uploadMs + ' ms' : 'N/A').padEnd(8);
    const sv = (r.serverTotalMs != null ? r.serverTotalMs + ' ms' : 'N/A').padEnd(8);
    const conf = (r.confidence != null ? r.confidence + '%' : (r.success ? 'OK' : 'ERR')).padEnd(6);
    const cache = r.cached ? 'HIT' : 'MISS';
    console.log(`${cfg} │ ${tot} │ ${ai} │ ${up} │ ${sv} │ ${conf} │ ${cache}`);
  }

  console.log('─'.repeat(90));
  writeFileSync('test/benchmark-results.json', JSON.stringify(results, null, 2));
  console.log('\n  Results saved to test/benchmark-results.json');
}

main().catch(console.error);
