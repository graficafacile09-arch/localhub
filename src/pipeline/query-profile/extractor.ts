import {
  QueryProfile,
  BarcodeSignal,
  OCRSignal,
  VisualSignal,
  PackagingSignal,
  SemanticSignal,
  QualitySignal,
  ContextSignal,
  BoundingBox,
  RGB,
  ULID,
  generateULID,
} from '../types/product-profile';
import { createFingerprintExtractor } from '../fingerprint';
import { preprocess } from '../preprocessing';
import { acquireImage } from '../acquisition';

export class QueryProfileExtractor {
  private fingerprintExtractor = createFingerprintExtractor();

  async extract(imageInput: Buffer | string | File | Blob, options?: { queryId?: ULID }): Promise<QueryProfile> {
    const queryId = options?.queryId || generateULID();
    const acquired = await acquireImage(imageInput);
    const preprocessed = await preprocess(acquired);
    const fingerprint = await this.fingerprintExtractor.extract(preprocessed.variants.fingerprint);

    const quality = this.assessQuality(preprocessed, fingerprint);

    return {
      queryId,
      imageHash: acquired.hash,
      barcode: this.extractBarcode(fingerprint.barcode),
      ocr: this.extractOCR(fingerprint.ocr),
      visual: this.extractVisual(fingerprint),
      packaging: this.extractPackaging(fingerprint),
      semantic: await this.extractSemantic(fingerprint),
      quality: quality.signal,
      context: quality.context,
      completeness: quality.completeness,
    };
  }

  private extractBarcode(barcode: any): BarcodeSignal {
    return {
      primary: barcode.value || null,
      variants: barcode.value ? [barcode.value] : [],
      format: barcode.format || null,
      confidence: barcode.confidence || 0,
      locations: barcode.bbox ? [{ ...barcode.bbox, normalized: true }] : [],
    };
  }

  private extractOCR(ocr: any): OCRSignal {
    const productCodes: OCRSignal['productCodes'] = [];
    const textBlocks: OCRSignal['textBlocks'] = [];
    const brandDetections: OCRSignal['brandDetections'] = [];

    if (ocr.productCodes && ocr.productCodes.length > 0) {
      for (const code of ocr.productCodes) {
        const type = this.classifyCodeType(code);
        productCodes.push({
          code,
          type,
          confidence: ocr.confidence || 0.5,
          location: { x: 0, y: 0, width: 0, height: 0, normalized: true },
          sourceBlockIndex: 0,
        });
      }
    }

    if (ocr.blocks) {
      for (let i = 0; i < ocr.blocks.length; i++) {
        const block = ocr.blocks[i];
        textBlocks.push({
          text: block.text,
          bbox: { ...block.bbox, normalized: true },
          confidence: block.confidence,
          isProductCode: productCodes.some(pc => pc.sourceBlockIndex === i),
        });
      }
    }

    return {
      productCodes,
      textBlocks,
      brandDetections,
      confidence: ocr.confidence || 0,
      language: ocr.language || 'eng',
    };
  }

  private classifyCodeType(code: string): OCRSignal['productCodes'][0]['type'] {
    if (/^\d{13}$/.test(code)) return 'EAN13';
    if (/^\d{8}$/.test(code)) return 'EAN8';
    if (/^\d{12}$/.test(code)) return 'UPC';
    if (/^\d{10}$/.test(code) || /^\d{13}$/.test(code)) return 'ISBN';
    if (/^[A-Z0-9]{6,15}$/.test(code)) return 'SKU';
    if (/^[A-Z]{2,}\d{4,}$/.test(code)) return 'MODEL';
    return 'UNKNOWN';
  }

  private extractVisual(fp: any): VisualSignal {
    return {
      pHash: {
        centroids: [fp.pHash.hash64],
        radius: 8,
        sampleCount: 1,
      },
      embeddings: {
        dinov2: {
          centroid: fp.embedding.vector,
          variance: new Float32Array(fp.embedding.vector.length).fill(0.01),
          count: 1,
          radius: 0.3,
        },
        clip: fp.embedding.model === 'clip' ? {
          centroid: fp.embedding.vector,
          variance: new Float32Array(fp.embedding.vector.length).fill(0.01),
          count: 1,
          radius: 0.3,
        } : undefined,
      },
      color: {
        hsvHistogram: fp.color.hsv,
        dominant: fp.color.dominant,
        palette: fp.color.palette,
        variance: new Float32Array(50).fill(0.01),
      },
      localFeatures: {
        keypointClusters: fp.features.keypoints.length > 0 ? [{
          center: {
            x: fp.features.keypoints[0].x,
            y: fp.features.keypoints[0].y,
            scale: fp.features.keypoints[0].scale,
            orientation: fp.features.keypoints[0].orientation,
          },
          descriptor: new Uint8Array(fp.features.descriptors.slice(0, 32)),
          count: fp.features.count,
          variance: 0,
        }] : [],
        descriptorVocabulary: new Uint8Array(),
        geometricLayout: {
          aspectRatio: 1.0,
          keypointDensity: fp.features.count / 1000,
          symmetryScore: 0,
          layoutDescriptor: new Float32Array(64),
        },
      },
    };
  }

