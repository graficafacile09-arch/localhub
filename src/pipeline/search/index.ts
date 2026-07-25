import { Pool, PoolConfig } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { FingerprintResult, ProductCandidate, MatchSignals, RankedResult, SearchOptions, THRESHOLDS, FUSION_WEIGHTS, tierFromScore, shouldUseAI } from '../types/core';

export interface SearchIndex {
  search(fingerprint: FingerprintResult, options: SearchOptions): Promise<ProductCandidate[]>;
  add(productImage: ProductImageRecord): Promise<void>;
  remove(productImageId: string): Promise<void>;
  update(productImage: ProductImageRecord): Promise<void>;
}

export interface ProductImageRecord {
  id: string;
  productId: string;
  phash64: bigint;
  phash256: Buffer;
  embeddingDinov2: Float32Array;
  embeddingClip?: Float32Array;
  ocrText: string;
  barcodeValue: string | null;
  barcodeFormat: string | null;
  colorHist: Float32Array;
  featureDescriptors: Buffer;
  qualityScore: number;
  isCanonical: boolean;
}

export class SearchCoordinator {
  private indices: Map<string, SearchIndex> = new Map();
  private catalog: CatalogService;
  private ranker: RankingService;

  constructor(
    private pgPool: Pool,
    private redis: RedisClientType
  ) {
    this.catalog = new CatalogService(pgPool);
    this.ranker = new RankingService();
  }

  async initialize(): Promise<void> {
    this.indices.set('phash', new PHashIndex(this.pgPool, this.redis));
    this.indices.set('vector', new VectorIndex(this.pgPool, this.redis));
    this.indices.set('ocr', new OCRIndex(this.pgPool, this.redis));
    this.indices.set('barcode', new BarcodeIndex(this.pgPool, this.redis));
    this.indices.set('features', new FeatureIndex(this.pgPool, this.redis));
    this.indices.set('color', new ColorIndex(this.redis));

    await Promise.all(
      [...this.indices.values()].map(idx => idx.initialize?.())
    );
  }

  async search(
    fingerprint: FingerprintResult,
    options: SearchOptions = {}
  ): Promise<RankedResult[]> {
    const candidatePromises = [...this.indices.entries()].map(
      async ([name, index]) => {
        try {
          const candidates = await index.search(fingerprint, options);
          return { index: name, candidates };
        } catch (err) {
          console.error(`Search index ${name} failed:`, err);
          return { index: name, candidates: [] };
        }
      }
    );

    const results = await Promise.all(candidatePromises);
    const allCandidates = new Map<string, ProductCandidate>();

    for (const { index, candidates } of results) {
      for (const candidate of candidates) {
        const existing = allCandidates.get(candidate.productId);
        if (!existing || this.mergeSignals(existing, candidate, index)) {
          allCandidates.set(candidate.productId, candidate);
        }
      }
    }

    const enriched = await this.catalog.enrich([...allCandidates.values()]);
    const ranked = this.ranker.rank(enriched, fingerprint);

    return ranked;
  }

  private mergeSignals(existing: ProductCandidate, candidate: ProductCandidate, index: string): boolean {
    const existingScore = this.scoreCandidate(existing);
    const newScore = this.scoreCandidate(candidate);
    return newScore > existingScore;
  }

  private scoreCandidate(candidate: ProductCandidate): number {
    return (
      (candidate.matchSignals?.pHash?.score || 0) * FUSION_WEIGHTS.pHash +
      (candidate.matchSignals?.vector?.score || 0) * FUSION_WEIGHTS.vector +
      (candidate.matchSignals?.ocr?.fuzzyScore || 0) * FUSION_WEIGHTS.ocrExact +
      (candidate.matchSignals?.barcode?.matched ? 1 : 0) * FUSION_WEIGHTS.barcode +
      (candidate.matchSignals?.features?.inliers || 0) * FUSION_WEIGHTS.features +
      (candidate.matchSignals?.color?.score || 0) * FUSION_WEIGHTS.color
    );
  }

  async addProductImage(record: ProductImageRecord): Promise<void> {
    await Promise.all(
      [...this.indices.values()].map(idx => idx.add(record))
    );
  }

