import { FingerprintResult, PHashResult, EmbeddingResult, OCRResult, BarcodeResult, FeatureResult, ColorHistogram, OCRBlock, BoundingBox, BarcodeFormat, Keypoint, RGB } from '../types/core';

export interface FingerprintExtractor {
  extract(imageBuffer: Buffer): Promise<FingerprintResult>;
  extractPHash(buffer: Buffer): Promise<PHashResult>;
  extractEmbedding(buffer: Buffer): Promise<EmbeddingResult>;
  extractOCR(buffer: Buffer): Promise<OCRResult>;
  extractBarcode(buffer: Buffer): Promise<BarcodeResult>;
  extractFeatures(buffer: Buffer): Promise<FeatureResult>;
  extractColor(buffer: Buffer): Promise<ColorHistogram>;
}

export function createFingerprintExtractor(): FingerprintExtractor {
  const pHashExtractor = new PHashExtractor();
  const embeddingExtractor = new EmbeddingExtractor();
  const ocrExtractor = new OCRExtractor();
  const barcodeExtractor = new BarcodeExtractor();
  const featureExtractor = new FeatureExtractor();
  const colorExtractor = new ColorExtractor();

  return {
    extract: async (buffer: Buffer) => {
      const [pHash, embedding, ocr, barcode, features, color] = await Promise.all([
        pHashExtractor.extract(buffer),
        embeddingExtractor.extract(buffer),
        ocrExtractor.extract(buffer),
        barcodeExtractor.extract(buffer),
        featureExtractor.extract(buffer),
        colorExtractor.extract(buffer),
      ]);
      return { pHash, embedding, ocr, barcode, features, color };
    },
    extractPHash: (b) => pHashExtractor.extract(b),
    extractEmbedding: (b) => embeddingExtractor.extract(b),
    extractOCR: (b) => ocrExtractor.extract(b),
    extractBarcode: (b) => barcodeExtractor.extract(b),
    extractFeatures: (b) => featureExtractor.extract(b),
    extractColor: (b) => colorExtractor.extract(b),
  };
}

class PHashExtractor {
  async extract(buffer: Buffer): Promise<PHashResult> {
    const sharp = await import('sharp');
    const { default: dct } = await import('dct2d');

    const image = await sharp.default(buffer)
      .resize(32, 32, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = new Float32Array(image.data.buffer);
    const hash64 = this.computeDCTHash(pixels);
    const hash256 = this.computeWaveletHash(pixels);

    return {
      hash64,
      hash256: Buffer.from(hash256),
      algorithm: 'dct',
    };
  }

  private computeDCTHash(pixels: Float32Array): bigint {
    const dct = require('dct2d');
    const coeffs = dct(pixels, 32, 32);
    const median = this.median(coeffs.slice(1, 10));
    let hash = 0n;
    for (let i = 1; i < 65; i++) {
      hash = (hash << 1n) | (coeffs[i] > median ? 1n : 0n);
    }
    return hash;
  }

  private computeWaveletHash(pixels: Float32Array): Uint8Array {
    const hash = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      let sum = 0;
      for (let j = 0; j < 32; j++) {
        sum += pixels[i * 32 + j];
      }
      hash[i] = sum / 32 > 128 ? 1 : 0;
    }
    return hash;
  }

  private median(arr: Float32Array): number {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  hammingDistance(a: bigint, b: bigint): number {
    let x = a ^ b;
    let count = 0;
    while (x !== 0n) {
      count++;
      x &= x - 1n;
    }
    return count;
  }

  similarity(a: bigint, b: bigint): number {
    return 1 - this.hammingDistance(a, b) / 64;
  }
}

class EmbeddingExtractor {
  private session: any = null;
  private modelPath = process.env.DINOV2_MODEL_PATH || './models/dinov2_vits14.onnx';

  async extract(buffer: Buffer): Promise<EmbeddingResult> {
    if (!this.session) {
      await this.loadModel();
    }

    const input = this.preprocess(buffer);
    const feeds = { input: input };
    const results = await this.session.run(feeds);
    const output = results.output;

    const normalized = this.l2Normalize(output);
    return {
      vector: normalized,
      model: 'dinov2',
      dimension: 384,
      l2Normalized: true,
    };
  }

  private async loadModel(): Promise<void> {
    const ort = await import('onnxruntime-node');
    this.session = await ort.InferenceSession.create(this.modelPath, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    });
  }

