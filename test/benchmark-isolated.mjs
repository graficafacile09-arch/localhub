import sharp from 'sharp';
import { writeFileSync } from 'fs';

const BASE = 'https://localhub-eta.vercel.app';
const STORE_BASE = 'iso-' + Date.now();

// Use COMPLETELY different images so perceptual hashes won't cross-match
async function makeProductImage(bgColor, accentColor, uid) {
  const svg = Buffer.from(`<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="800" fill="${bgColor}"/>
    <rect x="220" y="80" width="360" height="50" rx="8" fill="${accentColor}"/>
    <rect x="240" y="130" width="320" height="480" rx="20" fill="#8B0000"/>
    <rect x="260" y="200" width="280" height="240" rx="10" fill="white"/>
    <text x="400" y="260" font-size="38" fill="#8B0000" text-anchor="middle" font-family="Arial" font-weight="bold">NUTELLA</text>
    <text x="400" y="300" font-size="16" fill="#555" text-anchor="middle" font-family="Arial">Crema spalmabile alle nocciole</text>
    <text x="400" y="340" font-size="18" fill="#333" text-anchor="middle" font-family="Arial" font-weight="bold">Ferrero</text>
    <text x="400" y="370" font-size="14" fill="#666" text-anchor="middle" font-family="Arial">750 g</text>
    <rect x="340" y="400" width="120" height="50" fill="white" stroke="#ccc" stroke-width="1"/>
    <text x="400" y="430" font-size="10" fill="#333" text-anchor="middle" font-family="monospace">8000500310428</text>
    <ellipse cx="400" cy="630" rx="180" ry="12" fill="rgba(0,0,0,0.08)"/>
    <rect x="10" y="10" width="30" height="30" fill="${uid}"/>
  </svg>`);
  return sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

const TESTS = [
  { label: 'Gemma 4 standard',    bg: '#f0f0ff', accent: '#444', uid: '#ff0000' },
  { label: 'Gemma 4 + crop',      bg: '#fff0f0', accent: '#444', uid: '#00ff00' },
  { label: 'Moondream standard',  bg: '#f0fff0', accent: '#444', uid: '#0000ff' },
  { label: 'Moondream + crop',    bg: '#fffff0', accent: '#444', uid: '#ffff00' },
  { label: 'Cache hit (Gemma4+crop)', bg: '#fff0f0', accent: '#444', uid: '#00ff00' }, // same as test 2
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
  console.log('  BENCHMARK ISOLATO — test separati con cache azzerata');
  console.log('  (ogni test AI usa immagini diverse per evitare cache cross-match)');
  console.log('='.repeat(90));

  const results = [];

  for (const test of TESTS) {
    const image = await makeProductImage(test.bg, test.accent, test.uid);
    const storeId = STORE_BASE + '-' + test.label.replace(/[^a-z0-9]/gi, '-').slice(0, 20);
    const params = test.label.includes('crop') ? '?crop=1' : '';
    const model = test.label.includes('Moondream') ? (params ? '&model=moondream' : '?model=moondream') : '';
    const url = `${BASE}/api/merchant/stores/${storeId}/products/vision${params}${model}`;

    console.log('\n\u250c ' + test.label);
    console.log('\u2502 ' + url);
    console.log('\u251c' + '\u2500'.repeat(70));

    const r = await runTest(test.label, url, image, `img-${test.uid}.jpg`);
    results.push(r);

    if (!r.success) {
      console.log('\u2502  \u274c ERRORE: ' + (r.error || 'fallito'));
      console.log('\u2502  Tempo totale: ' + r.totalTimeMs + ' ms');
    } else {
      console.log('\u2502  \u2705 OK' + (r.cached ? ' (da cache)' : ''));
      console.log('\u2502  Tempo totale:     ' + r.totalTimeMs + ' ms (' + (r.totalTimeMs/1000).toFixed(1) + 's)');
      if (r.aiTimeMs != null) console.log('\u2502  AI (fase7A):      ' + r.aiTimeMs + ' ms');
      console.log('\u2502  Server (Vercel):  ' + (r.serverTotalMs ?? 'N/A') + ' ms');
      console.log('\u2502  Cache:            ' + (r.cached ? 'HIT' : 'MISS'));
      if (r.nome)     console.log('\u2502  Prodotto:         ' + r.nome);
      if (r.marca)    console.log('\u2502  Marca:            ' + r.marca);
      if (r.categoria) console.log('\u2502  Categoria:        ' + r.categoria);
      if (r.ean)      console.log('\u2502  EAN:              ' + r.ean);
      if (r.prezzo != null) console.log('\u2502  Prezzo:           \u20ac' + r.prezzo);
      if (r.confidenza != null) console.log('\u2502  Confidenza:       ' + r.confidenza + '%');
      if (r.lowConfidence) console.log('\u2502  \u26a0 Bassa confidenza');
    }
    console.log('\u2514' + '\u2500'.repeat(70));

    await new Promise(r => setTimeout(r, 2000));
  }

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

  writeFileSync('test/benchmark-isolated-results.json', JSON.stringify(results, null, 2));
  console.log('\n  Results saved to test/benchmark-isolated-results.json');
}

main().catch(console.error);
