import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const key = env.match(/GEMINI_API_KEY=(.+)/)[1].trim();

async function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
  const res = await fetch(url);
  const data = await res.json();
  
  if (data.models) {
    for (const m of data.models) {
      if (m.name.includes('flash') || m.name.includes('gemini')) {
        console.log(m.name, m.supportedGenerationMethods);
      }
    }
  }
}

listModels();