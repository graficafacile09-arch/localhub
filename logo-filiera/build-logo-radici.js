// Ricostruisce il logo Radici Calabria (asset allegato dall'utente) nello stesso
// formato del logo precedente: canvas 1536x1024, così il box dell'<Image> in header
// resta identico (stessa larghezza, stessa altezza resa, stesse proporzioni).
// L'arte viene scalata con proporzioni intatte fino a riempire quasi tutta la
// larghezza, con un piccolo margine ai lati: il logo appare più grande senza
// spostare header, navigazione o area clienti.
// Uso: node logo-filiera/build-logo-radici.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = 'logo-filiera/radici-calabria-sorgente.jpg';
const OUT_TRANSPARENT = 'public/logo-transparent.png';
const OUT_WHITE = 'public/logo.png';

// Canvas invariato: identico al logo precedente (misurato sul PNG alpha).
const W = 1536;
const H = 1024;
// Bianco residuo ai lati dell'arte: zero (l'arte tocca i bordi del canvas).
const MARGIN_X = 0;
const MARGIN_Y = 20;
// Centro ottico verticale del logo precedente: l'arte cresce in modo simmetrico.
const CENTER_Y = 490;

(async () => {
  const base = sharp(SRC).ensureAlpha();
  const { data, info } = await base.raw().toBuffer({ resolveWithObject: true });
  const SW = info.width;
  const SH = info.height;

  // 1. ritaglio dell'arte: primo/ultimo pixel non bianco
  let minX = SW, minY = SH, maxX = -1, maxY = -1;
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const i = (y * SW + x) * 4;
      if (data[i] <= 242 || data[i + 1] <= 242 || data[i + 2] <= 242) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;

  // 2. scala proporzionale che riempie il canvas (meno il margine ai lati),
  //    centrata in orizzontale e sul centro ottico verticale del logo precedente
  const scale = Math.min((W - 2 * MARGIN_X) / cw, (H - 2 * MARGIN_Y) / ch);
  const tw = Math.round(cw * scale);
  const th = Math.round(ch * scale);
  const left = Math.round((W - tw) / 2);
  const top = Math.round(CENTER_Y - th / 2);

  // 3. sfondo bianco -> trasparente, colori ripristinati (unpremultiplied)
  const rgb = await sharp(SRC)
    .extract({ left: minX, top: minY, width: cw, height: ch })
    .resize(tw, th, { kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer();
  const rgba = Buffer.alloc(tw * th * 4);
  for (let p = 0; p < tw * th; p++) {
    const r = rgb[p * 3];
    const g = rgb[p * 3 + 1];
    const b = rgb[p * 3 + 2];
    let a = 1 - Math.min(r, g, b) / 255;
    if (a < 0.06) a = 0; // toglie alone/rumore JPEG sullo sfondo
    const o = p * 4;
    if (a === 0) continue;
    rgba[o] = Math.max(0, Math.min(255, Math.round((r - 255 * (1 - a)) / a)));
    rgba[o + 1] = Math.max(0, Math.min(255, Math.round((g - 255 * (1 - a)) / a)));
    rgba[o + 2] = Math.max(0, Math.min(255, Math.round((b - 255 * (1 - a)) / a)));
    rgba[o + 3] = Math.round(a * 255);
  }
  const artPng = await sharp(rgba, { raw: { width: tw, height: th, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync('logo-filiera/radici-art.png', artPng);

  // 4. versione trasparente (header, area clienti)
  await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
  })
    .composite([{ input: artPng, left, top }])
    .png({ compressionLevel: 9 })
    .toFile(OUT_TRANSPARENT);

  // 5. versione con fondo bianco, senza canale alpha (come il logo.png precedente)
  await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: artPng, left, top }])
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(OUT_WHITE);

  console.log(
    'arte', cw + 'x' + ch, '-> scala', scale.toFixed(4), '->', tw + 'x' + th,
    'a', left + ',' + top, '| bbox', left + ',' + top + ' -> ' + (left + tw - 1) + ',' + (top + th - 1),
    '| bianco laterale', left + 'px / ' + (W - left - tw) + 'px'
  );
  for (const f of [OUT_TRANSPARENT, OUT_WHITE]) {
    const m = await sharp(f).metadata();
    console.log(f, m.width + 'x' + m.height, 'alpha', m.hasAlpha, (fs.statSync(f).size / 1024).toFixed(0) + ' KB');
  }
})();
