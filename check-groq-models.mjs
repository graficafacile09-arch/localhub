import fs from 'fs';

const key = fs.readFileSync('.env.local', 'utf8').match(/GROQ_API_KEY=(.+)/)[1].trim();

async function listModels() {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { 'Authorization': `Bearer ${key}` }
  });
  const data = await res.json();
  
  console.log('=== GROQ MODELS ===');
  data.data
    .filter(m => m.id.includes('vision') || m.id.includes('llama') || m.id.includes('pixtral') || m.id.includes('qwen'))
    .forEach(m => console.log(`  ${m.id} - owned_by: ${m.owned_by}`));
}

listModels().catch(console.error);