  async removeProductImage(id: string): Promise<void> {
    await Promise.all(
      [...this.indices.values()].map(idx => idx.remove(id))
    );
  }

  async close(): Promise<void> {
    await Promise.all(
      [...this.indices.values()].map(idx => idx.close?.())
    );
  }
}

class PHashIndex implements SearchIndex {
  private lshBuckets: Map<number, Set<string>> = new Map();
  private bkTrees: Map<number, BKTree> = new Map();

  constructor(private pg: Pool, private redis: RedisClientType) {}

  async initialize(): Promise<void> {
    await this.loadFromDatabase();
  }

  private async loadFromDatabase(): Promise<void> {
    const result = await this.pg.query(`
      SELECT id, phash64, phash256 FROM product_images
      WHERE status = 'active'
    `);

    for (const row of result.rows) {
      const prefix = Number(row.phash64 >> 48n) & 0xFFFF;
      if (!this.lshBuckets.has(prefix)) {
        this.lshBuckets.set(prefix, new Set());
        this.bkTrees.set(prefix, new BKTree());
      }
      this.lshBuckets.get(prefix)!.add(row.id);
      this.bkTrees.get(prefix)!.insert(row.phash64, row.id);
    }
  }

  async search(fp: FingerprintResult, options: SearchOptions): Promise<ProductCandidate[]> {
    const queryHash = fp.pHash.hash64;
    const prefix = Number(queryHash >> 48n) & 0xFFFF;
    const candidates: ProductCandidate[] = [];

    const bucket = this.lshBuckets.get(prefix);
    if (!bucket) return candidates;

    const tree = this.bkTrees.get(prefix);
    if (!tree) return candidates;

    const maxDist = this.maxDistanceForThreshold(options.threshold || 'auto');
    const matches = tree.search(queryHash, maxDist);

    for (const { id, distance } of matches.slice(0, options.maxResults || 100)) {
      candidates.push(this.buildCandidate(id, distance));
    }

    return candidates;
  }

  private maxDistanceForThreshold(threshold: string): number {
    switch (threshold) {
      case 'exact': return 8;
      case 'high': return 12;
      case 'medium': return 16;
      case 'low': return 24;
      default: return 16;
    }
  }

  private async buildCandidate(id: string, distance: number): Promise<ProductCandidate> {
    const score = 1 - distance / 64;
    const result = await this.pg.query(
      'SELECT product_id FROM product_images WHERE id = $1',
      [id]
    );

    return {
      productId: result.rows[0]?.product_id || '',
      sku: '',
      name: '',
      brand: '',
      category: [],
      images: [],
      price: { amount: 0, currency: 'EUR' },
      availability: { inStock: true },
      attributes: {},
      embeddings: [],
      fingerprints: { pHash: { distance, score } },
      matchSignals: {
        pHash: { distance, score },
        vector: { cosine: 0, score: 0 },
        ocr: { exact: false, fuzzyScore: 0 },
        barcode: { matched: false, format: '' },
        features: { inliers: 0, homography: false },
        color: { distance: 0, score: 0 },
        catalog: { categoryMatch: false, attrMatch: 0 },
      },
    };
  }

  async add(record: ProductImageRecord): Promise<void> {
    const prefix = Number(record.phash64 >> 48n) & 0xFFFF;
    if (!this.lshBuckets.has(prefix)) {
      this.lshBuckets.set(prefix, new Set());
      this.bkTrees.set(prefix, new BKTree());
    }
    this.lshBuckets.get(prefix)!.add(record.id);
    this.bkTrees.get(prefix)!.insert(record.phash64, record.id);
  }

  async remove(id: string): Promise<void> {
    for (const [prefix, bucket] of this.lshBuckets) {
      if (bucket.has(id)) {
        bucket.delete(id);
        this.bkTrees.get(prefix)?.remove(id);
        break;
      }
    }
  }

  async update(record: ProductImageRecord): Promise<void> {
    await this.remove(record.id);
    await this.add(record);
  }

  async close(): Promise<void> {}
}

class BKTree {
  private root: BKNode | null = null;

