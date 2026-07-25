import fs from 'fs';
import { resolve } from 'path';

const key = fs.readFileSync('.env.local', 'utf8').match(/GROQ_API_KEY=(.+)/)[1].trim();

async function listModels() {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${fs.readFileSync('.env.local', 'utf8').match(/GROQ_API_KEY=(.+)/)[1].trim()}` }
  });
  const data = await res.json();
  for (const m of data.data) {
    if (m.id.includes('vision') || m.id.includes('llama') || m.id.includes('llava')) {
      console.log(m.id);
    }
  }
}

listModels().catch(console.error);