  private preprocess(buffer: Buffer): Float32Array {
    const sharp = require('sharp');
    const img = sharp(buffer)
      .resize(224, 224, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = img;
    const float = new Float32Array(3 * 224 * 224);
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];

    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < 224 * 224; i++) {
        const val = data[i * 3 + c] / 255;
        float[c * 224 * 224 + i] = (val - mean[c]) / std[c];
      }
    }
    return float;
  }

  private l2Normalize(vec: Float32Array): Float32Array {
    let sum = 0;
    for (const v of vec) sum += v * v;
    const norm = Math.sqrt(sum) || 1;
    const out = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
    return out;
  }
}

class OCRExtractor {
  private worker: any = null;

  async extract(buffer: Buffer): Promise<OCRResult> {
    if (!this.worker) {
      await this.initWorker();
    }

    const result = await this.worker.recognize(buffer);
    const text = result.data.text;
    const blocks = this.parseBlocks(result.data.blocks);
    const productCodes = this.extractProductCodes(text);
    const confidence = this.calculateConfidence(result.data);

    return {
      text: text.trim(),
      blocks,
      language: 'eng',
      productCodes,
      confidence,
    };
  }

  private async initWorker(): Promise<void> {
    const { createWorker } = await import('tesseract.js');
    this.worker = await createWorker('eng', 1, {
      logger: () => {},
      cachePath: './tesseract-cache',
    });
    await this.worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.()[] ',
    });
  }

  private parseBlocks(blocks: any[]): OCRBlock[] {
    return blocks.map(b => ({
      text: b.text?.trim() || '',
      bbox: { x: b.bbox?.x0 || 0, y: b.bbox?.y0 || 0, width: b.bbox?.width || 0, height: b.bbox?.height || 0 },
      confidence: b.confidence || 0,
    })).filter(b => b.text.length > 0);
  }

  private extractProductCodes(text: string): string[] {
    const codes: string[] = [];
    const patterns = [
      /\b\d{13}\b/g,
      /\b\d{8}\b/g,
      /\b[A-Z]{2,4}\d{6,10}\b/g,
      /\b\d{4}-\d{4}-\d{4}-\d{4}\b/g,
    ];
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) codes.push(...matches);
    }
    return [...new Set(codes)];
  }

  private calculateConfidence(data: any): number {
    if (!data.blocks || data.blocks.length === 0) return 0;
    const total = data.blocks.reduce((s: number, b: any) => s + (b.confidence || 0), 0);
    return total / data.blocks.length / 100;
  }
}

class BarcodeExtractor {
  private reader: any = null;

  async extract(buffer: Buffer): Promise<BarcodeResult> {
    if (!this.reader) {
      await this.initReader();
    }

    const result = await this.reader.decode(buffer);
    if (!result || result.length === 0) {
      return { format: 'EAN13', value: '', confidence: 0, bbox: { x: 0, y: 0, width: 0, height: 0 } };
    }

    const best = result.reduce((a: any, b: any) => a.confidence > b.confidence ? a : b);
    return {
      format: this.mapFormat(best.format),
      value: best.text,
      confidence: best.confidence / 100,
      bbox: {
        x: best.box?.x || 0,
        y: best.box?.y || 0,
        width: best.box?.width || 0,
        height: best.box?.height || 0,
      },
    };
  }

  private async initReader(): Promise<void> {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    this.reader = new BrowserMultiFormatReader();
  }

  private mapFormat(format: string): BarcodeFormat {
    const map: Record<string, BarcodeFormat> = {
      'EAN_13': 'EAN13',
      'EAN_8': 'EAN8',
      'UPC_A': 'UPC_A',
      'UPC_E': 'UPC_E',
      'CODE_128': 'CODE128',
      'QR_CODE': 'QR',
      'DATA_MATRIX': 'DATAMATRIX',
      'PDF_417': 'PDF417',
    };
    return map[format] || 'EAN13';
  }
}

