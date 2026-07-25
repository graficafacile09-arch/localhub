import fs from 'fs';
import { resolve } from 'path';

const IMAGES_DIR = resolve('benchmark-images');

const IMAGES = [
  { file: 'nutella.jpg', product: 'Nutella', brand: 'Ferrero', category: 'Alimentari', ean: '8000500310428' },
  { file: 'coca-cola.jpg', product: 'Coca-Cola 1.5L', brand: 'Coca-Cola', category: 'Bevande', ean: '5449000000996' },
  { file: 'barilla-spaghetti.jpg', product: 'Spaghetti n.5', brand: 'Barilla', category: 'Alimentari', ean: '8076809500019' },
  { file: 'mulino-bianco.jpg', product: 'Abbracci', brand: 'Mulino Bianco', category: 'Alimentari', ean: '8001410000123' },
  { file: 'dash.jpg', product: 'Dash', brand: 'Procter & Gamble', category: 'Casa', ean: '8001037009576' },
  { file: 'kinder-bueno.jpg', product: 'Kinder Bueno', brand: 'Ferrero', category: 'Alimentari', ean: '8000500210001' },
  { file: 'estathe.jpg', product: 'Estathé', brand: 'Ferrero', category: 'Bevande', ean: '8000500310555' },
  { file: 'rio-mare.jpg', product: 'Rio Mare', brand: 'Bolton Group', category: 'Alimentari', ean: '8002270000456' },
  { file: 'san-benedetto.jpg', product: 'Acqua San Benedetto', brand: 'San Benedetto', category: 'Bevande', ean: '8001410000123' },
  { file: 'red-bull.jpg', product: 'Red Bull', brand: 'Red Bull GmbH', category: 'Bevande', ean: '9006181200001' },
];

const PROMPT = `Riconosci il prodotto nella foto. Restituisci SOLO JSON senza spiegazioni:
{
  "nome": "nome prodotto (max 80 caratteri)",
  "categoria": "categoria merceologica (es: Alimentari, Abbigliamento, Beauty, Casa, Elettronica, Sport)",
  "marca": "marca o null se non riconoscibile",
  "prezzo_suggerito": prezzo in euro o null,
  "descrizione": "descrivi in max 25 parole",
  "confidenza": 0-100
}
Regole: non inventare. confidenza onesta.`;

function levenshtein(a, b) {
  const m = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) m[0][i] = i;
  for (let j = 0; j <= b.length; j++) m[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      m[j][i] = a[i-1] === b[j-1] ? m[j-1][i-1] : 1 + Math.min(m[j-1][i], m[j][i-1], m[j-1][i-1]);
    }
  }
  return m[b.length][a.length];
}

async function testGeminiFlashLite(imageFile, productInfo) {
  const imageData = fs.readFileSync(resolve(IMAGES_DIR, imageFile));
  const base64 = imageData.toString('base64');
  const key = fs.readFileSync('.env.local', 'utf8').match(/GEMINI_API_KEY=(.+)/)[1].trim();
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=' + key;
  
  const start = performance.now();
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=' + key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: 'image/jpeg', data: fs.readFileSync(resolve('benchmark-images', imageFile)).toString('base64') } }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 300, temperature: 0.1 }
    })
  });
  const elapsed = Math.round(performance.now() - start);
  const json = await res.json();
  
  let parsed = null, error = null;
  if (res.ok) {
    try {
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      parsed = JSON.parse(text);
    } catch (e) { error = 'Parse error: ' + e.message; }
  } else {
    error = `HTTP ${res.status}: ${json.error?.message}`;
  }
  
  return { model: 'Gemini 2.0 Flash-Lite', image: imageFile, elapsed, parsed, error, expected: productInfo };
}

function scoreResult(result, expected) {
  if (!result.parsed || result.error) return { total: 0, details: { error: result.error || 'Parse failed' } };
  
  const p = result.parsed, e = expected;
  let score = 0; const details = {};
  
  const nomeMatch = p.nome?.toLowerCase().includes(e.product.toLowerCase()) || e.product.toLowerCase().includes(p.nome?.toLowerCase()) || (p.nome && levenshtein(p.nome.toLowerCase(), e.product.toLowerCase()) < 5);
  score += nomeMatch ? 30 : 0;
  details.nome = { expected: e.product, got: p.nome, match: !!nomeMatch };
  
  const marcaMatch = p.marca?.toLowerCase().includes(e.brand.toLowerCase()) || e.brand.toLowerCase().includes(p.marca?.toLowerCase()) || (p.marca && levenshtein(p.marca.toLowerCase(), e.brand.toLowerCase()) < 5);
  score += marcaMatch ? 20 : 0;
  details.marca = { expected: e.brand, got: p.marca, match: !!marcaMatch };
  
  const catMatch = p.categoria?.toLowerCase().includes(e.category.toLowerCase()) || e.category.toLowerCase().includes(p.categoria?.toLowerCase());
  score += catMatch ? 15 : 0;
  details.categoria = { expected: e.category, got: p.categoria, match: !!catMatch };
  
  const eanMatch = p.codiceEan === e.ean || p.ean === e.ean;
  score += eanMatch ? 15 : 0;
  details.ean = { expected: e.ean, got: p.codiceEan || p.ean, match: !!eanMatch };
  
  const hasText = p.descrizione && p.descrizione.length > 10 && !p.descrizione.includes('non riconosc');
  score += hasText ? 10 : 0;
  details.ocr = { hasText, descrizione: p.descrizione };
  
  const confRealistic = p.confidenza >= 60 && p.confidenza <= 95;
  score += confRealistic ? 10 : 5;
  details.confidenza = { value: p.confidenza, realistic: !!confRealistic };
  
  return { total: Math.min(100, score), details };
}

