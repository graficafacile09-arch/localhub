import { Pool } from 'pg';
import {
  ProductProfile,
  ProductImageRow,
  PHashProfile,
  EmbeddingProfile,
  VectorProfile,
  ColorProfile,
  LocalFeatureProfile,
  PackagingSignal,
  SemanticSignal,
  BarcodeSignal,
  OCRSignal,
  VisualSignal,
  QualitySignal,
  ContextSignal,
  RGB,
  KeypointCluster,
  GeometricLayout,
  ShapeProfile,
  LogoProfile,
  LayoutProfile,
  MaterialProfile,
  CategoryPrediction,
  AttributeProfile,
  AttributeValue,
  BrandPrediction,
  PriceTierPrediction,
  OCRCodeMatch,
  OCRTextBlock,
  BrandOCRMatch,
  BoundingBox,
  CorrectionEvent,
  ULID,
  cosineSimilarity,
  hammingDistance,
  updateCentroid,
  mergePHashCentroids,
} from '../types/product-profile';

export interface ProductProfileRow {
  product_id: string;
  sku: string;
  barcode_primary: string | null;
  barcode_variants: string[] | null;
  ocr_codes: any;
  phash_centroids: bigint[] | null;
  embedding_dinov2_centroid: number[] | null;
  embedding_dinov2_variance: number[] | null;
  embedding_dinov2_count: number | null;
  embedding_clip_centroid: number[] | null;
  embedding_clip_variance: number[] | null;
  embedding_clip_count: number | null;
  color_hist_centroid: number[] | null;
  color_dominant: number[][] | null;
  color_palette: number[][] | null;
  feature_clusters: Buffer | null;
  shape_descriptor: any;
  logo_embeddings: number[][] | null;
  layout_signature: Buffer | null;
  category_path: string[] | null;
  brand_id: string | null;
  attributes: any;
  price_range: any;
  total_queries: number;
  accepted_count: number;
  rejected_count: number;
  corrections: any;
  false_positives: string[] | null;
  false_negatives: string[] | null;
  confidence: number;
  version: number;
  last_updated: Date;
  created_at: Date;
}

export class ProductProfileBuilder {
  constructor(private pg: Pool) {}

  async build(productId: string): Promise<ProductProfile | null> {
    const client = await this.pg.connect();
    try {
      const profileResult = await client.query<ProductProfileRow>(`
        SELECT * FROM product_profiles WHERE product_id = $1
      `, [productId]);

      if (profileResult.rows.length === 0) return null;
      const row = profileResult.rows[0];

      const imagesResult = await client.query<ProductImageRow>(`
        SELECT * FROM product_profile_images 
        WHERE product_id = $1 AND quality > 0.3
        ORDER BY 
          CASE variant_type WHEN 'canonical' THEN 0 ELSE 1 END,
          quality DESC
        LIMIT 50
      `, [productId]);

      return this.mapRowToProfile(row, imagesResult.rows);
    } finally {
      client.release();
    }
  }

  async buildMultiple(productIds: string[]): Promise<Map<string, ProductProfile>> {
    if (productIds.length === 0) return new Map();
    
    const client = await this.pg.connect();
    try {
      const placeholders = productIds.map((_, i) => `$${i + 1}`).join(',');
      
      const profilesResult = await client.query<ProductProfileRow>(`
        SELECT * FROM product_profiles WHERE product_id IN (${placeholders})
      `, productIds);

      const imagesResult = await client.query<ProductImageRow>(`
        SELECT * FROM product_profile_images 
        WHERE product_id IN (${placeholders}) AND quality > 0.3
        ORDER BY product_id, 
          CASE variant_type WHEN 'canonical' THEN 0 ELSE 1 END,
          quality DESC
      `, productIds);

      const imagesByProduct = new Map<string, ProductImageRow[]>();
      for (const img of imagesResult.rows) {
        if (!imagesByProduct.has(img.product_id)) {
          imagesByProduct.set(img.product_id, []);
        }
        imagesByProduct.get(img.product_id)!.push(img);
      }

      const profiles = new Map<string, ProductProfile>();
      for (const row of profilesResult.rows) {
        const images = imagesByProduct.get(row.product_id) || [];
        profiles.set(row.product_id, this.mapRowToProfile(row, images));
      }
      return profiles;
    } finally {
      client.release();
    }
  }

