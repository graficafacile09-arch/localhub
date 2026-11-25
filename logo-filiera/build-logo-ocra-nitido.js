// Ricostruisce public/logo-radici-ocra.png partendo dall'asset originale
// (logo-filiera/radici-calabria-sorgente.jpg), senza il passaggio
// "bianco -> trasparente" che impastava i bordi delle lettere e rendeva
// sfocata la scritta CALABRIA.
//
// Il logo vive su header bianco: ricomporlo su fondo bianco conserva i pixel
// originali e lascia al browser un downscale pulito, senza aloni alpha.
// Canvas e posizione dell'arte restano identici (1536x1024, arte 1536x542,
// centro ottico y=490), quindi il box dell'header non cambia.
//
// Uso: node logo-filiera/build-logo-ocra-nitido.js
const fs = require("fs");
const sharp = require("sharp");

const SRC = "logo-filiera/radici-calabria-sorgente.jpg";
const OUT = "public/logo-radici-ocra.png";

const W = 1536;
const H = 1024;
const CENTER_Y = 490;
const MARGIN_Y = 20;

// Colori approvati (campionati dal logo attuale): verde bosco e marrone ocra.
const VERDE = [26, 51, 34];
const OCRA = [105, 70, 27];

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

(async () => {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const SW = info.width;
  const SH = info.height;

  // 1. bbox dell'arte: primo/ultimo pixel non bianco
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

  // 2. ricolorazione in spazio sorgente: copertura d'inchiostro dal minimo dei
  //    canali, tinta scelta dal canale dominante. Il risultato è già composto
  //    su bianco, quindi i contorni restano quelli originali (antialiasing
  //    pulito) invece di essere ricostruiti da un canale alpha rumoroso.
  const rgb = Buffer.alloc(cw * ch * 3);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = (y * SW + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const coverage = 1 - Math.min(r, g, b) / 255;
      const o = ((y - minY) * cw + (x - minX)) * 3;
      if (coverage < 0.06) {
        rgb[o] = 255; rgb[o + 1] = 255; rgb[o + 2] = 255;
        continue;
      }
      // blu/navy -> verde bosco; giallo/ambra -> ocra
      const target = b > r + 24 ? VERDE : OCRA;
      rgb[o] = clamp255(target[0] * coverage + 255 * (1 - coverage));
      rgb[o + 1] = clamp255(target[1] * coverage + 255 * (1 - coverage));
      rgb[o + 2] = clamp255(target[2] * coverage + 255 * (1 - coverage));
    }
  }

  // 3. scala proporzionale sul canvas esistente
  const scale = Math.min(W / cw, (H - 2 * MARGIN_Y) / ch);
  const tw = Math.round(cw * scale);
  const th = Math.round(ch * scale);
  const left = Math.round((W - tw) / 2);
  const top = Math.round(CENTER_Y - th / 2);

  const art = await sharp(rgb, { raw: { width: cw, height: ch, channels: 3 } })
    .resize(tw, th, { kernel: "lanczos3" })
    // micro-contrasto per recuperare la leggera morbidezza del JPEG sorgente,
    // senza toccare forma, spessore o colore delle lettere.
    .sharpen({ sigma: 0.7, m1: 0.4, m2: 0.6 })
    .png({ compressionLevel: 9 })
    .toBuffer();

  await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: art, left, top }])
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(OUT);

  console.log(
    "arte", cw + "x" + ch, "-> scala", scale.toFixed(4), "->", tw + "x" + th,
    "a", left + "," + top, "|", (fs.statSync(OUT).size / 1024).toFixed(0) + " KB"
  );
})();