async function main() {
  console.log('='.repeat(80));
  console.log('  BENCHMARK GEMINI 2.0 FLASH-LITE - 10 PRODOTTI ITALIANI');
  console.log('='.repeat(80));
  
  const results = [];
  for (const img of IMAGES) {
    console.log(`\n📸 ${img.file}...`);
    const result = await testGeminiFlashLite(img.file, img);
    const score = scoreResult(result, img);
    
    if (result.error) {
      console.log(`  ❌ ${result.elapsed}ms - ERROR: ${result.error}`);
    } else {
      const s = scoreResult({ parsed: result.parsed, error: null }, img);
      console.log(`  ✅ ${result.elapsed}ms | Score: ${s.total}/100`);
      console.log(`     Nome: ${result.parsed.nome} (exp: ${img.product})`);
      console.log(`     Marca: ${result.parsed.marca} (exp: ${img.brand})`);
      console.log(`     Categoria: ${result.parsed.categoria} (exp: ${img.category})`);
      console.log(`     EAN: ${result.parsed.codiceEan || result.parsed.ean || '?'} (exp: ${img.ean})`);
      console.log(`     Confidenza: ${result.parsed.confidenza}%`);
    }
    
    results.push({ image: img.file, ...img, elapsed: result.elapsed, parsed: result.parsed, error: result.error });
    await new Promise(r => setTimeout(r, 800));
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('RISULTATO FINALE - GEMINI 2.0 FLASH-LITE');
  console.log('='.repeat(80));
  
  const valid = results.filter(r => r.parsed && !r.error);
  const avgTime = results.reduce((a, b) => a + b.elapsed, 0) / results.length;
  const avgScore = valid.reduce((a, b) => a + scoreResult({ parsed: b.parsed, error: null }, b).total, 0) / (valid.length || 1);
  
  console.log(`\n📊 SINTESI GEMINI 2.0 FLASH-LITE:`);
  console.log(`  Immagini testate:     ${results.length}`);
  console.log(`  Successi:             ${valid.length}/${results.length} (${(valid.length/results.length*100).toFixed(1)}%)`);
  console.log(`  Tempo medio:          ${(results.reduce((a,b)=>a+b.elapsed,0)/results.length).toFixed(0)}ms`);
  console.log(`  Score medio:          ${(valid.reduce((a,b)=>a+scoreResult({parsed:b.parsed,error:null},b).total,0)/valid.length).toFixed(1)}/100`);
  console.log(`  Tempo totale:         ${results.reduce((a,b)=>a+b.elapsed,0)}ms`);
  
  console.log('\n--- DETTAGLIO PER PRODOTTO ---');
  for (const r of valid) {
    const s = scoreResult({ parsed: r.parsed, error: null }, r);
    console.log(`  ${r.file.padEnd(22)} ${s.total.toString().padStart(3)}/100  ${r.elapsed.toString().padStart(4)}ms  ${r.parsed.nome?.padEnd(20)} | ${r.parsed.marca?.padEnd(18)} | ${r.parsed.categoria?.padEnd(10)} | EAN:${r.parsed.codiceEan||r.parsed.ean||'?'}`);
  }
  
  // Salva risultati
  const allData = {
    model: 'Gemini 2.0 Flash-Lite (gemini-flash-lite-latest)',
    timestamp: new Date().toISOString(),
    images: results.map(r => ({
      file: r.file,
      product: r.product,
      expected: { product: r.product, brand: r.brand, category: r.category, ean: r.ean },
      elapsed: r.elapsed,
      parsed: r.parsed,
      error: r.error,
      score: r.parsed ? scoreResult({ parsed: r.parsed, error: null }, r).total : 0
    })),
    summary: {
      totalImages: results.length,
      successful: valid.length,
      avgTimeMs: Math.round(results.reduce((a,b)=>a+b.elapsed,0)/results.length),
      avgScore: Math.round(valid.reduce((a,b)=>a+scoreResult({parsed:b.parsed,error:null},b).total,0)/valid.length),
      successRate: (valid.length/results.length*100).toFixed(1) + '%'
    }
  };
  
  fs.writeFileSync('benchmark-gemini-flashlite.json', JSON.stringify(allData, null, 2));
  console.log('\n📊 Risultati salvati in benchmark-gemini-flashlite.json');
}

main().catch(console.error);