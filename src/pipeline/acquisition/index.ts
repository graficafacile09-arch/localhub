import { ULID, generateULID, AcquiredImage, ExifData } from '../types/core';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';
import fetch from 'node-fetch';

export interface AcquisitionOptions {
  maxDimension?: number;
  quality?: number;
  stripExif?: boolean;
  deduplicationWindowMs?: number;
}

const DEFAULT_OPTIONS: Required<AcquisitionOptions> = {
  maxDimension: 2048,
  quality: 85,
  stripExif: true,
  deduplicationWindowMs: 5 * 60 * 1000,
};

const recentHashes = new Map<string, number>();

export async function acquireImage(
  input: Buffer | string | File | Blob,
  options: AcquisitionOptions = {}
): Promise<AcquiredImage> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let buffer: Buffer;
  let source: AcquiredImage['source'] = 'upload';
  let mimeType = 'image/jpeg';

  if (Buffer.isBuffer(input)) {
    buffer = input;
  } else if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      buffer = dataUrlToBuffer(input);
    } else if (input.startsWith('http')) {
      const response = await fetch(input);
      buffer = Buffer.from(await response.arrayBuffer());
      source = 'url';
    } else {
      throw new Error('Invalid string input: must be data URL or HTTP URL');
    }
  } else if (input instanceof Blob) {
    buffer = Buffer.from(await input.arrayBuffer());
    mimeType = input.type || 'image/jpeg';
    source = 'clipboard';
  } else {
    throw new Error('Unsupported input type');
  }

  const processed = await preprocessForAcquisition(buffer, opts);
  const hash = createHash('sha256').update(processed.buffer).digest('hex');

  if (isDuplicate(hash, opts.deduplicationWindowMs)) {
    throw new Error('DUPLICATE_IMAGE');
  }

  recordHash(hash);

  const id = generateULID();
  const exif = await extractExif(buffer);

  return {
    id,
    buffer: processed.buffer,
    mimeType: 'image/jpeg',
    width: processed.width,
    height: processed.height,
    size: processed.buffer.length,
    source,
    capturedAt: new Date(),
    exif,
    hash,
    qualityScore: processed.qualityScore,
  };
}

async function preprocessForAcquisition(
  buffer: Buffer,
  options: Required<AcquisitionOptions>
): Promise<{ buffer: Buffer; width: number; height: number; qualityScore: number }> {
  const sharp = await import('sharp');
  const image = sharp.default(buffer);

  const metadata = await image.metadata();
  const { width, height, format, orientation } = metadata;

  let qualityScore = 1.0;

  if (width && width > options.maxDimension || height && height > options.maxDimension) {
    const scale = Math.min(
      options.maxDimension / (width || options.maxDimension),
      options.maxDimension / (height || options.maxDimension)
    );
    image.resize(Math.round((width || options.maxDimension) * scale), Math.round((height || options.maxDimension) * scale));
    qualityScore *= 0.9;
  }

  if (options.stripExif) {
    image.withMetadata({ orientation: 0 });
  } else if (orientation && orientation > 1) {
    image.rotate();
  }

  image.jpeg({ quality: options.quality, mozjpeg: true });

  const outputBuffer = await image.toBuffer();
  const outMetadata = await sharp.default(outputBuffer).metadata();

  return {
    buffer: outputBuffer,
    width: outMetadata.width || 0,
    height: outMetadata.height || 0,
    qualityScore: Math.max(0.1, qualityScore),
  };
}

async function extractExif(buffer: Buffer): Promise<ExifData | undefined> {
  try {
    const sharp = await import('sharp');
    const metadata = await sharp.default(buffer).metadata();
    return {
      orientation: metadata.orientation,
      make: metadata.exif?.make,
      model: metadata.exif?.model,
      dateTimeOriginal: metadata.exif?.dateTimeOriginal,
      gpsLatitude: metadata.exif?.gpsLatitude,
      gpsLongitude: metadata.exif?.gpsLongitude,
    };
  } catch {
    return undefined;
  }
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid data URL');
  return Buffer.from(matches[2], 'base64');
}

function isDuplicate(hash: string, windowMs: number): boolean {
  const now = Date.now();
  const lastSeen = recentHashes.get(hash);
  if (lastSeen && now - lastSeen < windowMs) {
    return true;
  }
  return false;
}

function recordHash(hash: string): void {
  const now = Date.now();
  recentHashes.set(hash, now);
  for (const [key, timestamp] of recentHashes.entries()) {
    if (now - timestamp > 10 * 60 * 1000) {
      recentHashes.delete(key);
    }
  }
}

export function clearDeduplicationCache(): void {
  recentHashes.clear();
}

export function getDeduplicationStats(): { size: number; oldest: number | null; newest: number | null } {
  let oldest: number | null = null;
  let newest: number | null = null;
  for (const ts of recentHashes.values()) {
    if (oldest === null || ts < oldest) oldest = ts;
    if (newest === null || ts > newest) newest = ts;
  }
  return { size: recentHashes.size, oldest, newest };
}