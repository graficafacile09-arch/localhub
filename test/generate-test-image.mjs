import sharp from 'sharp';
import { mkdirSync } from 'fs';

mkdirSync('C:\\Users\\denni\\Desktop\\localhub\\test', { recursive: true });

const width = 800, height = 800;
const channels = 3;

// Generate pixel data: white background with a red rectangle (simulating product) and a grey label area
const pixels = Buffer.alloc(width * height * channels, 255);

// Red rectangle area (product area) at top-center
for (let y = 50; y < 300; y++) {
  for (let x = 250; x < 550; x++) {
    const idx = (y * width + x) * channels;
    pixels[idx] = 200;     // R
    pixels[idx + 1] = 30;  // G
    pixels[idx + 2] = 30;  // B
  }
}

// Grey label area
for (let y = 340; y < 500; y++) {
  for (let x = 150; x < 650; x++) {
    const idx = (y * width + x) * channels;
    pixels[idx] = 240;
    pixels[idx + 1] = 240;
    pixels[idx + 2] = 240;
  }
}

sharp(pixels, { raw: { width, height, channels } })
  .jpeg({ quality: 80 })
  .toFile('C:\\Users\\denni\\Desktop\\localhub\\test\\product-test.jpg')
  .then(() => console.log('Test image created'))
  .catch(err => console.error('Error:', err.message));
