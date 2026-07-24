import sharp from 'sharp';
import { mkdirSync } from 'fs';

mkdirSync('test', { recursive: true });

function createImage(width, height, r, g, b, boxR, boxG, boxB, label) {
  const pixels = Buffer.alloc(width * height * 3, 255);
  // Color strip at top
  for (let y = 0; y < 80; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      pixels[idx] = boxR; pixels[idx+1] = boxG; pixels[idx+2] = boxB;
    }
  }
  // Grey label area
  for (let y = 150; y < 300; y++) {
    for (let x = 80; x < width - 80; x++) {
      const idx = (y * width + x) * 3;
      pixels[idx] = 240; pixels[idx+1] = 240; pixels[idx+2] = 240;
    }
  }
  // Random noise for uniqueness
  for (let y = 400; y < 600; y += 5) {
    for (let x = 100; x < 700; x += 5) {
      const idx = (y * width + x) * 3;
      pixels[idx] = Math.min(255, pixels[idx] + Math.floor(Math.random() * 5));
      pixels[idx+1] = Math.min(255, pixels[idx+1] + Math.floor(Math.random() * 5));
      pixels[idx+2] = Math.min(255, pixels[idx+2] + Math.floor(Math.random() * 5));
    }
  }
  return pixels;
}

const images = [
  { name: 'img1-red', r: 255, g: 240, b: 240, boxR: 200, boxG: 30, boxB: 30, label: 'prodotto rosso' },
  { name: 'img2-blue', r: 240, g: 240, b: 255, boxR: 30, boxG: 60, boxB: 200, label: 'prodotto blu' },
  { name: 'img3-green', r: 240, g: 255, b: 240, boxR: 30, boxG: 180, boxB: 50, label: 'prodotto verde' },
  { name: 'img4-yellow', r: 255, g: 255, b: 240, boxR: 200, boxG: 180, boxB: 20, label: 'prodotto giallo' },
];

for (const img of images) {
  const pixels = createImage(800, 800, img.r, img.g, img.b, img.boxR, img.boxG, img.boxB, img.label);
  await sharp(pixels, { raw: { width: 800, height: 800, channels: 3 } })
    .jpeg({ quality: 80 })
    .toFile(`test/${img.name}.jpg`);
  console.log(`Created test/${img.name}.jpg`);
}
console.log('All images created');
