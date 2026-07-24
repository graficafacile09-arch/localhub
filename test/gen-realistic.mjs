import sharp from 'sharp';

async function createRealisticProductImage() {
  const svg = Buffer.from(`<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f8f8f8"/>
        <stop offset="100%" stop-color="#e8e8e8"/>
      </linearGradient>
      <linearGradient id="label" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#8B0000"/>
        <stop offset="100%" stop-color="#600000"/>
      </linearGradient>
    </defs>

    <!-- Background -->
    <rect width="800" height="800" fill="url(#bg)"/>

    <!-- Jar body -->
    <rect x="250" y="100" width="300" height="500" rx="30" fill="url(#label)"/>
    <rect x="250" y="100" width="300" height="500" rx="30" fill="none" stroke="#ddd" stroke-width="2"/>

    <!-- White label area -->
    <rect x="270" y="180" width="260" height="250" rx="10" fill="white"/>

    <!-- Product name -->
    <text x="400" y="250" font-size="36" fill="#8B0000" text-anchor="middle" font-family="Arial" font-weight="bold">NUTELLA</text>

    <!-- Description -->
    <text x="400" y="290" font-size="16" fill="#555" text-anchor="middle" font-family="Arial">Crema spalmabile</text>
    <text x="400" y="315" font-size="14" fill="#777" text-anchor="middle" font-family="Arial">alle nocciole e cacao</text>

    <!-- Brand -->
    <text x="400" y="350" font-size="18" fill="#333" text-anchor="middle" font-family="Arial" font-weight="bold">Ferrero</text>

    <!-- Weight -->
    <text x="400" y="380" font-size="14" fill="#666" text-anchor="middle" font-family="Arial">750 g e</text>

    <!-- Barcode placeholder -->
    <rect x="330" y="420" width="140" height="60" fill="white" stroke="#ccc" stroke-width="1"/>
    <g transform="translate(340, 425)">
      <rect x="0" y="0" width="2" height="50" fill="black"/>
      <rect x="4" y="2" width="1" height="46" fill="white"/>
      <rect x="6" y="0" width="2" height="50" fill="black"/>
      <rect x="10" y="4" width="1" height="42" fill="white"/>
      <rect x="12" y="0" width="3" height="50" fill="black"/>
      <rect x="17" y="2" width="1" height="46" fill="white"/>
      <rect x="19" y="0" width="1" height="50" fill="black"/>
      <rect x="22" y="4" width="1" height="42" fill="white"/>
      <rect x="24" y="0" width="2" height="50" fill="black"/>
      <rect x="28" y="2" width="1" height="46" fill="white"/>
      <rect x="30" y="0" width="1" height="50" fill="black"/>
      <rect x="33" y="4" width="1" height="42" fill="white"/>
      <rect x="35" y="0" width="3" height="50" fill="black"/>
      <rect x="40" y="2" width="1" height="46" fill="white"/>
      <rect x="42" y="0" width="2" height="50" fill="black"/>
      <rect x="46" y="4" width="1" height="42" fill="white"/>
      <rect x="48" y="0" width="1" height="50" fill="black"/>
      <rect x="51" y="2" width="1" height="46" fill="white"/>
      <rect x="53" y="0" width="2" height="50" fill="black"/>
      <rect x="57" y="4" width="1" height="42" fill="white"/>
      <rect x="59" y="0" width="3" height="50" fill="black"/>
      <rect x="64" y="2" width="1" height="46" fill="white"/>
      <rect x="66" y="0" width="1" height="50" fill="black"/>
      <rect x="69" y="4" width="1" height="42" fill="white"/>
      <rect x="71" y="0" width="2" height="50" fill="black"/>
      <rect x="75" y="2" width="1" height="46" fill="white"/>
      <rect x="77" y="0" width="2" height="50" fill="black"/>
      <rect x="81" y="4" width="1" height="42" fill="white"/>
      <rect x="83" y="0" width="3" height="50" fill="black"/>
      <rect x="88" y="2" width="1" height="46" fill="white"/>
      <rect x="90" y="0" width="1" height="50" fill="black"/>
      <rect x="93" y="4" width="1" height="42" fill="white"/>
      <rect x="95" y="0" width="2" height="50" fill="black"/>
      <rect x="99" y="2" width="1" height="46" fill="white"/>
      <rect x="101" y="0" width="1" height="50" fill="black"/>
      <rect x="104" y="4" width="1" height="42" fill="white"/>
      <rect x="106" y="0" width="2" height="50" fill="black"/>
      <rect x="110" y="2" width="1" height="46" fill="white"/>
      <rect x="112" y="0" width="3" height="50" fill="black"/>
      <rect x="117" y="4" width="1" height="42" fill="white"/>
      <rect x="119" y="0" width="1" height="50" fill="black"/>
      <rect x="122" y="2" width="1" height="46" fill="white"/>
      <rect x="124" y="0" width="2" height="50" fill="black"/>
    </g>

    <!-- Lid -->
    <rect x="230" y="80" width="340" height="40" rx="10" fill="#DAA520"/>
    <rect x="230" y="80" width="340" height="40" rx="10" fill="none" stroke="#B8860B" stroke-width="2"/>

    <!-- Shadow -->
    <ellipse cx="400" cy="620" rx="200" ry="15" fill="rgba(0,0,0,0.1)"/>
  </svg>`);

  const img = sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 85 })
    .toFile('test/product-realistic.jpg');

  console.log('Created test/product-realistic.jpg');
}

createRealisticProductImage().catch(e => console.error(e.message));
