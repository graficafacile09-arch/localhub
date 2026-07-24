import { readFileSync } from 'fs';
const IMAGE = readFileSync('test/img3-green.jpg');
const boundary = '----' + Math.random().toString(36).slice(2);
const parts = [];
parts.push(Buffer.from(`--${boundary}\r\n`));
parts.push(Buffer.from('Content-Disposition: form-data; name="image"; filename="img3-green.jpg"\r\n'));
parts.push(Buffer.from('Content-Type: image/jpeg\r\n'));
parts.push(Buffer.from('\r\n'));
parts.push(IMAGE);
parts.push(Buffer.from('\r\n'));
parts.push(Buffer.from(`--${boundary}--\r\n`));
const body = Buffer.concat(parts);

const res = await fetch('https://localhub-eta.vercel.app/api/merchant/stores/1/products/vision?model=moondream', {
  method: 'POST',
  headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  body,
});
console.log('Status:', res.status);
const text = await res.text();
console.log('Response:', JSON.stringify(JSON.parse(text), null, 2));