  insert(hash: bigint, id: string): void {
    if (!this.root) {
      this.root = { hash, id, children: new Map() };
      return;
    }
    this.insertRec(this.root, hash, id);
  }

  private insertRec(node: BKNode, hash: bigint, id: string): void {
    const dist = this.hamming(node.hash, hash);
    if (dist === 0) return;

    let child = node.children.get(dist);
    if (!child) {
      child = { hash, id, children: new Map() };
      node.children.set(dist, child);
    } else {
      this.insertRec(child, hash, id);
    }
  }

  search(query: bigint, maxDist: number): Array<{ id: string; distance: number }> {
    const results: Array<{ id: string; distance: number }> = [];
    if (this.root) this.searchRec(this.root, query, maxDist, results);
    results.sort((a, b) => a.distance - b.distance);
    return results;
  }

  private searchRec(node: BKNode, query: bigint, maxDist: number, results: Array<{ id: string; distance: number }>): void {
    const dist = this.hamming(node.hash, query);
    if (dist <= maxDist) results.push({ id: node.id, distance: dist });

    for (let d = Math.max(1, dist - maxDist); d <= dist + maxDist; d++) {
      const child = node.children.get(d);
      if (child) this.searchRec(child, query, maxDist, results);
    }
  }

  remove(id: string): boolean {
    return this.removeRec(this.root, null, 0, id);
  }

  private removeRec(node: BKNode | null, parent: BKNode | null, distFromParent: number, id: string): boolean {
    if (!node) return false;
    if (node.id === id) {
      if (parent) parent.children.delete(distFromParent);
      else this.root = null;
      return true;
    }
    for (const [d, child] of node.children) {
      if (this.removeRec(child, node, d, id)) return true;
    }
    return false;
  }

  private hamming(a: bigint, b: bigint): number {
    let x = a ^ b;
    let count = 0;
    while (x !== 0n) {
      count++;
      x &= x - 1n;
    }
    return count;
  }
}

interface BKNode {
  hash: bigint;
  id: string;
  children: Map<number, BKNode>;
}

class VectorIndex implements SearchIndex {
  constructor(private pg: Pool, private redis: RedisClientType) {}

  async initialize(): Promise<void> {}

  async search(fp: FingerprintResult, options: SearchOptions): Promise<ProductCandidate[]> {
    const embedding = fp.embedding.vector;
    const dim = fp.embedding.dimension;
    const col = dim === 512 ? 'embedding_dinov2' : 'embedding_clip';

    const result = await this.pg.query(`
      SELECT pi.id, pi.product_id, 1 - (pi.${col} <=> $1) as cosine
      FROM product_images pi
      WHERE pi.${col} IS NOT NULL
      ORDER BY pi.${col} <=> $1
      LIMIT $2
    `, [JSON.stringify(Array.from(embedding)), options.maxResults || 50]);

    return result.rows.map(row => ({
      productId: row.product_id,
      sku: '',
      name: '',
      brand: '',
      category: [],
      images: [],
      price: { amount: 0, currency: 'EUR' },
      availability: { inStock: true },
      attributes: {},
      embeddings: [],
      fingerprints: {},
      matchSignals: {
        pHash: { distance: 0, score: 0 },
        vector: { cosine: row.cosine, score: row.cosine },
        ocr: { exact: false, fuzzyScore: 0 },
        barcode: { matched: false, format: '' },
        features: { inliers: 0, homography: false },
        color: { distance: 0, score: 0 },
        catalog: { categoryMatch: false, attrMatch: 0 },
      },
    }));
  }

  async add(record: ProductImageRecord): Promise<void> {
    await this.pg.query(`
      UPDATE product_images
      SET embedding_dinov2 = $1, embedding_clip = $2
      WHERE id = $3
    `, [JSON.stringify(Array.from(record.embeddingDinov2)),
        record.embeddingClip ? JSON.stringify(Array.from(record.embeddingClip)) : null,
        record.id]);
  }

  async remove(id: string): Promise<void> {}
  async update(record: ProductImageRecord): Promise<void> { await this.add(record); }
}

class OCRIndex implements SearchIndex {
  constructor(private pg: Pool, private redis: RedisClientType) {}

