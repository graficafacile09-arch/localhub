import sharp from 'sharp';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const BASE = 'https://localhub-eta.vercel.app';
const SUPABASE_CLI = 'supabase.cmd';

// Cache azzerata
execSync(`"${SUPABASE_CLI}" db query --linked "DELETE FROM public.product_vision_cache;"`, { cwd: process.cwd(), stdio: 'pipe' });
console.log('Cache Supabase azzerata.\n');

// Genera 2 immagini con contenuti MOLTO diversi
async function makeImage(label, bgColor, boxColor, accentColor) {
  const svg = Buffer.from(`<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="800" fill="${bgColor}"/>
    <rect x="100" y="100" width="600" height="500" rx="30" fill="${boxColor}"/>
    <rect x="130" y="150" width="540" height="200" rx="10" fill="white"/>
    <text x="400" y="220" font-size="42" fill="${boxColor}" text-anchor="middle" font-family="Arial" font-weight="bold">${label}</text>
    <text x="400" y="270" font-size="18" fill="#555" text-anchor="middle" font-family="Arial">${label.toLowerCase()}</text>
    <text x="400" y="320" font-size="20" fill="#222" text-anchor="middle" font-family="Arial" font-weight="bold">${accentColor}</text>
    <rect x="340" y="400" width="120" height="50" fill="white" stroke="#ccc" stroke-width="1"/>
    <text x="400" y="430" font-size="10" fill="#333" text-anchor="middle" font-family="monospace">8000500310428</text>
  </svg>`);
  return sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

const products = [
  { label: 'NUTELLA', bgColor: '#e8e8ff', boxColor: '#cc3333', accentColor: 'Ferrero' },
  { label: 'COCA-COLA', bgColor: '#ffe8e8', boxColor: '#cc0000', accentColor: 'Coca-Cola Company' },
];

const results = [];

for (const prod of products) {
  const image = await makeImage(prod.label, prod.bgColor, prod.boxColor, prod.accentColor);
  const storeId = 'vfy-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const url = `${BASE}/api/merchant/stores/${storeId}/products/vision`;

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

  console.log(`--- Test: ${prod.label} (${(image.length / 1024).toFixed(1)} KB) ---`);

  const tStart = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: bodyBuffer,
  });

  const cfCache = res.headers.get('CF-Cache-Status') || 'ASSENTE';
  const tHeaders = performance.now();
  const text = await res.text();
  const tEnd = performance.now();
  const totalTime = Math.round(tEnd - tStart);

  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = {}; }

  const tempi = parsed.tempiFasi || {};
  const sug = parsed.suggestion || {};

  console.log(`  Tempo totale:   ${totalTime} ms (${(totalTime/1000).toFixed(1)}s)`);
  console.log(`  AI (fase7A):    ${tempi.fase7A ?? 'N/A'} ms`);
  console.log(`  Server Vercel:  ${tempi.totale ?? 'N/A'} ms`);
  console.log(`  Cache lookup:   ${tempi.cacheLookup ?? 'N/A'} ms`);
  console.log(`  Cache HIT:      ${parsed.cached === true ? 'SI' : 'NO'}`);
  console.log(`  CF-Cache:       ${cfCache}`);
  console.log(`  Modello:        gemma (default)`);
  console.log(`  Prodotto:       ${sug.nome ?? 'N/A'}`);
  console.log(`  Marca:          ${sug.marca ?? 'N/A'}`);
  console.log(`  Categoria:      ${sug.categoria ?? 'N/A'}`);
  console.log(`  Confidenza:     ${sug.confidenza ?? 'N/A'}%`);
  console.log(`  Errore:         ${parsed.error?.message ?? 'nessuno'}`);
  console.log('');

  results.push({
    prodotto: prod.label,
    imageSizeKB: (image.length / 1024).toFixed(1),
    totalTimeMs: totalTime,
    fase7A: tempi.fase7A,
    serverTotal: tempi.totale,
    cacheHit: parsed.cached,
    cfCache,
    riconosciuto: sug.nome,
    confidenza: sug.confidenza,
    errore: parsed.error?.message || null,
  });

  await new Promise(r => setTimeout(r, 2000));
}

console.log('='.repeat(70));
console.log('  RIEPILOGO');
console.log('='.repeat(70));
for (const r of results) {
  console.log(`  ${r.prodotto.padEnd(12)} | ${String(r.totalTimeMs).padEnd(6)} ms tot | AI: ${r.fase7A != null ? r.fase7A+' ms' : 'N/A'.padEnd(8)} | ${r.riconosciuto ?? 'ERRORE'}`);
}
console.log('');
console.log('  NOTA: Se fase7A > 10.000 ms, significa che Cloudflare Workers AI');
console.log('  ha avuto un cold start o il modello ha richiesto piu tempo per elaborare.');
console.log('  I risultati di ~1.2s nei test precedenti potrebbero essere stati');
console.log('  influenzati da cache Cloudflare Workers AI o da variazioni di carico.');
