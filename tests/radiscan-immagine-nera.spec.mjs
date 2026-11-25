/**
 * Regressione: la preparazione dell'immagine per il provider Vision non deve
 * trasformare la foto in un'immagine nera o vuota.
 *
 * Causa storica: con un PNG trasparente Sharp convertiva in JPEG senza
 * appiattire l'alfa, quindi le zone trasparenti diventavano nere.
 */

import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { preparaImmagineVisione } from "../lib/radiscan/dettaglio.ts";

const LARGHEZZA = 200;
const ALTEZZA = 200;
// Rosso pieno: luminanza media di riferimento ~86 dopo JPEG.
const LUMINANZA_MINIMA = 60;

async function luminanzaMedia(base64) {
  const { data, info } = await sharp(Buffer.from(base64, "base64"))
    .raw()
    .toBuffer({ resolveWithObject: true });
  let somma = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    somma += data[i] + data[i + 1] + data[i + 2];
  }
  return {
    media: somma / ((data.length / info.channels) * 3),
    larghezza: info.width,
    altezza: info.height,
  };
}

async function immagineRossa(formato) {
  const base = sharp({
    create: {
      width: LARGHEZZA,
      height: ALTEZZA,
      channels: 3,
      background: { r: 200, g: 30, b: 30 },
    },
  });
  if (formato === "png") return base.png().toBuffer();
  if (formato === "webp") return base.webp().toBuffer();
  return base.jpeg().toBuffer();
}

async function pngConTrasparenza() {
  const raw = Buffer.alloc(LARGHEZZA * ALTEZZA * 4);
  for (let i = 0; i < LARGHEZZA * ALTEZZA; i++) {
    const o = i * 4;
    raw[o] = 200;
    raw[o + 1] = 30;
    raw[o + 2] = 30;
    raw[o + 3] = i % 2 ? 0 : 255;
  }
  return sharp(raw, { raw: { width: LARGHEZZA, height: ALTEZZA, channels: 4 } })
    .png()
    .toBuffer();
}

const casi = [
  ["JPEG", () => immagineRossa("jpeg"), "image/jpeg"],
  ["PNG opaco", () => immagineRossa("png"), "image/png"],
  ["WebP", () => immagineRossa("webp"), "image/webp"],
  ["PNG trasparente", pngConTrasparenza, "image/png"],
];

for (const [nome, crea, mime] of casi) {
  test(`preparazione Vision: ${nome} non diventa nera o vuota`, async () => {
    const buffer = await crea();
    const preparata = await preparaImmagineVisione(buffer.toString("base64"), mime);

    assert.equal(preparata.mime, "image/jpeg", "il provider riceve un JPEG valido");
    assert.ok(preparata.byte > 0, "il buffer preparato non è vuoto");

    const { media, larghezza, altezza } = await luminanzaMedia(preparata.base64);
    assert.ok(larghezza > 0 && altezza > 0, "dimensioni valide dopo la preparazione");
    assert.ok(
      media >= LUMINANZA_MINIMA,
      `immagine troppo scura (luminanza media ${media.toFixed(1)}): pixel neri`
    );
  });
}
