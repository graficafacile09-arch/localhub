export type PreprocessResult = {
  file: File;
  width: number;
  height: number;
};

const MAX_DIM = 1600;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Impossibile caricare l'immagine.")); };
    img.src = url;
  });
}

function applySharpen(
  pixels: Uint8ClampedArray,
  src: Uint8ClampedArray,
  width: number,
  height: number,
  strength: number
) {
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        sum += src[((y - 1) * width + (x - 1)) * 4 + c] * 0;
        sum += src[((y - 1) * width + x) * 4 + c] * -1;
        sum += src[((y - 1) * width + (x + 1)) * 4 + c] * 0;
        sum += src[(y * width + (x - 1)) * 4 + c] * -1;
        sum += src[(y * width + x) * 4 + c] * 5;
        sum += src[(y * width + (x + 1)) * 4 + c] * -1;
        sum += src[((y + 1) * width + (x - 1)) * 4 + c] * 0;
        sum += src[((y + 1) * width + x) * 4 + c] * -1;
        sum += src[((y + 1) * width + (x + 1)) * 4 + c] * 0;
        const idx = (y * width + x) * 4 + c;
        pixels[idx] = Math.max(0, Math.min(255, src[idx] + (sum - src[idx]) * strength));
      }
    }
  }
}

export async function preprocessImage(file: File): Promise<PreprocessResult> {
  const img = await loadImage(file);

  let width = img.naturalWidth;
  let height = img.naturalHeight;

  if (width > MAX_DIM || height > MAX_DIM) {
    const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  let totalLuminance = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    totalLuminance += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  }
  const avgLuminance = totalLuminance / (pixels.length / 4);

  let min = 255;
  let max = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }

  const range = max - min;
  if (range > 15) {
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = Math.max(0, Math.min(255, ((pixels[i] - min) / range) * 255));
      pixels[i + 1] = Math.max(0, Math.min(255, ((pixels[i + 1] - min) / range) * 255));
      pixels[i + 2] = Math.max(0, Math.min(255, ((pixels[i + 2] - min) / range) * 255));
    }
  }

  if (avgLuminance < 80) {
    const correction = Math.min(2.0, 110 / avgLuminance);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = Math.min(255, Math.round(pixels[i] * correction));
      pixels[i + 1] = Math.min(255, Math.round(pixels[i + 1] * correction));
      pixels[i + 2] = Math.min(255, Math.round(pixels[i + 2] * correction));
    }
  }

  const src = new Uint8ClampedArray(pixels);
  applySharpen(pixels, src, width, height, 0.4);

  ctx.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => { if (b) resolve(b); else reject(new Error("canvas.toBlob failed")); },
      "image/jpeg",
      0.92
    );
  });

  const processedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg",
  });

  return { file: processedFile, width, height };
}