  private mapRowToProfile(row: ProductProfileRow, images: ProductImageRow[]): ProductProfile {
    return {
      productId: row.product_id,
      sku: row.sku,
      
      barcode: this.mapBarcode(row),
      ocr: this.mapOCR(row),
      visual: this.mapVisual(row, images),
      packaging: this.mapPackaging(row),
      semantic: this.mapSemantic(row),
      
      version: row.version,
      confidence: row.confidence,
      totalQueries: row.total_queries,
      acceptedCount: row.accepted_count,
      rejectedCount: row.rejected_count,
      correctionHistory: this.mapCorrections(row.corrections),
      falsePositives: row.false_positives || [],
      falseNegatives: row.false_negatives || [],
      lastUpdated: row.last_updated,
      createdAt: row.created_at,
    };
  }

  private mapBarcode(row: ProductProfileRow): BarcodeSignal {
    return {
      primary: row.barcode_primary,
      variants: row.barcode_variants || [],
      format: row.barcode_primary ? this.detectFormat(row.barcode_primary) : null,
      confidence: row.barcode_primary ? 1.0 : 0,
      locations: [],
    };
  }

  private detectFormat(code: string): 'EAN13' | 'EAN8' | 'UPC_A' | 'UPC_E' | 'CODE128' | 'QR' | 'DATAMATRIX' | 'PDF417' {
    if (/^\d{13}$/.test(code)) return 'EAN13';
    if (/^\d{8}$/.test(code)) return 'EAN8';
    if (/^\d{12}$/.test(code)) return 'UPC_A';
    if (/^\d{8}$/.test(code)) return 'UPC_E';
    if (/^[A-Z0-9]{10,}$/.test(code)) return 'CODE128';
    return 'EAN13';
  }

  private mapOCR(row: ProductProfileRow): OCRSignal {
    const codesData = row.ocr_codes || {};
    const codes: OCRCodeMatch[] = [];

    for (const [code, data] of Object.entries(codesData)) {
      const d = data as any;
      if (d.count > 0) {
        codes.push({
          code,
          type: d.type || 'UNKNOWN',
          confidence: d.confidence || 0.8,
          location: { x: 0, y: 0, width: 0, height: 0, normalized: true },
          sourceBlockIndex: 0,
        });
      }
    }

    return {
      productCodes: codes,
      textBlocks: [],
      brandDetections: [],
      confidence: codes.length > 0 ? Math.max(...codes.map(c => c.confidence)) : 0,
      language: 'it',
    };
  }

  private mapVisual(row: ProductProfileRow, images: ProductImageRow[]): VisualSignal {
    const phashCentroids = row.phash_centroids || [];
    const dinov2Centroid = row.embedding_dinov2_centroid;
    const clipCentroid = row.embedding_clip_centroid;

    const imagePHashes = images.map(i => i.phash64).filter(Boolean);

    return {
      pHash: {
        centroids: phashCentroids.length > 0 ? phashCentroids : imagePHashes,
        radius: 12,
        sampleCount: phashCentroids.length || images.length,
      },
      embeddings: {
        dinov2: {
          centroid: dinov2Centroid ? new Float32Array(dinov2Centroid) : new Float32Array(384),
          variance: row.embedding_dinov2_variance ? new Float32Array(row.embedding_dinov2_variance) : new Float32Array(384).fill(0.01),
          count: row.embedding_dinov2_count || images.length,
          radius: 0.3,
        },
        clip: clipCentroid ? {
          centroid: new Float32Array(clipCentroid),
          variance: row.embedding_clip_variance ? new Float32Array(row.embedding_clip_variance) : new Float32Array(512).fill(0.01),
          count: row.embedding_clip_count || images.length,
          radius: 0.35,
        } : undefined,
      },
      color: this.mapColor(row),
      localFeatures: this.mapFeatures(row),
    };
  }

  private mapColor(row: ProductProfileRow): ColorProfile {
    const histogram = row.color_hist_centroid ? new Float32Array(row.color_hist_centroid) : new Float32Array(50);
    const dominant = (row.color_dominant || []).map(([r, g, b]) => ({ r, g, b }));
    const palette = (row.color_palette || []).map(([r, g, b]) => ({ r, g, b }));

    return {
      hsvHistogram: histogram,
      dominant: dominant.length > 0 ? dominant : [{ r: 128, g: 128, b: 128 }],
      palette: palette.length > 0 ? palette : Array(8).fill({ r: 128, g: 128, b: 128 }),
      variance: new Float32Array(50).fill(0.001),
    };
  }

