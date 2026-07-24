import { readFileSync, writeFileSync } from 'fs';

const BASE = 'https://localhub-eta.vercel.app';
const STORE_ID = 'real-' + Date.now();
const IMAGE = readFileSync('test/product-realistic.jpg');

// For fresh AI calls, use different store IDs per test to avoid caching issues
// but same image for the cache hit test
const TESTS = [
  {
    label: 'Gemma 4 standard',
    url: `${BASE}/api/merchant/stores/real-gemma-${Date.now()}/products/vision`,
    image: IMAGE,
    file: 'product-realistic.jpg',
  },
  {
    label: 'Gemma 4 + crop',
    url: `${BASE}/api/merchant/stores/real-crop-${Date.now()}/products/vision?crop=1`,
    image: IMAGE,
    file: 'product-realistic.jpg',
  },
  {
    label: 'Moondream standard',
    url: `${BASE}/api/merchant/stores/real-moon-${Date.now()}/products/vision?model=moondream`,
    image: IMAGE,
    file: 'product-realistic.jpg',
  },
  {
    label: 'Moondream + crop',
    url: `${BASE}/api/merchant/stores/real-mooncrop-${Date.now()}/products/vision?model=moondream&crop=1`,
    image: IMAGE,
    file: 'product-realistic.jpg',
  },
  {
    label: 'Cache hit (Gemma 4 + crop)',
    url: `${BASE}/api/merchant/stores/real-cache-${Date.now()}/products/vision?crop=1`,
    image: IMAGE,
    file: 'product-realistic.jpg',
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
      label,
      success: parsed.success === true,
      totalTimeMs: Math.round(totalTime),
      uploadMs: t.upload,
      preprocMs: t.preprocessing,
      sharpMs: t.sharpResize,
      base64Ms: t.base64,
      cacheLookupMs: t.cacheLookup,
      aiTimeMs: t.fase7A,
      parseMs: t.parseRisposta,
      extractionMs: t.estrazioneSuggestion,
      serverTotalMs: t.totale,
      cached: parsed.cached === true,
      nome: sug.nome,
      marca: sug.marca,
      categoria: sug.categoria,
      ean: sug.codiceEan,
      prezzo: sug.prezzoSuggerito,
      descrizione: sug.descrizione,
      confidenza: sug.confidenza,
      lowConfidence: parsed.lowConfidence === true,
      error: parsed.error?.message || parsed.error || null,
      raw: parsed,
    };
  } catch (err) {
    const totalTime = performance.now() - startTotal;
    return { label, success: false, totalTimeMs: Math.round(totalTime), error: err.message };
  }
}

async function main() {
  console.log('='.repeat(90));
  console.log('  TEST PRODOTTO REALE — Benchmark Vision AI');
  console.log('='.repeat(90));
  console.log('  Date:     ' + new Date().toISOString());
  console.log('  Image:    product-realistic.jpg (' + (IMAGE.length / 1024).toFixed(1) + ' KB)');
  console.log('='.repeat(90));

  const results = [];
  for (const test of TESTS) {
    console.log('\n\u250c ' + test.label);
    console.log('\u2502 ' + test.url);
    console.log('\u251c' + '\u2500'.repeat(70));

    const r = await runTest(test.label, test.url, test.image, test.file);
    results.push(r);

    if (!r.success) {
      console.log('\u2502  \u274c ERRORE: ' + r.error);
      console.log('\u2502  Tempo totale: ' + r.totalTimeMs + ' ms');
      console.log('\u2514' + '\u2500'.repeat(70));
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    console.log('\u2502  \u2705 OK' + (r.cached ? ' (cache HIT)' : ''));
    console.log('\u2502  Tempo totale:     ' + r.totalTimeMs + ' ms (' + (r.totalTimeMs/1000).toFixed(1) + 's)');
    if (r.aiTimeMs != null) console.log('\u2502  AI (fase7A):      ' + r.aiTimeMs + ' ms');
    console.log('\u2502  Server:           ' + (r.serverTotalMs ?? 'N/A') + ' ms');
    console.log('\u2502  Cache:            ' + (r.cached ? 'HIT' : 'MISS'));
    if (r.nome) console.log('\u2502  Prodotto:         ' + r.nome);
    if (r.marca) console.log('\u2502  Marca:            ' + r.marca);
    if (r.categoria) console.log('\u2502  Categoria:        ' + r.categoria);
    if (r.ean) console.log('\u2502  EAN:              ' + r.ean);
    if (r.prezzo != null) console.log('\u2502  Prezzo:           \u20ac' + r.prezzo);
    if (r.descrizione) console.log('\u2502  Descrizione:      ' + (r.descrizione.length > 60 ? r.descrizione.slice(0,60)+'...' : r.descrizione));
    if (r.confidenza != null) console.log('\u2502  Confidenza:       ' + r.confidenza + '%');
    if (r.lowConfidence) console.log('\u2502  \u26a0 Bassa confidenza');
    console.log('\u2514' + '\u2500'.repeat(70));

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n');
  console.log('='.repeat(90));
  console.log('  TABELLA RIASSUNTIVA');
  console.log('='.repeat(90));
  const hdr = 'Configurazione'.padEnd(24) + ' | ' +
    'Totale'.padEnd(9) + ' | ' +
    'AI'.padEnd(9) + ' | ' +
    'Server'.padEnd(9) + ' | ' +
    'Conf.'.padEnd(6) + ' | ' +
    'Cache';
  console.log(hdr);
  console.log('\u2500'.repeat(90));
  for (const r of results) {
    const cfg = r.label.padEnd(24);
    const tot = (r.totalTimeMs + ' ms').padEnd(9);
    const ai = (r.aiTimeMs != null ? r.aiTimeMs + ' ms' : (r.cached ? '-'.padEnd(9) : 'ERR'.padEnd(9))).padEnd(9);
    const sv = (r.serverTotalMs != null ? r.serverTotalMs + ' ms' : 'N/A').padEnd(9);
    const conf = (r.confidenza != null ? r.confidenza + '%' : (r.success ? 'OK' : 'ERR')).padEnd(6);
    const cache = r.cached ? 'HIT' : 'MISS';
    console.log(cfg + ' | ' + tot + ' | ' + ai + ' | ' + sv + ' | ' + conf + ' | ' + cache);
  }
  console.log('\u2500'.repeat(90));

  writeFileSync('test/benchmark-real-results.json', JSON.stringify(results, null, 2));
  console.log('\n  Results saved to test/benchmark-real-results.json');
}

main().catch(console.error);
