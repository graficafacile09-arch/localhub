// Ricostruisce il logo "CON UN CLICK LA FILIERA A CASA TUA" (versione allegata dall'utente)
// nello stesso formato del logo attuale: 1536x1024, arte dentro il riquadro 69,242 -> 1462,730.
// Uso: node logo-filiera/build-logo-v2.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const sharp = require('sharp');

const OUT = 'logo-filiera';
const FONTS = path.join(OUT, 'fonts');
const b64 = (f) => fs.readFileSync(path.join(FONTS, f)).toString('base64');

const W = 1536;
const H = 1024;

const C = {
  pinDeep: '#0B4C93', // bordo pin (blu profondo)
  pinTail: '#0C3D74', // coda pin (navy)
  inYellow: '#FACC15', // "In"
  navy: '#08224A', // "Città" e payoff
  hand: '#0E5AA7', // contorno manina
  sun: '#F4A83E',
  hillDark: '#2E7D32',
  hillMid: '#5FA33F',
  fieldLime: '#C6E27A',
  fieldGreen: '#8FC63F',
  fieldMid: '#B7D96F',
  fieldDeep: '#7CB342',
  stem: '#4E8A1E',
};

// solo la mano (senza l'anello del "touch")
const HAND_PATH =
  'M445-80q-29 0-56-12t-45-35L127-403l21-23q14-15 34.5-18.5T221-438l99 53v-365q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v465l-144-77 156 198q10 12 23.76 18 13.76 6 29.24 6h205q38 0 64-26t26-64v-170q0-25.5-17.25-42.75T680-460H460v-60h219.65q50.14 0 85.25 35 35.1 35 35.1 85v170q0 63-43.5 106.5T650-80H445Z';

// geometria (identica come ingombro al logo attuale)
const CX = 251;
const CY = 425;
const R = 172;
const BORDER = 32;
const TIP = 728;
const TEXT_X = 502;
const TEXT_BASELINE = 586;
const TEXT_W = 950;
const NAME_CAP = 218;
const PAY_X = 480;
const PAY_BASELINE = 724;
const PAY_W = 960;
const PAY_CAP = 36;

const faces = `
@font-face{font-family:'PBold';src:url(data:font/ttf;base64,${b64('Poppins-Bold.ttf')}) format('truetype');}
@font-face{font-family:'PMed';src:url(data:font/ttf;base64,${b64('Poppins-Medium.ttf')}) format('truetype');}
@font-face{font-family:'PSemi';src:url(data:font/ttf;base64,${b64('Poppins-SemiBold.ttf')}) format('truetype');}
@font-face{font-family:'PExtra';src:url(data:font/ttf;base64,${b64('Poppins-ExtraBold.ttf')}) format('truetype');}
`;

// Ritaglia la manina originale (linea blu + riempimento bianco + scintille) dal logo precedente.
async function handLayer() {
  const { data, info } = await sharp('.backup-logo-20261109/logo-transparent.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const OW = info.width;
  const bx = 225, by = 505, bw = 176, bh = 206;
  const isBlue = (x, y) => { const i = (y * OW + x) * 4; return data[i + 3] > 60 && data[i + 2] > 130 && data[i + 2] - data[i] > 55; };
  const blue = new Uint8Array(bw * bh);
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) if (isBlue(x, y)) blue[(y - by) * bw + (x - bx)] = 1;
  const outside = new Uint8Array(bw * bh);
  const stack = [];
  for (let x = 0; x < bw; x++) { stack.push([x, 0], [x, bh - 1]); }
  for (let y = 0; y < bh; y++) { stack.push([0, y], [bw - 1, y]); }
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= bw || y >= bh) continue;
    const p = y * bw + x;
    if (outside[p] || blue[p]) continue;
    outside[p] = 1;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const rgba = Buffer.alloc(bw * bh * 4);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const p = y * bw + x, o = p * 4, i = ((y + by) * OW + (x + bx)) * 4;
      if (blue[p]) { rgba[o] = data[i]; rgba[o + 1] = data[i + 1]; rgba[o + 2] = data[i + 2]; rgba[o + 3] = 255; }
      else if (!outside[p]) { rgba[o] = 255; rgba[o + 1] = 255; rgba[o + 2] = 255; rgba[o + 3] = 255; }
    }
  }
  return { png: await sharp(rgba, { raw: { width: bw, height: bh, channels: 4 } }).png().toBuffer(), bx, by, bw, bh };
}

