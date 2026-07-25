import fs from 'fs';
import { resolve } from 'path';

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

async function testGroq(imageFile, productInfo) {
  const imageData = fs.readFileSync(resolve('benchmark-images', imageFile));
  const base64 = imageData.toString('base64');
  const key = fs.readFileSync('.env.local', 'utf8').match(/GROQ_API_KEY=(.+)/)[1].trim();
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  
  const start = performance.now();
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.2-11b-vision-preview',
      messages: [{ role: 'user', content: [
        { type: 'text', text: `Riconosci il prodotto nella foto. Restituisci SOLO JSON senza spiegazioni:\n{
  "nome": "nome prodotto (max 80 caratteri)",
  "categoria": "categoria merceologica (es: Alimentari, Abbigliamento, Beauty, Casa, Elettronica, Sport)",
  "marca": "marca o null se non riconoscibile",
  "prezzo_suggerito": "prezzo in euro o null",
  "descrizione": "descrivi in max 25 parole",
  "confidenza": 0-100
}
Regole: non inventare. confidenza onesta.` },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
      ] }],
      max_tokens: 300,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    }),
  });
  const elapsed = Math.round(performance.now() - start);
  const json = await res.json();
  
  let parsed = null, error = null;
  if (res.ok) {
    try {
      const text = json.choices?.[0]?.message?.content ?? '';
      parsed = JSON.parse(text);
    } catch (e) { error = 'Parse error: ' + e.message; }
  } else { error = `HTTP ${res.status}: ${json.error?.message}`; }
  
  return { label: 'Groq Llama 3.2 11B Vision', image: imageFile, elapsed, parsed, error, expected: imageFile };
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

async function main() {
  console.log('='.repeat(80));
  console.log('  BENCHMARK GROQ LLAMA 3.2 11B VISION - 10 PRODOTTI ITALIANI');
  console.log('='.repeat(80));
  
  const results = [];
  for (const img of IMAGES) {
    console.log(`\n📸 ${img.file}...`);
    const result = await testGroq(img.file, img);
    const score = scoreResult(result, img);
    
    if (result.error) {
      console.log(`  ❌ ${result.elapsed}ms - ERROR: ${result.error}`);
    } else {
      console.log(`  ✅ ${result.elapsed}ms | Score: ${score.total}/100`);
      console.log(`     Nome: ${result.parsed.nome}`);
      console.log(`     Marca: ${result.parsed.marca}`);
      console.log(`     Categoria: ${result.parsed.categoria}`);
      console.log(`     EAN: ${result.parsed.codiceEan || result.parsed.ean || '?'}`);
      console.log(`     Confidenza: ${result.parsed.confidenza}%`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  
  const valid = results.filter(r => r.parsed && !r.error);
  const avgTime = results.reduce((a,b)=>a+b.elapsed,0)/results.length;
  const avgScore = results.reduce((a,b)=>a+scoreResult(b, IMAGES.find(i=>i.file===b.image)).total, 0)/results.length;
  const successRate = (results.filter(r=>r.parsed&&!r.error).length/results.length*100).toFixed(1);
  
  console.log('\n' + '='.repeat(80));
  console.log('RISULTATO FINALE - GROQ LLAMA 3.2 11B VISION');
  console.log('='.repeat(80));
  console.log(`  Tempo medio:     ${results.reduce((a,b)=>a+b.elapsed,0)/results.length}ms`);
  console.log(`  Success rate:    ${(results.filter(r=>r.parsed&&!r.error).length/results.length*100).toFixed(1)}%`);
  console.log(`  Score medio:     ${results.reduce((a,b)=>a+scoreResult(b, IMAGES.find(i=>i.file===b.image)).total,0)/results.length.toFixed(1)}/100`);
  console.log(`  Errori:          ${results.filter(r=>r.error).length}/${results.length}`);
}

main().catch(console.error);