  async initialize(): Promise<void> {}

  async search(fp: FingerprintResult, options: SearchOptions): Promise<ProductCandidate[]> {
    const codes = fp.ocr.productCodes;
    if (codes.length === 0) return [];

    const placeholders = codes.map((_, i) => `$${i + 1}`).join(',');
    const result = await this.pg.query(`
      SELECT DISTINCT pi.id, pi.product_id
      FROM product_images pi
      WHERE pi.ocr_text ILIKE ANY(ARRAY[${placeholders}])
    `, codes.flatMap(c => [`%${c}%`]));

    return result.rows.map(row => ({
      productId: row.product_id,
      sku: '',
      name: '',
      brand: '',
      category: [],
      images: [],
      price: { amount: 0, currency: 'EUR' },
      availability: { inStock: true },
      attributes: {},
      embeddings: [],
      fingerprints: {},
      matchSignals: {
        pHash: { distance: 0, score: 0 },
        vector: { cosine: 0, score: 0 },
        ocr: { exact: true, fuzzyScore: 1 },
        barcode: { matched: false, format: '' },
        features: { inliers: 0, homography: false },
        color: { distance: 0, score: 0 },
        catalog: { categoryMatch: false, attrMatch: 0 },
      },
    }));
  }

  async add(record: ProductImageRecord): Promise<void> {}
  async remove(id: string): Promise<void> {}
  async update(record: ProductImageRecord): Promise<void> {}
}

class BarcodeIndex implements SearchIndex {
  constructor(private pg: Pool, private redis: RedisClientType) {}

  async initialize(): Promise<void> {}

  async search(fp: FingerprintResult, options: SearchOptions): Promise<ProductCandidate[]> {
    if (!fp.barcode.value) return [];

    const result = await this.pg.query(`
      SELECT pi.id, pi.product_id
      FROM product_images pi
      WHERE pi.barcode_value = $1
    `, [fp.barcode.value]);

    return result.rows.map(row => ({
      productId: row.product_id,
      sku: '',
      name: '',
      brand: '',
      category: [],
      images: [],
      price: { amount: 0, currency: 'EUR' },
      availability: { inStock: true },
      attributes: {},
      embeddings: [],
      fingerprints: {},
      matchSignals: {
        pHash: { distance: 0, score: 0 },
        vector: { cosine: 0, score: 0 },
        ocr: { exact: false, fuzzyScore: 0 },
        barcode: { matched: true, format: fp.barcode.format },
        features: { inliers: 0, homography: false },
        color: { distance: 0, score: 0 },
        catalog: { categoryMatch: false, attrMatch: 0 },
      },
    }));
  }

  async add(record: ProductImageRecord): Promise<void> {}
  async remove(id: string): Promise<void> {}
  async update(record: ProductImageRecord): Promise<void> {}
}

class FeatureIndex implements SearchIndex {
  constructor(private pg: Pool, private redis: RedisClientType) {}

  async initialize(): Promise<void> {}

  async search(fp: FingerprintResult, options: SearchOptions): Promise<ProductCandidate[]> {
    if (fp.features.count < 10) return [];

    const result = await this.pg.query(`
      SELECT pi.id, pi.product_id, pi.feature_descriptors
      FROM product_images pi
      WHERE pi.feature_descriptors IS NOT NULL
      LIMIT 1000
    `);

    const candidates: ProductCandidate[] = [];

    for (const row of result.rows) {
      const inliers = this.matchFeatures(fp.features.descriptors, row.feature_descriptors);
      if (inliers >= 15) {
        candidates.push({
          productId: row.product_id,
          sku: '',
          name: '',
          brand: '',
          category: [],
          images: [],
          price: { amount: 0, currency: 'EUR' },
          availability: { inStock: true },
          attributes: {},
          embeddings: [],
          fingerprints: {},
          matchSignals: {
            pHash: { distance: 0, score: 0 },
            vector: { cosine: 0, score: 0 },
            ocr: { exact: false, fuzzyScore: 0 },
            barcode: { matched: false, format: '' },
            features: { inliers, homography: inliers >= 20 },
            color: { distance: 0, score: 0 },
            catalog: { categoryMatch: false, attrMatch: 0 },
          },
        });
      }
    }

    return candidates.sort((a, b) =>
      (b.matchSignals.features.inliers || 0) - (a.matchSignals.features.inliers || 0)
    );
  }

