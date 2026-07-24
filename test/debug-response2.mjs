import { readFileSync } from 'fs';
const BASE = 'https://localhub-eta.vercel.app';
const IMAGE_DATA = readFileSync('test/product-test.jpg');
const boundary = '----' + Math.random().toString(36).slice(2);
const parts = [];
parts.push(Buffer.from(`--${boundary}\r\n`));
parts.push(Buffer.from('Content-Disposition: form-data; name="image"; filename="product-test.jpg"\r\n'));
parts.push(Buffer.from('Content-Type: image/jpeg\r\n'));
parts.push(Buffer.from('\r\n'));
parts.push(IMAGE_DATA);
parts.push(Buffer.from('\r\n'));
parts.push(Buffer.from(`--${boundary}--\r\n`));
const body = Buffer.concat(parts);

// Test without cache - use a unique store ID to avoid cache
const storeId = 'test-' + Date.now();
const res = await fetch(`${BASE}/api/merchant/stores/${storeId}/products/vision?crop=1`, {
  method: 'POST',
  headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  body,
});
const text = await res.text();
const parsed = JSON.parse(text);
console.log('Keys:', Object.keys(parsed));
console.log('Sezione tempi:', parsed.sezioneTempi || parsed.tempi || parsed.timing || 'NONE');
if (parsed.tempiFasi) console.log('tempiFasi:', JSON.stringify(parsed.tempiFasi, null, 2));
if (parsed.durationMs) console.log('durationMs:', parsed.durationMs);
if (parsed.serverTiming) console.log('serverTiming:', parsed.serverTiming);
// Print any numeric field that looks like timing
for (const [k, v] of Object.entries(parsed)) {
  if (typeof v === 'number' && k.endsWith('Ms') || k.endsWith('ms') || k.includes('time') || k.includes('tempo') || k.includes('durata')) {
    console.log(`${k}: ${v}`);
  }
}
// Check suggestion keys
console.log('\nSuggestion keys:', Object.keys(parsed.suggestion || {}));
