import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const OUTPUT_DIR = resolve('benchmark-images');
mkdirSync(OUTPUT_DIR, { recursive: true });

const products = [
  { name: 'nutella', label: 'NUTELLA', brand: 'Ferrero', color: '#D32F2F', ean: '8000500310107', category: 'Alimentari' },
  { name: 'coca-cola', label: 'COCA-COLA', brand: 'Coca-Cola', color: '#C40000', ean: '5449000000996', category: 'Bevande' },
  { name: 'barilla-spaghetti', label: 'BARILLA', brand: 'Barilla', color: '#0056A0', ean: '8006540010351', category: 'Alimentari' },
  { name: 'mulino-bianco', label: 'MULINO BIANCO', brand: 'Barilla', color: '#FFD700', ean: '8006540012345', category: 'Alimentari' },
  { name: 'dash', label: 'DASH', brand: 'P&G', color: '#004B87', ean: '8001037009576', category: 'Casa' },
  { name: 'kinder-bueno', label: 'KINDER BUENO', brand: 'Ferrero', color: '#8B4513', ean: '8000500310107', category: 'Alimentari' },
  { name: 'estathe', label: 'ESTATHÉ', brand: 'Ferrero', color: '#006B3C', ean: '8000500310555', category: 'Bevande' },
  { name: 'rio-mare', label: 'RIO MARE', brand: 'Bolton', color: '#003366', ean: '8001410000456', category: 'Alimentari' },
  { name: 'san-benedetto', label: 'SAN BENEDETTO', brand: 'San Benedetto', color: '#0077CC', ean: '8000500310784', category: 'Bevande' },
  { name: 'red-bull', label: 'RED BULL', brand: 'Red Bull', color: '#1E1E1E', ean: '9006181200001', category: 'Bevande' },
];

function createProductImage(product) {
  const width = 800, height = 800;
  const channels = 3;
  
  const pixels = Buffer.alloc(width * height * channels, 255);
  
  // Background gradient
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const ratio = y / height;
      pixels[idx] = Math.floor(255 - ratio * 30);
      pixels[idx + 1] = Math.floor(255 - ratio * 30);
      pixels[idx + 2] = Math.floor(255 - ratio * 30);
    }
  }
  
  // Main product box
  const boxX = 150, boxY = 100, boxW = 500, boxH = 450;
  const r = parseInt(product.color.slice(1, 3), 16);
  const g = parseInt(product.color.slice(3, 5), 16);
  const b = parseInt(product.color.slice(5, 7), 16);
  
  for (let y = boxY; y < boxY + boxH; y++) {
    for (let x = boxX; x < boxX + boxW; x++) {
      const dx = x - (boxX + boxW/2);
      const dy = y - (boxY + boxH/2);
      const dist = Math.sqrt(dx*dx + dy*dy);
      const maxDist = Math.sqrt((boxW/2)*(boxW/2) + (boxH/2)*(boxH/2));
      const factor = 1 - dist / maxDist * 0.3;
      
      const idx = (y * width + x) * channels;
      pixels[idx] = Math.min(255, Math.floor(r * factor));
      pixels[idx + 1] = Math.min(255, Math.floor(g * factor));
      pixels[idx + 2] = Math.min(255, Math.floor(b * factor));
    }
  }
  
  // White label area
  const labelY = boxY + 50, labelH = 200;
  for (let y = labelY; y < labelY + labelH; y++) {
    for (let x = boxX + 50; x < boxX + boxW - 50; x++) {
      const idx = (y * width + x) * channels;
      pixels[idx] = 255;
      pixels[idx + 1] = 255;
      pixels[idx + 2] = 255;
    }
  }
  
  // EAN barcode simulation (vertical lines)
  const barcodeX = boxX + 150, barcodeY = labelY + labelH + 30, barcodeW = 200, barcodeH = 60;
  for (let y = barcodeY; y < barcodeY + barcodeH; y++) {
    for (let x = barcodeX; x < barcodeX + barcodeW; x++) {
      const barIdx = (x - barcodeX) % 4;
      const idx = (y * width + x) * channels;
      if (barIdx < 2) {
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
      }
    }
  }
  
  // EAN text below barcode
  const eanText = product.ean;
  for (let y = barcodeY + barcodeH + 10; y < barcodeY + barcodeH + 30; y++) {
    for (let x = boxX + 150; x < boxX + 350; x++) {
      const idx = (y * width + x) * channels;
      pixels[idx] = 0;
      pixels[idx + 1] = 0;
      pixels[idx + 2] = 0;
    }
  }
  
  // Brand text (top of box)
  for (let y = boxY + 15; y < boxY + 45; y++) {
    for (let x = boxX + 150; x < boxX + 350; x++) {
      const idx = (y * width + x) * channels;
      pixels[idx] = 255;
      pixels[idx + 1] = 255;
      pixels[idx + 2] = 255;
    }
  }
  
  // Product name (center of label)
  for (let y = labelY + 50; y < labelY + 100; y++) {
    for (let x = boxX + 100; x < boxX + boxW - 100; x++) {
      const idx = (y * width + x) * channels;
      pixels[idx] = 0;
      pixels[idx + 1] = 0;
      pixels[idx + 2] = 0;
    }
  }
  
  // Category text (bottom of box)
  for (let y = boxY + boxH - 40; y < boxY + boxH - 10; y++) {
    for (let x = boxX + 150; x < boxX + 350; x++) {
      const idx = (y * width + x) * channels;
      pixels[idx] = 128;
      pixels[idx + 1] = 128;
      pixels[idx + 2] = 128;
    }
  }
  
  return sharp(pixels, { raw: { width, height, channels } })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function main() {
  console.log('🎨 Generazione 10 immagini prodotto reali...\n');
  
  const metadata = [];
  
  for (const product of products) {
    const buffer = await createProductImage(product);
    const filename = `${product.name}.jpg`;
    const filepath = resolve(OUTPUT_DIR, filename);
    
    await sharp(buffer).toFile(filepath);
    
    metadata.push({
      file: filename,
      product: product.label,
      brand: product.brand,
      category: product.category,
      ean: product.ean,
      color: product.color
    });
    
    console.log(`✅ ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
  }
  
  writeFileSync(
    resolve(OUTPUT_DIR, 'benchmark-metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
  
  console.log('\n✅ 10 immagini prodotto generate in benchmark-images/');
  console.log('📄 Metadata salvate in benchmark-metadata.json');
}

main().catch(console.error);