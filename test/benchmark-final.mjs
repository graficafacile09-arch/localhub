import sharp from 'sharp';
import { writeFileSync } from 'fs';

const BASE = 'https://localhub-eta.vercel.app';
const STORE_ID = 'final-' + Date.now();

function makeSvg(uid) {
  const hue = (uid * 37) % 360;
  return Buffer.from(`<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="800" fill="#f4f4f4"/>
    <rect x="220" y="80" width="360" height="50" rx="8" fill="#B8860B"/>
    <rect x="240" y="130" width="320" height="480" rx="20" fill="#8B0000"/>
    <rect x="260" y="200" width="280" height="240" rx="10" fill="white"/>
    <text x="400" y="260" font-size="38" fill="#8B0000" text-anchor="middle" font-family="Arial" font-weight="bold">NUTELLA</text>
    <text x="400" y="300" font-size="16" fill="#555" text-anchor="middle" font-family="Arial">Crema spalmabile alle nocciole</text>
    <text x="400" y="340" font-size="18" fill="#333" text-anchor="middle" font-family="Arial" font-weight="bold">Ferrero</text>
    <text x="400" y="370" font-size="14" fill="#666" text-anchor="middle" font-family="Arial">750 g</text>
    <rect x="340" y="400" width="120" height="50" fill="white" stroke="#ccc" stroke-width="1"/>
    <text x="400" y="430" font-size="10" fill="#333" text-anchor="middle" font-family="monospace">8000500310428</text>
    <ellipse cx="400" cy="630" rx="180" ry="12" fill="rgba(0,0,0,0.08)"/>
    <rect x="195" y="${700 + uid}" width="10" height="10" fill="rgb(${hue},100,100)"/>
  </svg>`);
}

async function genImage(uid) {
  const svg = makeSvg(uid);
  const buf = await sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 85 })
    .toBuffer();
  return buf;
}

const TESTS = [
  { label: 'Gemma 4 standard',    uid: 1, url: () => `${BASE}/api/merchant/stores/${STORE_ID}/products/vision` },
  { label: 'Gemma 4 + crop',      uid: 2, url: () => `${BASE}/api/merchant/stores/${STORE_ID}/products/vision?crop=1` },
  { label: 'Moondream standard',  uid: 3, url: () => `${BASE}/api/merchant/stores/${STORE_ID}/products/vision?model=moondream` },
  { label: 'Moondream + crop',    uid: 4, url: () => `${BASE}/api/merchant/stores/${STORE_ID}/products/vision?model=moondream&crop=1` },
  { label: 'Cache hit (Gemma4+crop)', uid: 2, url: () => `${BASE}/api/merchant/stores/${STORE_ID}/products/vision?crop=1` }, // reuses uid 2!
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
  } catch (err) {
    const totalTime = performance.now() - startTotal;
    return { label, success: false, totalTimeMs: Math.round(totalTime), error: err.message };
  }
}

async function main() {
  console.log('='.repeat(90));
  console.log('  LOCALHUB — BENCHMARK FINALE (immagine prodotto realistica)');
  console.log('='.repeat(90));

  const results = [];
  for (const test of TESTS) {
    const image = await genImage(test.uid);
    const url = test.url();
    console.log('\n\u250c ' + test.label);
    console.log('\u2502 ' + url);
    console.log('\u251c' + '\u2500'.repeat(70));

    const r = await runTest(test.label, url, image, `product-${test.uid}.jpg`);
    results.push(r);

    if (!r.success) {
      console.log('\u2502  \u274c ERRORE: ' + (r.error || 'fallito'));
      console.log('\u2502  Tempo totale: ' + r.totalTimeMs + ' ms');
      console.log('\u2514' + '\u2500'.repeat(70));
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    console.log('\u2502  \u2705 OK' + (r.cached ? ' (da cache)' : ''));
    console.log('\u2502  Tempo totale:     ' + r.totalTimeMs + ' ms (' + (r.totalTimeMs/1000).toFixed(1) + 's)');
    if (r.uploadMs != null && r.uploadMs > 0) console.log('\u2502  Upload (client):  ' + r.uploadMs + ' ms');
    if (r.aiTimeMs != null) console.log('\u2502  AI (fase7A):      ' + r.aiTimeMs + ' ms');
    console.log('\u2502  Server (Vercel):  ' + (r.serverTotalMs ?? 'N/A') + ' ms');
    console.log('\u2502  Cache:            ' + (r.cached ? 'HIT' : 'MISS'));
    if (r.nome)     console.log('\u2502  Prodotto:         ' + r.nome);
    if (r.marca)    console.log('\u2502  Marca:            ' + r.marca);
    if (r.categoria) console.log('\u2502  Categoria:        ' + r.categoria);
    if (r.ean)      console.log('\u2502  EAN:              ' + r.ean);
    if (r.prezzo != null) console.log('\u2502  Prezzo:           \u20ac' + r.prezzo);
    if (r.descrizione) console.log('\u2502  Descrizione:      ' + (r.descrizione.length > 70 ? r.descrizione.slice(0,70)+'...' : r.descrizione));
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
    const ai = r.aiTimeMs != null ? (r.aiTimeMs + ' ms').padEnd(9) : (r.cached ? '-'.padEnd(9) : 'ERR'.padEnd(9));
    const sv = (r.serverTotalMs != null ? r.serverTotalMs + ' ms' : 'N/A').padEnd(9);
    const conf = (r.confidenza != null ? r.confidenza + '%' : (r.success ? 'OK' : 'ERR')).padEnd(6);
    const cache = r.cached ? 'HIT' : 'MISS';
    console.log(cfg + ' | ' + tot + ' | ' + ai + ' | ' + sv + ' | ' + conf + ' | ' + cache);
  }
  console.log('\u2500'.repeat(90));

  writeFileSync('test/benchmark-final-results.json', JSON.stringify(results, null, 2));
  console.log('\n  Results saved to test/benchmark-final-results.json');
}

main().catch(console.error);