(async () => {
  if (!fs.existsSync(path.join(FONTS, 'Poppins-Bold.ttf'))) {
    throw new Error('manca logo-filiera/fonts/Poppins-Bold.ttf');
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });

  // misura cap-height reale e larghezza naturale
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${faces}
    body{margin:0} span{font-family:'PBold';font-size:100px;white-space:nowrap;display:inline-block}
  </style></head><body><span id="n">InCittà</span><span id="p" style="font-family:'PSemi'">CON UN CLICK LA FILIERA A CASA TUA.</span></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const m = await page.evaluate(() => {
    const w = (id) => document.getElementById(id).getBoundingClientRect().width;
    return { name: w('n'), pay: w('p') };
  });

  // cap-height Poppins = 0.70 em
  const sizeName = NAME_CAP / 0.7;
  const sizePay = PAY_CAP / 0.7;

  // mano originale, spostata con il pin nuovo (dx 4, dy: allineata alla punta)
  const hl = await handLayer();
  const HAND_IMG = `<image x="${hl.bx + 26}" y="${hl.by + 18}" width="${hl.bw}" height="${hl.bh}" href="data:image/png;base64,${hl.png.toString('base64')}"/>`;
  fs.writeFileSync(path.join(OUT, 'ref-hand.png'), hl.png);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="InCittà — con un click la filiera a casa tua">
  <title>InCittà — Con un click la filiera a casa tua</title>
  <defs>
    <style>${faces}</style>
    <clipPath id="art"><circle cx="${CX}" cy="${CY}" r="${R - BORDER}"/></clipPath>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.55" stop-color="#F4FBEA"/>
      <stop offset="1" stop-color="#E4F3CE"/>
    </linearGradient>
    <linearGradient id="wave" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8CC63F"/>
      <stop offset="0.55" stop-color="#63B03C"/>
      <stop offset="1" stop-color="#2E7D32"/>
    </linearGradient>
  </defs>

  <!-- coda del pin -->
  <path d="M${CX} ${TIP} C ${CX - 40} ${TIP - 96}, ${CX - 80} ${CY + 128}, 158 516 L 344 516 C ${CX + 80} ${CY + 128}, ${CX + 40} ${TIP - 96}, ${CX} ${TIP} Z" fill="${C.pinTail}"/>
  <!-- anello del pin -->
  <circle cx="${CX}" cy="${CY}" r="${R}" fill="${C.pinDeep}"/>
  <circle cx="${CX}" cy="${CY}" r="${R - BORDER}" fill="#FFFFFF"/>

  <g clip-path="url(#art)">
    <rect x="${CX - R}" y="${CY - R}" width="${R * 2}" height="${R * 2}" fill="url(#sky)"/>
    <!-- sole -->
    <circle cx="198" cy="352" r="62" fill="#F9DDB0" opacity="0.45"/>
    <circle cx="198" cy="352" r="42" fill="${C.sun}"/>
    <!-- nuvolette -->
    <g fill="none" stroke="#BBD9F2" stroke-width="7" stroke-linecap="round">
      <path d="M272 330 q 20 -16 42 -4"/>
      <path d="M306 318 q 16 -12 34 -2"/>
    </g>
    <!-- colline -->
    <path d="M110 470 C 165 415, 232 432, 292 398 C 330 376, 366 392, 392 412 L392 560 L110 560 Z" fill="${C.hillMid}"/>
    <path d="M110 492 C 175 462, 250 476, 310 452 C 345 438, 372 452, 392 468 L392 560 L110 560 Z" fill="${C.hillDark}"/>
    <!-- campi a strisce in prospettiva -->
    <g clip-path="url(#art)">
      <path d="M110 486 C 190 470, 300 470, 392 486 L392 505 C 300 489, 190 489, 110 505 Z" fill="${C.fieldLime}"/>
      <path d="M110 505 C 190 489, 300 489, 392 505 L392 524 C 300 508, 190 508, 110 524 Z" fill="${C.fieldGreen}"/>
      <path d="M110 524 C 190 508, 300 508, 392 524 L392 545 C 300 529, 190 529, 110 545 Z" fill="${C.fieldMid}"/>
      <path d="M110 545 C 190 529, 300 529, 392 545 L392 560 L110 560 Z" fill="${C.fieldDeep}"/>
      <g stroke="#FFFFFF" stroke-width="4" opacity="0.85" fill="none">
        <path d="M110 505 C 190 489, 300 489, 392 505"/>
        <path d="M110 524 C 190 508, 300 508, 392 524"/>
        <path d="M110 545 C 190 529, 300 529, 392 545"/>
      </g>
      <g stroke="#6FA82F" stroke-width="3" opacity="0.55" fill="none">
        <path d="M${CX} 486 L150 560"/>
        <path d="M${CX} 486 L205 560"/>
        <path d="M${CX} 486 L300 560"/>
        <path d="M${CX} 486 L355 560"/>
      </g>
    </g>
    <!-- albero -->
    <g>
      <path d="M336 496 C 334 476 333 462 332 448" fill="none" stroke="#6B8E23" stroke-width="7" stroke-linecap="round"/>
      <path d="M333 470 C 326 462 322 456 318 450" fill="none" stroke="#6B8E23" stroke-width="5" stroke-linecap="round"/>
      <g fill="${C.hillDark}">
        <ellipse cx="318" cy="444" rx="17" ry="10" transform="rotate(-28 318 444)"/>
        <ellipse cx="343" cy="438" rx="17" ry="10" transform="rotate(24 343 438)"/>
        <ellipse cx="332" cy="424" rx="16" ry="10" transform="rotate(-6 332 424)"/>
        <ellipse cx="352" cy="456" rx="15" ry="9" transform="rotate(38 352 456)"/>
        <ellipse cx="311" cy="462" rx="14" ry="9" transform="rotate(-46 311 462)"/>
      </g>
      <g fill="#4CAF50">
        <ellipse cx="330" cy="450" rx="14" ry="9" transform="rotate(-12 330 450)"/>
        <ellipse cx="345" cy="448" rx="12" ry="8" transform="rotate(30 345 448)"/>
      </g>
    </g>
  </g>

  <!-- manina del click: bianca con bordo blu, appoggiata al pin -->
  <!-- manina originale, intatta -->
  ${HAND_IMG}

  <!-- NOME -->
  <text x="${TEXT_X}" y="${TEXT_BASELINE}" font-family="PMed" font-size="${sizeName.toFixed(1)}" textLength="${TEXT_W}" lengthAdjust="spacingAndGlyphs"><tspan fill="${C.inYellow}">In</tspan><tspan fill="${C.navy}">Città</tspan></text>

  <!-- onda verde con foglie -->
  <path d="M452 660 C 610 686, 800 632, 990 644 C 1160 654, 1330 626, 1452 634" fill="none" stroke="url(#wave)" stroke-width="12" stroke-linecap="round"/>
  <g fill="url(#wave)">
    <path d="M1392 626 C 1400 592, 1424 572, 1452 568 C 1450 598, 1426 622, 1392 626 Z"/>
    <path d="M1418 646 C 1434 622, 1456 610, 1478 612 C 1472 640, 1448 654, 1418 646 Z"/>
  </g>

  <!-- PAYOFF -->
  <text x="${PAY_X}" y="${PAY_BASELINE}" font-family="PSemi" font-size="${sizePay.toFixed(1)}" letter-spacing="1.5" textLength="${PAY_W}" lengthAdjust="spacingAndGlyphs" fill="${C.navy}">CON UN CLICK LA <tspan font-family="PExtra">FILIERA</tspan> A CASA TUA.</text>
</svg>`;

  fs.writeFileSync(path.join(OUT, 'incitta-logo-nuovo.svg'), svg, 'utf8');
  console.log('SVG:', (svg.length / 1024).toFixed(0) + ' KB', '| name natural', m.name.toFixed(0), '->', TEXT_W, '| pay natural', m.pay.toFixed(0), '->', PAY_W);

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}</style></head><body><div style="width:${W}px;height:${H}px">${svg}</div></body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT, 'incitta-logo-nuovo.png'),
    omitBackground: true,
    clip: { x: 0, y: 0, width: W, height: H },
  });
  await browser.close();

  const meta = await sharp(path.join(OUT, 'incitta-logo-nuovo.png')).metadata();
  console.log('PNG:', meta.width + 'x' + meta.height, 'alpha', meta.hasAlpha, (fs.statSync(path.join(OUT, 'incitta-logo-nuovo.png')).size / 1024).toFixed(0) + ' KB');
})();
