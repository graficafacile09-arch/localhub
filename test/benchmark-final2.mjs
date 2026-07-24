import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const BASE = 'https://localhub-eta.vercel.app';

const supabase = createClient(
  'https://favrminotoawoxhehshh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function clearCache() {
  await supabase.from('product_vision_cache').delete().neq('id', '00000000-0000-0000-0000-000000000000');
}

async function makeImage(uid) {
  const colors = {
    1: { bg: '#e8e8ff', box: '#cc3333', uidColor: '#ff0000' },
    2: { bg: '#ffe8e8', box: '#3366cc', uidColor: '#00ff00' },
    3: { bg: '#e8ffe8', box: '#33cc66', uidColor: '#0000ff' },
    4: { bg: '#ffe8ff', box: '#cc9933', uidColor: '#ffff00' },
  };
  const c = colors[uid] || colors[1];
  const svg = Buffer.from(`<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="800" fill="${c.bg}"/>
    <rect x="220" y="80" width="360" height="50" rx="8" fill="#B8860B"/>
    <rect x="240" y="130" width="320" height="480" rx="20" fill="${c.box}"/>
    <rect x="260" y="200" width="280" height="240" rx="10" fill="white"/>
    <text x="400" y="260" font-size="38" fill="${c.box}" text-anchor="middle" font-family="Arial" font-weight="bold">NUTELLA</text>
    <text x="400" y="300" font-size="16" fill="#555" text-anchor="middle" font-family="Arial">Crema spalmabile alle nocciole</text>
    <text x="400" y="340" font-size="18" fill="#333" text-anchor="middle" font-family="Arial" font-weight="bold">Ferrero</text>
    <text x="400" y="370" font-size="14" fill="#666" text-anchor="middle" font-family="Arial">750 g</text>
    <rect x="340" y="400" width="120" height="50" fill="white" stroke="#ccc" stroke-width="1"/>
    <text x="400" y="430" font-size="10" fill="#333" text-anchor="middle" font-family="monospace">8000500310428</text>
    <ellipse cx="400" cy="630" rx="180" ry="12" fill="rgba(0,0,0,0.08)"/>
    <rect x="20" y="20" width="60" height="60" fill="${c.uidColor}"/>
    <circle cx="700" cy="700" r="40" fill="${c.uidColor}"/>
  </svg>`);
  return sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function runTest(label, image, params) {
  const storeId = 'fin-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const url = `${BASE}/api/merchant/stores/${storeId}/products/vision${params}`;

  const boundary = '----' + Math.random().toString(36).slice(2);
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from('Content-Disposition: form-data; name="image"; filename="test.jpg"\r\n'));
  parts.push(Buffer.from('Content-Type: image/jpeg\r\n'));
  parts.push(Buffer.from('\r\n'));
  parts.push(image);
  parts.push(Buffer.from('\r\n'));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const bodyBuffer = Buffer.concat(parts);

  const startTotal = performance.now();
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
    label, success: parsed.success === true,
    totalTimeMs: Math.round(totalTime),
    uploadMs: t.upload, preprocMs: t.preprocessing,
    aiTimeMs: t.fase7A, serverTotalMs: t.totale,
    cached: parsed.cached === true,
    nome: sug.nome || null, marca: sug.marca || null, categoria: sug.categoria || null,
    ean: sug.codiceEan || null, prezzo: sug.prezzoSuggerito,
    descrizione: sug.descrizione || null, confidenza: sug.confidenza,
    lowConfidence: parsed.lowConfidence === true,
    error: parsed.error?.message || parsed.error || null,
  };
}

