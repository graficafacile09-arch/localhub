import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const BASE = 'https://localhub-eta.vercel.app';

// Supabase client to clear cache between tests
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://favrminotoawoxhehshh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || readFileSync('.env.local', 'utf-8').match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1] || ''
);

async function clearCache() {
  await supabase.from('product_vision_cache').delete().neq('id', '00000000-0000-0000-0000-000000000000');
}

async function makeImage(uid) {
  // Very different images to ensure no hash collision
  const colors = {
    1: { bg: '#e8e8ff', box: '#cc3333', accent: '#222', uidColor: '#ff0000' },
    2: { bg: '#ffe8e8', box: '#3366cc', accent: '#222', uidColor: '#00ff00' },
    3: { bg: '#e8ffe8', box: '#33cc66', accent: '#222', uidColor: '#0000ff' },
    4: { bg: '#ffe8ff', box: '#cc9933', accent: '#222', uidColor: '#ffff00' },
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
    <!-- Large unique marker -->
    <rect x="20" y="20" width="60" height="60" fill="${c.uidColor}"/>
    <circle cx="700" cy="700" r="40" fill="${c.uidColor}"/>
  </svg>`);
  return sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function runTest(label, image, params) {
  const storeId = 'seq-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const url = `${BASE}/api/merchant/stores/${storeId}/products/vision${params}`;

  const boundary = '----' + Math.random().toString(36).slice(2);
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="image"; filename="test.jpg"\r\n`));
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
    uploadMs: t.upload, preprocMs: t.preprocessing, sharpMs: t.sharpResize,
    base64Ms: t.base64, cacheLookupMs: t.cacheLookup,
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
  console.log('  BENCHMARK SEQUENZIALE — cache azzerata prima di ogni test AI');
  console.log('='.repeat(90));

  const steps = [
    { label: 'Gemma 4 standard',   uid: 1, params: '' },
    { label: 'Gemma 4 + crop',     uid: 2, params: '?crop=1' },
    { label: 'Moondream standard', uid: 3, params: '?model=moondream' },
    { label: 'Moondream + crop',   uid: 4, params: '?model=moondream&crop=1' },
  ];

  const results = [];

  for (const step of steps) {
    // Clear cache before each AI test to force a fresh AI call
    await clearCache();
    console.log('\n  (cache azzerata)');

    const image = await makeImage(step.uid);
    const r = await runTest(step.label, image, step.params);
    results.push(r);

    console.log('\n\u250c ' + r.label);
    console.log('\u251c' + '\u2500'.repeat(70));
    if (!r.success) {
      console.log('\u2502  \u274c ERRORE: ' + (r.error || 'fallito'));
      console.log('\u2502  Tempo totale: ' + r.totalTimeMs + ' ms');
    } else {
      console.log('\u2502  \u2705 OK');
      console.log('\u2502  Cache:            ' + (r.cached ? 'HIT' : 'MISS'));
      console.log('\u2502  Tempo totale:     ' + r.totalTimeMs + ' ms (' + (r.totalTimeMs/1000).toFixed(1) + 's)');
      if (r.aiTimeMs != null) console.log('\u2502  AI (fase7A):      ' + r.aiTimeMs + ' ms');
      console.log('\u2502  Server (Vercel):  ' + (r.serverTotalMs ?? 'N/A') + ' ms');
      if (r.nome)     console.log('\u2502  Prodotto:         ' + r.nome);
      if (r.marca)    console.log('\u2502  Marca:            ' + r.marca);
      if (r.categoria) console.log('\u2502  Categoria:        ' + r.categoria);
      if (r.ean)      console.log('\u2502  EAN:              ' + r.ean);
      if (r.prezzo != null) console.log('\u2502  Prezzo:           \u20ac' + r.prezzo);
      if (r.descrizione) console.log('\u2502  Descrizione:      ' + (r.descrizione.length > 70 ? r.descrizione.slice(0,70)+'...' : r.descrizione));
      if (r.confidenza != null) console.log('\u2502  Confidenza:       ' + r.confidenza + '%');
    }
    console.log('\u2514' + '\u2500'.repeat(70));
    await new Promise(r => setTimeout(r, 2000));
  }

  // Now test cache hit: use same image as test 2 (Gemma 4 + crop), don't clear cache
  console.log('\n  (cache NON azzerata per test cache hit)');
  const cacheImg = await makeImage(2); // same uid as test 2
  const rCache = await runTest('Cache hit (Gemma 4 + crop)', cacheImg, '?crop=1');
  results.push(rCache);
  console.log('\n\u250c ' + rCache.label);
  console.log('\u251c' + '\u2500'.repeat(70));
  if (!rCache.success) {
    console.log('\u2502  \u274c ERRORE: ' + (rCache.error || 'fallito'));
    console.log('\u2502  Tempo totale: ' + rCache.totalTimeMs + ' ms');
  } else {
    console.log('\u2502  \u2705 OK');
    console.log('\u2502  Cache:            ' + (rCache.cached ? 'HIT' : 'MISS'));
    console.log('\u2502  Tempo totale:     ' + rCache.totalTimeMs + ' ms (' + (rCache.totalTimeMs/1000).toFixed(1) + 's)');
    if (rCache.aiTimeMs != null) console.log('\u2502  AI (fase7A):      ' + rCache.aiTimeMs + ' ms');
    console.log('\u2502  Server (Vercel):  ' + (rCache.serverTotalMs ?? 'N/A') + ' ms');
    if (rCache.nome)     console.log('\u2502  Prodotto:         ' + rCache.nome);
    if (rCache.marca)    console.log('\u2502  Marca:            ' + rCache.marca);
    if (rCache.categoria) console.log('\u2502  Categoria:        ' + rCache.categoria);
    if (rCache.confidenza != null) console.log('\u2502  Confidenza:       ' + rCache.confidenza + '%');
  }
  console.log('\u2514' + '\u2500'.repeat(70));

  // Summary
  console.log('\n\n' + '='.repeat(90));
  console.log('  TABELLA RIASSUNTIVA');
  console.log('='.repeat(90));
  const hdr = 'Configurazione'.padEnd(24) + ' | ' + 'Totale'.padEnd(9) + ' | ' + 'AI'.padEnd(9) + ' | ' + 'Server'.padEnd(9) + ' | ' + 'Conf.'.padEnd(6) + ' | ' + 'Cache';
  console.log(hdr);
  console.log('\u2500'.repeat(90));
  for (const r of results) {
    const cfg = r.label.padEnd(24);
    const tot = (r.totalTimeMs + ' ms').padEnd(9);
    const ai = r.aiTimeMs != null ? (r.aiTimeMs + ' ms').padEnd(9) : (r.cached ? '-'.padEnd(9) : 'ERR'.padEnd(9));
    const sv = (r.serverTotalMs != null ? r.serverTotalMs + ' ms' : 'N/A').padEnd(9);
    const conf = (r.confidenza != null ? r.confidenza + '%' : (r.success ? 'OK' : 'ERR')).padEnd(6);
    const cache = r.cached ? 'HIT' : 'MISS';
    console.log(cfg + ' | ' + tot + ' | ' + ai + ' | ' + sv + ' | ' + conf + ' | ' + cache);
  }
  console.log('\u2500'.repeat(90));

  writeFileSync('test/benchmark-sequential-results.json', JSON.stringify(results, null, 2));
  console.log('\n  Results saved to test/benchmark-sequential-results.json');
}

main().catch(console.error);