  private mapFeatures(row: ProductProfileRow): LocalFeatureProfile {
    if (!row.feature_clusters) {
      return {
        keypointClusters: [],
        descriptorVocabulary: new Uint8Array(),
        geometricLayout: {
          aspectRatio: 1.0,
          keypointDensity: 0,
          symmetryScore: 0,
          layoutDescriptor: new Float32Array(128),
        },
      };
    }

    // Parse compressed clusters from buffer
    // For now return empty
    return {
      keypointClusters: [],
      descriptorVocabulary: new Uint8Array(),
      geometricLayout: {
        aspectRatio: 1.0,
        keypointDensity: 0,
        symmetryScore: 0,
        layoutDescriptor: new Float32Array(128),
      },
    };
  }

  private mapPackaging(row: ProductProfileRow): PackagingSignal {
    const shape = row.shape_descriptor || {};
    const logos = (row.logo_embeddings || []).map((emb, i) => ({
      brand: null,
      bbox: { x: 0, y: 0, width: 0, height: 0, normalized: true },
      confidence: 0.8,
      embedding: new Float32Array(emb),
      position: 'front' as const,
    }));

    return {
      shape: {
        type: shape.type || 'unknown',
        aspectRatio: shape.aspectRatio || 1.0,
        dimensions3D: shape.dimensions3D,
        contourComplexity: shape.contourComplexity || 0,
        symmetry: shape.symmetry || { vertical: 0, horizontal: 0, radial: 0 },
        keypoints: shape.keypoints || [],
      },
      logos,
      layout: {
        textRegions: [],
        graphicElements: [],
        gridStructure: null,
        visualHierarchy: [],
      },
      materials: {
        surface: 'unknown',
        reflectivity: 0.5,
        textureDescriptor: new Float32Array(64),
      },
    };
  }

  private mapSemantic(row: ProductProfileRow): SemanticSignal {
    const attrs = row.attributes || {};
    const custom: Record<string, AttributeValue> = {};

    for (const [key, value] of Object.entries(attrs)) {
      if (!['color', 'size', 'volume', 'weight', 'material', 'flavor', 'packaging'].includes(key)) {
        custom[key] = { value, confidence: 0.7, source: 'catalog' };
      }
    }

    return {
      category: {
        path: row.category_path || [],
        leafId: row.category_path?.[row.category_path.length - 1] || '',
        confidence: 0.9,
        allPredictions: [],
      },
      attributes: {
        color: { value: attrs.color || null, confidence: attrs.color ? 0.8 : 0, source: 'catalog' },
        size: { value: attrs.size || null, confidence: attrs.size ? 0.8 : 0, source: 'catalog' },
        volume: { value: attrs.volume || null, confidence: attrs.volume ? 0.8 : 0, source: 'catalog' },
        weight: { value: attrs.weight || null, confidence: attrs.weight ? 0.8 : 0, source: 'catalog' },
        material: { value: attrs.material || null, confidence: attrs.material ? 0.8 : 0, source: 'catalog' },
        flavor: { value: attrs.flavor || null, confidence: attrs.flavor ? 0.8 : 0, source: 'catalog' },
        packaging: { value: attrs.packaging || null, confidence: attrs.packaging ? 0.8 : 0, source: 'catalog' },
        custom,
      },
      brand: {
        brandId: row.brand_id || null,
        name: null,
        confidence: row.brand_id ? 1.0 : 0,
        alternatives: [],
      },
      priceTier: {
        tier: 'mid',
        estimatedRange: { min: 0, max: 1000, currency: 'EUR' },
        confidence: 0.5,
      },
    };
  }

  private mapCorrections(corrections: any): CorrectionEvent[] {
    if (!corrections || !Array.isArray(corrections)) return [];
    return corrections.map(c => ({
      fromQueryId: c.fromQueryId,
      toProductId: c.toProductId,
      timestamp: new Date(c.timestamp),
      wasFalsePositive: c.wasFalsePositive || false,
    }));
  }
}

export async function createProductProfileBuilder(pg: Pool): Promise<ProductProfileBuilder> {
  return new ProductProfileBuilder(pg);
}