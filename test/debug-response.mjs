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

const res = await fetch(`${BASE}/api/merchant/stores/1/products/vision?crop=1`, {
  method: 'POST',
  headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  body,
});
const text = await res.text();
console.log(JSON.stringify(JSON.parse(text), null, 2));