  private extractPackaging(fp: any): PackagingSignal {
    return {
      shape: {
        type: 'unknown',
        aspectRatio: 1.0,
        contourComplexity: 0,
        symmetry: { vertical: 0, horizontal: 0, radial: 0 },
        keypoints: [],
      },
      logos: [],
      layout: {
        textRegions: fp.ocr.blocks?.map((b: any) => ({
          bbox: { ...b.bbox, normalized: true },
          role: 'unknown' as const,
          readingOrder: 0,
        })) || [],
        graphicElements: [],
        gridStructure: null,
        visualHierarchy: [],
      },
      materials: {
        surface: 'unknown',
        reflectivity: 0,
        textureDescriptor: new Float32Array(32),
      },
    };
  }

  private async extractSemantic(fp: any): Promise<SemanticSignal> {
    const category = await this.predictCategory(fp);
    const brand = this.predictBrand(fp);
    const attributes = this.predictAttributes(fp);

    return {
      category,
      attributes,
      brand,
      priceTier: {
        tier: 'mid',
        estimatedRange: { min: 1, max: 100, currency: 'EUR' },
        confidence: 0.3,
      },
    };
  }

  private async predictCategory(fp: any): Promise<SemanticSignal['category']> {
    // Placeholder - would use CLIP or lightweight classifier
    return {
      path: ['Unknown'],
      leafId: 'unknown',
      confidence: 0.3,
      allPredictions: [],
    };
  }

  private predictBrand(fp: any): SemanticSignal['brand'] {
    const brandFromOCR = fp.ocr.productCodes?.find((c: string) => /^[A-Z]{2,}$/.test(c));
    return {
      brandId: brandFromOCR || null,
      name: brandFromOCR || null,
      confidence: brandFromOCR ? 0.6 : 0,
      alternatives: [],
    };
  }

  private predictAttributes(fp: any): SemanticSignal['attributes'] {
    const color = fp.color.dominant[0];
    return {
      color: { value: `rgb(${color.r},${color.g},${color.b})`, confidence: 0.5, source: 'visual' },
      size: { value: null, confidence: 0, source: 'catalog' },
      volume: { value: null, confidence: 0, source: 'catalog' },
      weight: { value: null, confidence: 0, source: 'catalog' },
      material: { value: null, confidence: 0, source: 'catalog' },
      flavor: { value: null, confidence: 0, source: 'catalog' },
      packaging: { value: null, confidence: 0, source: 'catalog' },
      custom: {},
    };
  }

  private assessQuality(preprocessed: any, fp: any): { signal: QualitySignal; context: ContextSignal; completeness: number } {
    const quality = preprocessed.qualityScore || 0.5;
    const layers = [
      { name: 'barcode', present: !!fp.barcode.value },
      { name: 'ocr', present: fp.ocr.productCodes && fp.ocr.productCodes.length > 0 },
      { name: 'visual', present: true },
      { name: 'packaging', present: false },
      { name: 'semantic', present: true },
    ];
    const completeness = layers.filter(l => l.present).length / layers.length;

    return {
      signal: {
        overall: quality,
        sharpness: quality,
        exposure: quality,
        lighting: quality,
        occlusion: 0,
        perspective: 0,
        resolution: { width: preprocessed.original.width, height: preprocessed.original.height },
        compressionArtifacts: 0,
        isSufficient: quality >= 0.3,
      },
      context: {
        sceneType: 'unknown',
        backgroundComplexity: 0.5,
        multipleObjects: false,
        objectProminence: quality,
        lightingType: 'unknown',
      },
      completeness,
    };
  }
}

export async function createQueryProfileExtractor(): Promise<QueryProfileExtractor> {
  return new QueryProfileExtractor();
}