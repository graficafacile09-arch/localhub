// Costruisce public/logo-radici-header.png: asset del logo per l'header.
//
// Il logo approvato (public/logo-radici-ocra.png) è un canvas 1536x1024 con
// ampi margini bianchi e l'arte ricampionata da un JPEG morbido: mostrato a
// 560 px nell'header appariva sfocato. Qui:
//   1. si ritaglia l'arte (1536x546, niente margini bianchi);
//   2. si ricampiona alla dimensione 2x della resa desktop (1120 px);
//   3. si applica un unsharp mask alla dimensione finale, dove i bordi delle
//      lettere vengono effettivamente visti.
// I colori NON vengono toccati: sono quelli approvati (verde bosco + ocra).
//
// Uso: node logo-filiera/build-logo-header-nitido.mjs
import fs from "node:fs";
import sharp from "sharp";

const BASE = "public/logo-radici-ocra.png";
const OUT = "public/logo-radici-header.png";
const LARG = 1120; // 2x della larghezza mostrata su desktop (560 px)

(async () => {
  const arte = await sharp(BASE).trim({ threshold: 8 }).toBuffer();
  const m = await sharp(arte).metadata();
  const alt = Math.round((LARG * m.height) / m.width);

  await sharp(arte)
    .resize(LARG, alt, { kernel: "lanczos3" })
    // micro-contrasto misurato sulle lettere: recupera la morbidezza del JPEG
    // sorgente senza ispessire in modo evidente le linee sottili dell'emblema.
    .sharpen({ sigma: 1.4, m1: 1.2, m2: 2.0 })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(OUT);

  console.log(
    `arte ${m.width}x${m.height} -> ${LARG}x${alt} | ${(
      fs.statSync(OUT).size / 1024
    ).toFixed(0)} KB`
  );
})();
