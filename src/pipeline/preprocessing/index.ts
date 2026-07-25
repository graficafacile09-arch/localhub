import { AcquiredImage, PreprocessedImage } from '../types/core';
import sharp from 'sharp';

export interface PreprocessingOptions {
  fingerprintSize?: { width: number; height: number };
  embeddingSize?: { width: number; height: number };
  ocrMaxDimension?: number;
  barcodeSize?: { width: number; height: number };
  thumbnailSize?: { width: number; height: number };
}

const DEFAULT_OPTIONS: Required<PreprocessingOptions> = {
  fingerprintSize: { width: 256, height: 256 },
  embeddingSize: { width: 224, height: 224 },
  ocrMaxDimension: 1024,
  barcodeSize: { width: 512, height: 512 },
  thumbnailSize: { width: 320, height: 320 },
};

export async function preprocess(
  image: AcquiredImage,
  options: PreprocessingOptions = {}
): Promise<PreprocessedImage> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const input = sharp(image.buffer);

  const metadata = await input.metadata();
  const orientationCorrected = metadata.orientation && metadata.orientation > 1;

  if (orientationCorrected) {
    input.rotate();
  }

  const qualityScore = await assessQuality(input, metadata);

  const [
    fingerprintBuf,
    embeddingBuf,
    ocrBuf,
    barcodeBuf,
    thumbnailBuf,
  ] = await Promise.all([
    input.clone().resize(opts.fingerprintSize.width, opts.fingerprintSize.height, { fit: 'inside' }).grayscale().jpeg({ quality: 90 }).toBuffer(),
    input.clone().resize(opts.embeddingSize.width, opts.embeddingSize.height, { fit: 'inside' }).jpeg({ quality: 95 }).toBuffer(),
    input.clone().resize(null, opts.ocrMaxDimension, { fit: 'inside', withoutEnlargement: true })
      .normalize().sharpen().jpeg({ quality: 95 }).toBuffer(),
    input.clone().resize(opts.barcodeSize.width, opts.barcodeSize.height, { fit: 'inside' }).grayscale().jpeg({ quality: 90 }).toBuffer(),
    input.clone().resize(opts.thumbnailSize.width, opts.thumbnailSize.height, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer(),
  ]);

  return {
    original: image,
    variants: {
      fingerprint: fingerprintBuf,
      embedding: embeddingBuf,
      ocr: ocrBuf,
      barcode: barcodeBuf,
      thumbnail: thumbnailBuf,
    },
    orientationCorrected,
    qualityScore,
  };
}

async function assessQuality(image: sharp.Sharp, metadata: sharp.Metadata): Promise<number> {
  const { width, height } = metadata;
  if (!width || !height) return 0.5;

  let score = 1.0;

  if (width < 100 || height < 100) score *= 0.5;
  else if (width < 300 || height < 300) score *= 0.8;

  try {
    const stats = await image.clone().grayscale().stats();
    const entropy = calculateEntropy(stats);
    if (entropy < 3.0) score *= 0.6;
    else if (entropy < 4.0) score *= 0.8;
  } catch {
  }

  return Math.max(0.1, Math.min(1.0, score));
}

function calculateEntropy(stats: sharp.Stats): number {
  const { channels } = stats;
  if (!channels || channels.length === 0) return 0;
  const channel = channels[0];
  if (!channel.histogram) return 0;

  const total = channel.histogram.reduce((a, b) => a + b, 0);
  let entropy = 0;
  for (const count of channel.histogram) {
    if (count > 0) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

export function validateQuality(score: number, threshold = 0.3): { valid: boolean; reason?: string } {
  if (score < threshold) {
    return { valid: false, reason: `Image quality too low: ${(score * 100).toFixed(0)}%` };
  }
  return { valid: true };
}