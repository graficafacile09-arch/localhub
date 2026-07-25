import fs from 'fs';
import { resolve } from 'path';

const BASE = 'https://localhub-eta.vercel.app';
const IMAGES_DIR = resolve('benchmark-images');

const IMAGES = [
  { file: 'nutella.jpg', product: 'Nutella', brand: 'Ferrero', category: 'Alimentari', ean: '8000500310428' },
  { file: 'coca-cola.jpg', product: 'Coca-Cola 1.5L', brand: 'Coca-Cola', category: 'Bevande', ean: '5449000000996' },
  { file: 'barilla-spaghetti.jpg', product: 'Spaghetti n.5', brand: 'Barilla', category: 'Alimentari', ean: '8076809500019' },
  { file: 'mulino-bianco.jpg', product: 'Abbracci', brand: 'Mulino Bianco', category: 'Alimentari', ean: '8001410000123' },
  { file: 'dash.jpg', product: 'Dash', brand: 'Procter & Gamble', category: 'Casa', ean: '8001410000123' },
  { file: 'kinder-bueno.jpg', product: 'Kinder Bueno', brand: 'Ferrero', category: 'Alimentari', ean: '8000500210001' },
  { file: 'estathe.jpg', product: 'Estathé', brand: 'Ferrero', category: 'Bevande', ean: '8000500310428' },
  { file: 'rio-mare.jpg', product: 'Rio Mare', brand: 'Bolton Group', category: 'Alimentari', ean: '8002270000123' },
  { file: 'san-benedetto.jpg', product: 'Acqua San Benedetto', brand: 'San Benedetto', category: 'Bevande', ean: '8001410000123' },
  { file: 'red-bull.jpg', product: 'Red Bull', brand: 'Red Bull GmbH', category: 'Bevande', ean: '9006216000123' },
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

const models = [
  { key: 'gemini', label: 'Gemini 2.0 Flash-Lite', model: 'gemini-flash-lite-latest' },
  { key: 'groq', label: 'Groq Llama 3.2 11B Vision', model: 'meta-llama/llama-3.2-11b-vision-instruct' },
];

async function testModel(modelKey, label, imageFile, productInfo) {
  const imageData = fs.readFileSync(resolve(IMAGES_DIR, imageFile));
  const base64 = imageData.toString('base64');
  
  if (modelKey === 'gemini') {
    const key = fs.readFileSync('.env.local', 'utf8').match(/GEMINI_API_KEY=(.+)/)[1].trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${key}`;
    
    const start = performance.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: 'image/jpeg', data: base64 } }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 300, temperature: 0.1 }
      })
    });
    const elapsed = Math.round(performance.now() - start);
    const json = await res.json();
    
    let parsed = null;
    let error = null;
    if (res.ok) {
      try {
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        parsed = JSON.parse(text);
      } catch (e) {
        error = 'Parse error: ' + e.message;
      }
    } else {
      error = `HTTP ${res.status}: ${json.error?.message}`;
    }
    
    return { label, image: imageFile, elapsed, parsed, error, expected: productInfo };
  }
  
  if (modelKey === 'groq') {
    const key = fs.readFileSync('.env.local', 'utf8').match(/GROQ_API_KEY=(.+)/)[1].trim();
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    
    const start = performance.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.2-11b-vision-instruct',
        messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }] }],
        max_tokens: 300,
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });
    const elapsed = Math.round(performance.now() - start);
    const json = await res.json();
    
    let parsed = null;
    let error = null;
    if (res.ok) {
      try {
        const text = json.choices?.[0]?.message?.content ?? '';
        parsed = JSON.parse(text);
      } catch (e) {
        error = 'Parse error: ' + e.message;
      }
    } else {
      error = `HTTP ${res.status}: ${json.error?.message}`;
    }
    
    return { label, image: imageFile, elapsed, parsed, error, expected: productInfo };
  }
}

function scoreResult(result, expected) {
  if (!result.parsed || result.error) return { total: 0, details: { error: result.error || 'Parse failed' } };
  
  const p = result.parsed;
  const e = expected;
  
  let score = 0;
  const details = {};
  
  // Nome prodotto (30 punti)
  const nomeMatch = p.nome?.toLowerCase().includes(e.product.toLowerCase()) || 
                    e.product.toLowerCase().includes(p.nome?.toLowerCase()) ||
                    (p.nome && e.product && levenshtein(p.nome.toLowerCase(), e.product.toLowerCase()) < 5);
  score += nomeMatch ? 30 : 0;
  details.nome = { expected: e.product, got: p.nome, match: nomeMatch };
  
  // Marca (20 punti)
  const marcaMatch = p.marca?.toLowerCase().includes(e.brand.toLowerCase()) || 
                     e.brand.toLowerCase().includes(p.marca?.toLowerCase()) ||
                     (p.marca && e.brand && levenshtein(p.marca.toLowerCase(), e.brand.toLowerCase()) < 5);
  score += marcaMatch ? 20 : 0;
  details.marca = { expected: e.brand, got: p.marca, match: marcaMatch };
  
  // Categoria (15 punti)
  const catMatch = p.categoria?.toLowerCase().includes(e.category.toLowerCase()) ||
                   e.category.toLowerCase().includes(p.categoria?.toLowerCase());
  score += catMatch ? 15 : 0;
  details.categoria = { expected: e.category, got: p.categoria, match: catMatch };
  
  // EAN (15 punti) - solo se presente nell'immagine
  const eanMatch = p.codiceEan === e.ean || p.ean === e.ean;
  score += eanMatch ? 15 : 0;
  details.ean = { expected: e.ean, got: p.codiceEan || p.ean, match: eanMatch };
  
  // OCR qualità (10 punti) - presenza testo leggibile
  const hasText = p.descrizione && p.descrizione.length > 10 && !p.descrizione.includes('non riconosc');
  score += hasText ? 10 : 0;
  details.ocr = { hasText, descrizione: p.descrizione };
  
  // Confidenza (10 punti) - realistica
  const confRealistic = p.confidenza >= 60 && p.confidenza <= 95;
  score += confRealistic ? 10 : 5;
  details.confidenza = { value: p.confidenza, realistic: confRealistic };
  
  return { total: Math.min(100, score), details };
}

function levenshtein(a, b) {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      matrix[j][i] = a[i-1] === b[j-1] ? matrix[j-1][i-1] : 
        1 + Math.min(matrix[j-1][i], matrix[j][i-1], matrix[j-1][i-1]);
    }
  }
  return matrix[b.length][a.length];
}

async function main() {
  console.log('='.repeat(80));
  console.log('  BENCHMARK VISION AI - 10 PRODOTTI ITALIANI REALI');
  console.log('='.repeat(80));
  console.log('Modelli testati: Gemini 2.0 Flash-Lite, Groq Llama 3.2 11B Vision\n');
  
  const allResults = [];
  
  for (const model of models) {
    console.log(`\n📸 Testing ${model.label}...`);
    for (const img of IMAGES) {
      const result = await testModel(model.key, model.label, img.file, img);
      allResults.push(result);
      
      const status = result.error ? '❌' : (result.parsed ? '✅' : '⚠️');
      console.log(`  ${status} ${img.file.padEnd(25)} ${result.elapsed}ms ${result.error || ''}`);
      
      await new Promise(r => setTimeout(r, 500)); // rate limit
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('RISULTATI PER MODELLO');
  console.log('='.repeat(80));
  
  for (const model of models) {
    const modelResults = allResults.filter(r => r.label === model.label);
    const valid = modelResults.filter(r => r.parsed && !r.error);
    const avgTime = modelResults.reduce((a, b) => a + b.elapsed, 0) / modelResults.length;
    const avgScore = valid.reduce((a, b) => a + scoreResult(b, b.expected).total, 0) / (valid.length || 1);
    const successRate = (valid.length / modelResults.length * 100).toFixed(1);
    
    console.log(`\n${model.label}:`);
    console.log(`  Tempo medio:     ${avgTime.toFixed(0)}ms`);
    console.log(`  Success rate:    ${successRate}%`);
    console.log(`  Score medio:     ${avgScore.toFixed(1)}/100`);
    console.log(`  Errori:          ${modelResults.length - valid.length}/${modelResults.length}`);
    
    // Detail per prodotto
    for (const r of valid) {
      const s = scoreResult(r, r.expected);
      console.log(`  ${r.image.padEnd(25)} ${s.total.toFixed(0).padStart(3)}/100  ${r.elapsed}ms  ${r.parsed.nome} | ${r.parsed.marca} | ${r.parsed.categoria} | EAN:${r.parsed.codiceEan||r.parsed.ean||'?'}`);
    }
  }
  
  fs.writeFileSync('benchmark-results.json', JSON.stringify(allResults, null, 2));
  console.log('\n📊 Risultati completi salvati in benchmark-results.json');
}

main().catch(console.error);