  private matchFeatures(desc1: Buffer, desc2: Buffer): number {
    const d1 = new Uint8Array(desc1);
    const d2 = new Uint8Array(desc2);
    const descSize = 32;
    let matches = 0;

    for (let i = 0; i < d1.length; i += descSize) {
      let bestDist = Infinity;
      for (let j = 0; j < d2.length; j += descSize) {
        const dist = this.hamming(d1.subarray(i, i + descSize), d2.subarray(j, j + descSize));
        if (dist < bestDist) bestDist = dist;
      }
      if (bestDist < 32) matches++;
    }

    return matches;
  }

  private hamming(a: Uint8Array, b: Uint8Array): number {
    let dist = 0;
    for (let i = 0; i < a.length; i++) {
      dist += (a[i] ^ b[i]).toString(2).split('1').length - 1;
    }
    return dist;
  }

  async add(record: ProductImageRecord): Promise<void> {}
  async remove(id: string): Promise<void> {}
  async update(record: ProductImageRecord): Promise<void> {}
}

class ColorIndex implements SearchIndex {
  constructor(private redis: RedisClientType) {}

  async initialize(): Promise<void> {}

  async search(fp: FingerprintResult, options: SearchOptions): Promise<ProductCandidate[]> {
    return [];
  }

  async add(record: ProductImageRecord): Promise<void> {}
  async remove(id: string): Promise<void> {}
  async update(record: ProductImageRecord): Promise<void> {}
}

export class CatalogService {
  constructor(private pg: Pool) {}

  async enrich(candidates: ProductCandidate[]): Promise<ProductCandidate[]> {
    if (candidates.length === 0) return [];

    const ids = [...new Set(candidates.map(c => c.productId))];
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');

    const result = await this.pg.query(`
      SELECT p.*, pi.embedding_dinov2, pi.embedding_clip, pi.phash64, pi.phash256,
             pi.ocr_text, pi.barcode_value, pi.barcode_format, pi.color_hist,
             pi.feature_descriptors, pi.quality_score, pi.is_canonical
      FROM products p
      LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.status = 'active'
      WHERE p.id IN (${placeholders})
    `, ids);

    const productMap = new Map<string, any>();
    for (const row of result.rows) {
      if (!productMap.has(row.id)) {
        productMap.set(row.id, {
          ...row,
          images: [],
          embeddings: [],
          fingerprints: { pHash: {} },
        });
      }
      if (row.embedding_dinov2) {
        productMap.get(row.id).images.push({
          embedding: row.embedding_dinov2,
          phash64: row.phash64,
        });
      }
    }

    return candidates.map(c => {
      const prod = productMap.get(c.productId);
      if (!prod) return c;

      return {
        ...c,
        sku: prod.sku,
        name: prod.name,
        brand: prod.brand || '',
        category: prod.category_path || [],
        images: prod.images || [],
        price: { amount: prod.price_amount || 0, currency: prod.price_currency || 'EUR' },
        availability: { inStock: prod.in_stock !== false },
        attributes: prod.attributes || {},
        embeddings: prod.images.map((i: any) => i.embedding).filter(Boolean),
        fingerprints: {
          pHash: { hash64: prod.phash64, hash256: prod.phash256 },
        },
        matchSignals: {
          ...c.matchSignals,
          catalog: {
            categoryMatch: true,
            attrMatch: this.attributeMatch(c.attributes, prod.attributes),
          },
        },
      };
    });
  }

  private attributeMatch(a: Record<string, string>, b: Record<string, string>): number {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let matches = 0;
    for (const k of keys) {
      if (a[k] && b[k] && a[k].toLowerCase() === b[k].toLowerCase()) matches++;
    }
    return keys.size > 0 ? matches / keys.size : 0;
  }
}