class FeatureExtractor {
  async extract(buffer: Buffer): Promise<FeatureResult> {
    const sharp = await import('sharp');
    const { data, info } = await sharp.default(buffer)
      .resize(512, 512, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const keypoints = this.detectORB(data, info.width, info.height);
    const descriptors = this.computeBRIEF(data, info.width, info.height, keypoints);

    return {
      keypoints,
      descriptors: Buffer.from(descriptors.buffer),
      count: keypoints.length,
    };
  }

  private detectORB(pixels: Uint8Array, width: number, height: number): Keypoint[] {
    const keypoints: Keypoint[] = [];
    const fastThreshold = 20;

    for (let y = 3; y < height - 3; y += 2) {
      for (let x = 3; x < width - 3; x += 2) {
        const center = pixels[y * width + x];
        let brighter = 0, darker = 0;

        const circle = [
          [-3, 0], [-3, 1], [-2, 2], [-1, 3], [0, 3], [1, 3], [2, 2], [3, 1],
          [3, 0], [3, -1], [2, -2], [1, -3], [0, -3], [-1, -3], [-2, -2], [-3, -1]
        ];

        for (const [dx, dy] of circle) {
          const val = pixels[(y + dy) * width + (x + dx)];
          if (val > center + fastThreshold) brighter++;
          else if (val < center - fastThreshold) darker++;
        }

        if (brighter >= 9 || darker >= 9) {
          keypoints.push({ x, y, scale: 1.0, orientation: 0, response: Math.max(brighter, darker) });
        }
      }
    }

    keypoints.sort((a, b) => b.response - a.response);
    return keypoints.slice(0, 500);
  }

  private computeBRIEF(pixels: Uint8Array, width: number, height: number, keypoints: Keypoint[]): Uint8Array {
    const pairs = this.generatePairs();
    const descSize = pairs.length;
    const descriptors = new Uint8Array(keypoints.length * descSize);

    for (let i = 0; i < keypoints.length; i++) {
      const kp = keypoints[i];
      let pattern = 0;
      for (let j = 0; j < pairs.length; j++) {
        const [dx1, dy1, dx2, dy2] = pairs[j];
        const x1 = Math.round(kp.x + dx1 * kp.scale);
        const y1 = Math.round(kp.y + dy1 * kp.scale);
        const x2 = Math.round(kp.x + dx2 * kp.scale);
        const y2 = Math.round(kp.y + dy2 * kp.scale);

        if (x1 >= 0 && x1 < width && y1 >= 0 && y1 < height &&
            x2 >= 0 && x2 < width && y2 >= 0 && y2 < height) {
          const v1 = pixels[y1 * width + x1];
          const v2 = pixels[y2 * width + x2];
          if (v1 < v2) pattern |= (1 << (j % 8));
        }
        if (j % 8 === 7) {
          descriptors[i * descSize + Math.floor(j / 8)] = pattern;
          pattern = 0;
        }
      }
    }

    return descriptors;
  }

  private generatePairs(): number[][] {
    const pairs: number[][] = [];
    const rng = new Math.seedrandom('orb-pairs');
    for (let i = 0; i < 256; i++) {
      pairs.push([
        Math.round((rng() - 0.5) * 10),
        Math.round((rng() - 0.5) * 10),
        Math.round((rng() - 0.5) * 10),
        Math.round((rng() - 0.5) * 10),
      ]);
    }
    return pairs;
  }
}

class ColorExtractor {
  async extract(buffer: Buffer): Promise<ColorHistogram> {
    const sharp = await import('sharp');
    const { data, info } = await sharp.default(buffer)
      .resize(64, 64, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const hsv = new Float32Array(32 * 8 * 4);
    const dominant: RGB[] = [];
    const palette: RGB[] = [];

    for (let i = 0; i < data.length; i += 3) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;

      let h = 0, s = 0, v = max;
      if (delta > 0) {
        s = delta / max;
        if (max === r) h = ((g - b) / delta) % 6;
        else if (max === g) h = (b - r) / delta + 2;
        else h = (r - g) / delta + 4;
        h *= 60;
      }

      const hBin = Math.floor(h / 11.25);
      const sBin = Math.floor(s * 8);
      const vBin = Math.floor(v * 4);
      const idx = (hBin * 8 + sBin) * 4 + vBin;
      hsv[idx]++;
    }

    const total = data.length / 3;
    for (let i = 0; i < hsv.length; i++) hsv[i] /= total;

    const colors = this.extractDominant(data);
    dominant.push(...colors.slice(0, 3));
    palette.push(...colors.slice(0, 8));

    return { hsv, dominant, palette };
  }

  private extractDominant(data: Uint8Array): RGB[] {
    const buckets = new Map<string, number>();
    for (let i = 0; i < data.length; i += 3) {
      const r = Math.round(data[i] / 32) * 32;
      const g = Math.round(data[i + 1] / 32) * 32;
      const b = Math.round(data[i + 2] / 32) * 32;
      const key = `${r},${g},${b}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }

    return [...buckets.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => {
        const [r, g, b] = k.split(',').map(Number);
        return { r, g, b };
      });
  }
}

function hammingDistance(a: Buffer, b: Buffer): number {
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    dist += (a[i] ^ b[i]).toString(2).split('1').length - 1;
  }
  return dist;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}