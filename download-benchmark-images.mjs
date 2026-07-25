import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const OUTPUT_DIR = path.join(process.cwd(), 'benchmark-images');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Immagini pubbliche licenziate (Wikimedia Commons, CC0, brand press kit)
const images = [
  {
    name: 'nutella-ferrero',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Nutella_jar.jpg/800px-Nutella_jar.jpg',
    product: 'Nutella',
    brand: 'Ferrero',
    category: 'Alimentari',
    ean: '8000500310428'
  },
{
    name: 'coca-cola',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Coca-Cola_can.jpg/800px-Coca-Cola_can.jpg',
    product: 'Coca-Cola',
    brand: 'Coca-Cola Company',
    category: 'Bevande',
    ean: '5449000000996'
  },
  {
    name: 'barilla-spaghetti-n5',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Barilla_Spaghetti_n.5.jpg/800px-Barilla_Spaghetti_n.5.jpg',
    product: 'Spaghetti n.5',
    brand: 'Barilla',
    category: 'Alimentari',
    ean: '8076809500019'
  },
  {
    name: 'mulino-bianco-abbracchi',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Mulino_Bianco_Abbracci.jpg/800px-Mulino_Bianco_Abbracci.jpg',
    product: 'Abbracci',
    brand: 'Mulino Bianco',
    category: 'Alimentari',
    ean: '8001410000123'
  },
  {
    name: 'dash-detersivo',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Dash_detergent.jpg/800px-Dash_detergent.jpg',
    product: 'Dash',
    brand: 'Procter & Gamble',
    category: 'Casa',
    ean: '8001037009576'
  },
  {
    name: 'kinder-bueno',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Kinder_Bueno.jpg/800px-Kinder_Bueno.jpg',
    product: 'Kinder Bueno',
    brand: 'Ferrero',
    category: 'Alimentari',
    ean: '8000500310107'
  },
  {
    name: 'estathe',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Estathe_bottle.jpg/800px-Estathe_bottle.jpg',
    product: 'Estathé',
    brand: 'Ferrero',
    category: 'Bevande',
    ean: '8000500310555'
  },
  {
    name: 'rio-mare',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Rio_Mare_tuna.jpg/800px-Rio_Mare_tuna.jpg',
    product: 'Tonno Rio Mare',
    brand: 'Bolton Group',
    category: 'Alimentari',
    ean: '8001410000456'
  },
  {
    name: 'acqua-san-benedetto',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/San_Benedetto_water.jpg/800px-San_Benedetto_water.jpg',
    product: 'Acqua San Benedetto',
    brand: 'Acqua San Benedetto',
    category: 'Bevande',
    ean: '8000500310784'
  },
  {
    name: 'red-bull',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Red_Bull_can.jpg/800px-Red_Bull_can.jpg',
    product: 'Red Bull',
    brand: 'Red Bull GmbH',
    category: 'Bevande',
    ean: '9006181200001'
  }
];

function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    const filepath = path.join(OUTPUT_DIR, filename);
    const client = url.startsWith('https') ? https : http;
    
    const req = client.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
      } 
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Handle redirect
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          downloadImage(redirectUrl, filename).then(resolve).catch(reject);
          return;
        }
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        return;
      }
      
      const fileStream = fs.createWriteStream(filepath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`✅ ${filename} (${(fs.statSync(filepath).size / 1024).toFixed(1)} KB)`);
        resolve(filepath);
      });
      fileStream.on('error', (err) => {
        fs.unlink(filepath, () => {});
        reject(err);
      });
    });
    
    req.on('error', (err) => reject(err));
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error(`Timeout: ${url}`));
    });
  });
}

async function downloadAll() {
  console.log('📥 Scaricamento 10 immagini prodotto standard...\n');
  
  for (const img of images) {
    try {
      await downloadImage(img.url, `${img.name}.jpg`);
      // Rate limit per essere gentili
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.log(`❌ ${img.name}: ${err.message}`);
      // Prova URL alternativo se disponibile
    }
  }
  
  console.log('\n✅ Download completato');
  
  // Salva metadata per benchmark
  const metadata = images.map(img => ({
    ...img,
    localFile: `${img.name}.jpg`
  }));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'benchmark-metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
}

downloadAll().catch(console.error);