async function main() {
  console.log('='.repeat(90));
  console.log('  BENCHMARK FINALE — test isolati con cache azzerata');
  console.log('  Data: ' + new Date().toISOString());
  console.log('='.repeat(90));

  const aiTests = [
    { label: '1. Gemma 4 standard',   uid: 1, params: '' },
    { label: '2. Gemma 4 + crop',     uid: 2, params: '?crop=1' },
    { label: '3. Moondream standard', uid: 3, params: '?model=moondream' },
    { label: '4. Moondream + crop',   uid: 4, params: '?model=moondream&crop=1' },
  ];

  const results = [];
  const savedImages = {};

  for (const test of aiTests) {
    await clearCache();
    const image = await makeImage(test.uid);
    savedImages[test.uid] = image; // save for cache hit test

    console.log(`\n--- ${test.label} ---`);
    const r = await runTest(test.label, image, test.params);
    results.push(r);

    if (!r.success) {
      console.log(`  \u274c ${r.error}`);
      console.log(`  Totale: ${r.totalTimeMs} ms`);
    } else {
      console.log(`  Tempo cliente:  ${r.totalTimeMs} ms  (${(r.totalTimeMs/1000).toFixed(1)}s)`);
      if (r.aiTimeMs != null) console.log(`  AI (fase7A):    ${r.aiTimeMs} ms`);
      console.log(`  Server Vercel:  ${r.serverTotalMs ?? 'N/A'} ms`);
      console.log(`  Cache:          ${r.cached ? 'HIT' : 'MISS'}`);
      if (r.nome)        console.log(`  Prodotto:       ${r.nome}`);
      if (r.marca)       console.log(`  Marca:          ${r.marca}`);
      if (r.categoria)   console.log(`  Categoria:      ${r.categoria}`);
      if (r.ean)         console.log(`  EAN:            ${r.ean}`);
      if (r.prezzo != null) console.log(`  Prezzo:         \u20ac${r.prezzo}`);
      if (r.confidenza != null) console.log(`  Confidenza:     ${r.confidenza}%`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  // Cache hit test: reuse EXACT same image bytes from test 2 (uid=2)
  console.log(`\n--- 5. Cache hit (Gemma 4 + crop, stessa immagine) ---`);
  console.log('  (cache NON azzerata, stesso file del test 2)');
  const cacheImage = savedImages[2];
  const rCache = await runTest('5. Cache hit (Gemma 4 + crop)', cacheImage, '?crop=1');
  results.push(rCache);

  if (!rCache.success) {
    console.log(`  \u274c ${rCache.error}`);
    console.log(`  Totale: ${rCache.totalTimeMs} ms`);
  } else {
    console.log(`  Tempo cliente:  ${rCache.totalTimeMs} ms  (${(rCache.totalTimeMs/1000).toFixed(1)}s)`);
    if (rCache.aiTimeMs != null) console.log(`  AI (fase7A):    ${rCache.aiTimeMs} ms`);
    console.log(`  Server Vercel:  ${rCache.serverTotalMs ?? 'N/A'} ms`);
    console.log(`  Cache:          ${rCache.cached ? 'HIT' : 'MISS'}`);
    if (rCache.nome)        console.log(`  Prodotto:       ${rCache.nome}`);
    if (rCache.marca)       console.log(`  Marca:          ${rCache.marca}`);
    if (rCache.categoria)   console.log(`  Categoria:      ${rCache.categoria}`);
    if (rCache.confidenza != null) console.log(`  Confidenza:     ${rCache.confidenza}%`);
  }

  // Summary
  console.log('\n\n' + '='.repeat(90));
  console.log('  TABELLA RIASSUNTIVA');
  console.log('='.repeat(90));
  const hdr = 'Configurazione'.padEnd(24) + ' | ' + 'Totale'.padEnd(9) + ' | ' + 'AI'.padEnd(9) + ' | ' + 'Server'.padEnd(9) + ' | ' + 'Differenza'.padEnd(12) + ' | ' + 'Conf.'.padEnd(6) + ' | ' + 'Cache';
  console.log(hdr);
  console.log('\u2500'.repeat(90));

  const gemmaStd = results[0];
  for (const r of results) {
    const cfg = r.label.padEnd(24);
    const tot = (r.totalTimeMs + ' ms').padEnd(9);
    const ai = r.aiTimeMs != null ? (r.aiTimeMs + ' ms').padEnd(9) : (r.cached ? '-'.padEnd(9) : 'ERR'.padEnd(9));
    const sv = (r.serverTotalMs != null ? r.serverTotalMs + ' ms' : 'N/A').padEnd(9);

    // Difference vs Gemma 4 standard (total time)
    let diff = 'baseline'.padEnd(12);
    if (r !== gemmaStd && gemmaStd && r.totalTimeMs) {
      const pct = Math.round((1 - r.totalTimeMs / gemmaStd.totalTimeMs) * 100);
      diff = (pct > 0 ? '-' + pct : '+' + Math.abs(pct)) + '%'.padEnd(10);
    }
    const conf = (r.confidenza != null ? r.confidenza + '%' : (r.success ? 'OK' : 'ERR')).padEnd(6);
    const cache = r.cached ? 'HIT' : 'MISS';
    console.log(cfg + ' | ' + tot + ' | ' + ai + ' | ' + sv + ' | ' + diff + ' | ' + conf + ' | ' + cache);
  }
  console.log('\u2500'.repeat(90));

  writeFileSync('test/benchmark-final2-results.json', JSON.stringify(results, null, 2));
  console.log('\n  Results saved to test/benchmark-final2-results.json');

  console.log('\n\n  LEGENDA: differenza = variazione % tempo totale rispetto a Gemma 4 baseline.');
  console.log('  Valori negativi = pi\u00f9 veloce. ERR = Moondream non ha prodotto risultati.');
}

main().catch(console.error);
