import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const key = env.match(/GEMINI_API_KEY=(.+)/)[1].trim();

const imgBuf = fs.readFileSync('test/product-test.jpg');
const base64 = imgBuf.toString('base64');

const models = [
  { name: 'gemini-2.0-flash-001', label: 'Primary' },
  { name: 'gemini-flash-lite-latest', label: 'Fallback' },
];

const prompt = `Riconosci il prodotto nella foto. Restituisci SOLO JSON senza spiegazioni:
{
  "nome": "nome prodotto (max 80 caratteri)",
  "categoria": "categoria merceologica (es: Alimentari, Abbigliamento, Beauty, Casa, Elettronica, Sport)",
  "marca": "marca o null se non riconoscibile",
  "prezzo_suggerito": prezzo in euro o null,
  "descrizione": "descrivi in max 25 parole",
  "confidenza": 0-100
}
Regole: non inventare. confidenza onesta.`;

async function testModel(modelName, label) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;
  
  console.log(`\n=== Testing ${label}: ${modelName} ===`);
  
  try {
    const start = performance.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64 } }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 300, temperature: 0.1 }
      })
    });
    const elapsed = Math.round(performance.now() - start);
    
    const json = await res.json();
    
    console.log(`HTTP Status: ${res.status}`);
    console.log(`Latency: ${elapsed}ms`);
    
    if (res.status === 429) {
      console.log('❌ QUOTA EXCEEDED (429)');
      console.log('Error:', json.error?.message);
      return { model: modelName, label, status: 429, latency: elapsed, quotaExceeded: true };
    }
    
    if (res.status !== 200) {
      console.log('❌ ERROR:', json.error?.message);
      return { model: modelName, label, status: res.status, latency: elapsed, error: json.error?.message };
    }
    
    // Parse response
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    console.log('Raw response:', text);
    
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.log('❌ Failed to parse JSON');
      return { model: modelName, label, status: 200, latency: elapsed, parseError: true };
    }
    
    console.log('\n--- Parsed Result ---');
    console.log(`Nome: ${parsed.nome ?? 'null'}`);
    console.log(`Marca: ${parsed.marca ?? 'null'}`);
    console.log(`Categoria: ${parsed.categoria ?? 'null'}`);
    console.log(`EAN: ${parsed.codiceEan ?? parsed.ean ?? 'null'}`);
    console.log(`Descrizione: ${parsed.descrizione ?? 'null'}`);
    console.log(`Prezzo: ${parsed.prezzo_suggerito ?? parsed.prezzoSuggerito ?? 'null'}`);
    console.log(`Confidenza: ${parsed.confidenza ?? 'null'}`);
    
    return { 
      model: modelName, 
      label, 
      status: 200, 
      latency: elapsed, 
      parsed,
      quotaExceeded: false 
    };
    
  } catch (e) {
    console.log('❌ EXCEPTION:', e.message);
    return { model: modelName, label, error: e.message };
  }
}

async function main() {
  console.log('=== GEMINI MODELS BENCHMARK ===');
  console.log('Image: test/product-test.jpg');
  
  const results = [];
  
  for (const m of models) {
    const result = await testModel(m.name, m.label);
    results.push(result);
    
    // Wait between requests to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log('\n\n========== SUMMARY ==========');
  console.log('Model'.padEnd(25), 'Status'.padEnd(10), 'Latency'.padEnd(10), 'Nome'.padEnd(20), 'Marca'.padEnd(15), 'Categoria'.padEnd(15), 'EAN'.padEnd(15), 'Confidenza');
  console.log('-'.repeat(120));
  
  for (const r of results) {
    if (r.quotaExceeded) {
      console.log(r.model.padEnd(25), '429 QUOTA'.padEnd(10), (r.latency + 'ms').padEnd(10), '-'.padEnd(20), '-'.padEnd(15), '-'.padEnd(15), '-'.padEnd(15), '-');
    } else if (r.status === 200 && r.parsed) {
      const p = r.parsed;
      console.log(
        r.model.padEnd(25), 
        'OK'.padEnd(10), 
        (r.latency + 'ms').padEnd(10), 
        (p.nome ?? 'null').toString().padEnd(20).slice(0,20), 
        (p.marca ?? 'null').toString().padEnd(15).slice(0,15), 
        (p.categoria ?? 'null').toString().padEnd(15).slice(0,15), 
        (p.codiceEan ?? p.ean ?? 'null').toString().padEnd(15).slice(0,15), 
        p.confidenza ?? 'null'
      );
    } else {
      console.log(r.model.padEnd(25), (r.status || 'ERR').toString().padEnd(10), (r.latency + 'ms').padEnd(10), '-'.padEnd(20), '-'.padEnd(15), '-'.padEnd(15), '-'.padEnd(15), '-');
    }
  }
  
  console.log('\n--- Recommendation ---');
  const okResults = results.filter(r => r.status === 200 && r.parsed);
  if (okResults.length === 0) {
    console.log('❌ Nessun modello funzionante');
  } else if (okResults.length === 1) {
    console.log(`✅ Solo ${okResults[0].label} (${okResults[0].model}) funziona - usare come principale`);
  } else {
    // Compare accuracy
    const primary = okResults.find(r => r.label === 'Primary');
    const fallback = okResults.find(r => r.label === 'Fallback');
    
    if (primary && fallback) {
      console.log(`Primary (${primary.model}): ${primary.latency}ms`);
      console.log(`Fallback (${fallback.model}): ${fallback.latency}ms`);
      
      // Check accuracy fields
      const fields = ['nome', 'marca', 'categoria', 'codiceEan', 'descrizione'];
      let primaryScore = 0, fallbackScore = 0;
      
      for (const field of fields) {
        if (primary.parsed[field] && primary.parsed[field] !== 'null') primaryScore++;
        if (fallback.parsed[field] && fallback.parsed[field] !== 'null') fallbackScore++;
      }
      
      console.log(`\nAccuracy score (campi non-null su 5): Primary=${primaryScore}, Fallback=${fallbackScore}`);
      
      if (primaryScore >= fallbackScore && primary.latency <= fallback.latency * 1.5) {
        console.log('✅ PRIMARY consigliato come principale (accuracy >= fallback, latency accettabile)');
      } else if (fallbackScore > primaryScore) {
        console.log('⚠️ FALLBACK ha accuracy migliore - considerare come principale');
      } else {
        console.log('✅ PRIMARY consigliato come principale');
      }
    }
  }
}

main().catch(console.error);