export type CompressResult = {
  blob: Blob;
  file: File;
  originalSize: number;
  compressedSize: number;
  compressionMs: number;
  reductionPercent: number;
};

function getOrientedDimensions(
  img: HTMLImageElement,
  orientation: number
): { width: number; height: number } {
  if (orientation >= 5) {
    return { width: img.naturalHeight, height: img.naturalWidth };
  }
  return { width: img.naturalWidth, height: img.naturalHeight };
}

function drawWithOrientation(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  orientation: number
) {
  ctx.clearRect(0, 0, width, height);
  ctx.save();

  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, height, width); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
  }

  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function getJpegOrientation(file: File): Promise<number> {
  return new Promise((resolve) => {
    if (file.type !== "image/jpeg" && file.type !== "image/jpg") {
      resolve(1);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const view = new DataView(e.target?.result as ArrayBuffer);
      if (view.getUint16(0, false) !== 0xffd8) { resolve(1); return; }
      let offset = 2;
      while (offset < view.byteLength) {
        if (view.getUint16(offset, false) === 0xffe1) {
          const exifOffset = offset + 4 + 6;
          if (exifOffset + 8 > view.byteLength) { resolve(1); return; }
          const tiffOffset = exifOffset;
          const littleEndian = view.getUint16(tiffOffset) === 0x4949;
          const ifdOffset = view.getUint32(tiffOffset + 4, littleEndian) + tiffOffset;
          if (ifdOffset + 2 > view.byteLength) { resolve(1); return; }
          const entryCount = view.getUint16(ifdOffset, littleEndian);
          for (let i = 0; i < entryCount; i++) {
            const entryOffset = ifdOffset + 2 + i * 12;
            if (entryOffset + 12 > view.byteLength) { resolve(1); return; }
            if (view.getUint16(entryOffset, littleEndian) === 0x0112) {
              resolve(view.getUint16(entryOffset + 8, littleEndian));
              return;
            }
          }
        }
        const segSize = view.getUint16(offset + 2, false);
        offset += 2 + segSize;
        if (offset + 1 > view.byteLength) break;
        if (view.getUint16(offset, false) === 0xffd8) break;
      }
      resolve(1);
    };
    reader.onerror = () => resolve(1);
    reader.readAsArrayBuffer(file);
  });
}

export function compressImage(file: File, maxDim = 1024, quality = 0.78): Promise<CompressResult> {
  return new Promise((resolve, reject) => {
    const tStart = performance.now();
    const originalSize = file.size;

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = async () => {
      try {
        const orientation = await getJpegOrientation(file);
        const dims = getOrientedDimensions(img, orientation);
        let { width, height } = dims;

        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;

        drawWithOrientation(ctx, img, width, height, orientation);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (!blob) {
              reject(new Error("Compressione immagine fallita."));
              return;
            }

            const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
              type: "image/jpeg",
            });
            const compressedSize = compressedFile.size;
            const compressionMs = Math.round(performance.now() - tStart);
            const reductionPercent = originalSize
              ? Math.round((1 - compressedSize / originalSize) * 100)
              : 0;

            console.log("=== COMPRESSIONE CLIENT ===");
            console.log(`originale: ${(originalSize / 1024).toFixed(1)} KB`);
            console.log(`compressa: ${(compressedSize / 1024).toFixed(1)} KB`);
            console.log(`riduzione: ${reductionPercent}%`);
            console.log(`tempo: ${compressionMs}ms`);
            console.log(`dimensioni: ${width}x${height}`);

            resolve({
              blob,
              file: compressedFile,
              originalSize,
              compressedSize,
              compressionMs,
              reductionPercent,
            });
          },
          "image/jpeg",
          quality
        );
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossibile caricare l'immagine."));
    };

    img.src = url;
  });
}