export class RankingService {
  rank(candidates: ProductCandidate[], fingerprint: FingerprintResult): RankedResult[] {
    const ranked = candidates.map(candidate => {
      const signals = this.computeSignals(candidate, fingerprint);
      const finalScore = this.fuseSignals(signals);
      const tier = tierFromScore(finalScore);
      const explanation = this.generateExplanation(signals, tier);

      return { candidate, signals, finalScore, tier, explanation };
    });

    ranked.sort((a, b) => b.finalScore - a.finalScore);
    return ranked;
  }

  private computeSignals(c: ProductCandidate, fp: FingerprintResult): MatchSignals {
    return {
      pHash: c.matchSignals.pHash || { distance: 0, score: 0 },
      vector: c.matchSignals.vector || { cosine: 0, score: 0 },
      ocr: c.matchSignals.ocr || { exact: false, fuzzyScore: 0 },
      barcode: c.matchSignals.barcode || { matched: false, format: '' },
      features: c.matchSignals.features || { inliers: 0, homography: false },
      color: c.matchSignals.color || { distance: 0, score: 0 },
      catalog: c.matchSignals.catalog || { categoryMatch: false, attrMatch: 0 },
    };
  }

  private fuseSignals(s: MatchSignals): number {
    let score = 0;
    let totalWeight = 0;

    if (s.barcode.matched) {
      score += FUSION_WEIGHTS.barcode;
      totalWeight += FUSION_WEIGHTS.barcode;
    }
    if (s.ocr.exact) {
      score += FUSION_WEIGHTS.ocrExact * s.ocr.fuzzyScore;
      totalWeight += FUSION_WEIGHTS.ocrExact;
    }
    if (s.pHash.score > 0) {
      score += FUSION_WEIGHTS.pHash * s.pHash.score;
      totalWeight += FUSION_WEIGHTS.pHash;
    }
    if (s.vector.score > 0) {
      score += FUSION_WEIGHTS.vector * s.vector.score;
      totalWeight += FUSION_WEIGHTS.vector;
    }
    if (s.features.inliers > 0) {
      score += FUSION_WEIGHTS.features * Math.min(1, s.features.inliers / 50);
      totalWeight += FUSION_WEIGHTS.features;
    }
    if (s.color.score > 0) {
      score += FUSION_WEIGHTS.color * s.color.score;
      totalWeight += FUSION_WEIGHTS.color;
    }
    if (s.catalog.categoryMatch) {
      score += FUSION_WEIGHTS.catalog * s.catalog.attrMatch;
      totalWeight += FUSION_WEIGHTS.catalog;
    }

    const baseScore = totalWeight > 0 ? score / totalWeight : 0;

    let agreementBonus = 0;
    const strongSignals = [
      s.barcode.matched,
      s.ocr.exact && s.ocr.fuzzyScore > 0.8,
      s.pHash.score > 0.9,
      s.vector.score > 0.85,
      s.features.inliers > 20,
    ].filter(Boolean).length;

    if (strongSignals >= 2) agreementBonus += 0.1 * (strongSignals - 1);

    return Math.min(1, baseScore + agreementBonus);
  }

  private generateExplanation(s: MatchSignals, tier: string): string {
    const reasons: string[] = [];
    if (s.barcode.matched) reasons.push(`barcode (${s.barcode.format})`);
    if (s.ocr.exact) reasons.push('product code OCR');
    if (s.pHash.score > 0.85) reasons.push(`pHash ${(s.pHash.score * 100).toFixed(0)}%`);
    if (s.vector.score > 0.8) reasons.push(`visual ${(s.vector.score * 100).toFixed(0)}%`);
    if (s.features.inliers > 15) reasons.push(`${s.features.inliers} feature matches`);
    return reasons.length > 0
      ? `Match via ${reasons.join(', ')} — ${tier} confidence`
      : `No strong signals — ${tier} confidence`;
  }
}

export async function createSearchCoordinator(
  pgConfig: PoolConfig,
  redisUrl: string
): Promise<SearchCoordinator> {
  const pg = new Pool(pgConfig);
  const redis = createClient({ url: redisUrl });
  await redis.connect();

  const coordinator = new SearchCoordinator(pg, redis);
  await coordinator.initialize();
  return coordinator;
}