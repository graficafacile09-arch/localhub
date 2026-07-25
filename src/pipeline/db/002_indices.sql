-- 002_indices.sql - Search Indices for Multi-Index Pipeline

-- pHash LSH Index (16-bit prefix buckets)
CREATE INDEX idx_product_images_phash_lsh ON product_images
USING hash ((phash64 >> 48) & 65535);

-- pHash exact/near match (BK-Tree emulation via ordered scan)
CREATE INDEX idx_product_images_phash64 ON product_images (phash64);

-- Vector Indices (HNSW via pgvector)
CREATE INDEX idx_product_images_embedding_dinov2 ON product_images
USING hnsw (embedding_dinov2 vector_cosine_ops)
WITH (m = 16, ef_construction = 200);

CREATE INDEX idx_product_images_embedding_clip ON product_images
USING hnsw (embedding_clip vector_cosine_ops)
WITH (m = 16, ef_construction = 200);

-- Product centroid index for fast category-level search
CREATE INDEX idx_products_embedding_centroid_dinov2 ON products
USING hnsw (embedding_centroid_dinov2 vector_cosine_ops)
WITH (m = 16, ef_construction = 200);

-- OCR Full-Text Search (Italian + English)
CREATE INDEX idx_product_images_ocr_gin ON product_images
USING GIN (to_tsvector('italian', ocr_text));

CREATE INDEX idx_product_images_ocr_simple_gin ON product_images
USING GIN (to_tsvector('simple', ocr_text));

-- Barcode Exact Match
CREATE INDEX idx_product_images_barcode ON product_images (barcode_value)
WHERE barcode_value IS NOT NULL;

-- Color Histogram (L2 Distance via VECTOR)
CREATE INDEX idx_product_images_color_hist ON product_images
USING hnsw (color_hist vector_l2_ops)
WITH (m = 16, ef_construction = 200)
WHERE color_hist IS NOT NULL;

-- Feature descriptors - not indexed directly (used for geometric verification)

-- Composite index for active catalog images
CREATE INDEX idx_product_images_active_catalog ON product_images (product_id, status)
WHERE status = 'active' AND source = 'catalog';

-- Quality filter
CREATE INDEX idx_product_images_quality ON product_images (quality_score DESC)
WHERE quality_score > 0.5;

-- Query Log Indices (on partitioned table - automatically applied to partitions)
CREATE INDEX idx_query_log_created ON query_log (created_at DESC);
CREATE INDEX idx_query_log_tier ON query_log (tier);
CREATE INDEX idx_query_log_ai_used ON query_log (ai_used);
CREATE INDEX idx_query_log_top_candidate ON query_log (top_candidate_id);
CREATE INDEX idx_query_log_user_action ON query_log (user_action);

-- Partial index for AI fallback analysis
CREATE INDEX idx_query_log_ai_fallback ON query_log (created_at DESC, ai_model, ai_confidence)
WHERE ai_used = true;

-- Partial index for training data (accepted high-confidence)
CREATE INDEX idx_query_log_training ON query_log (created_at DESC)
WHERE user_action = 'accepted' AND final_score > 0.9;

-- Feedback Events
CREATE INDEX idx_feedback_correction ON feedback_events (correction_id)
WHERE correction_id IS NOT NULL;

-- Product Feedback
CREATE TABLE product_feedback (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_hash      CHAR(64) NOT NULL,
    feedback_type   VARCHAR(20) NOT NULL CHECK (feedback_type IN ('positive', 'negative')),
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (product_id, image_hash, feedback_type)
);

CREATE INDEX idx_product_feedback_product ON product_feedback (product_id);
CREATE INDEX idx_product_feedback_type ON product_feedback (feedback_type);

-- Fusion Weight Adjustments (for learning)
CREATE TABLE fusion_weight_adjustments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id        UUID NOT NULL REFERENCES query_log(id),
    product_id      UUID NOT NULL REFERENCES products(id),
    adjustment      REAL NOT NULL,
    signal_name     VARCHAR(50),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fwa_query ON fusion_weight_adjustments (query_id);
CREATE INDEX idx_fwa_product ON fusion_weight_adjustments (product_id);

-- Fusion Weights History
CREATE TABLE fusion_weights (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    weights         JSONB NOT NULL,
    trained_at      TIMESTAMPTZ DEFAULT now(),
    sample_count    INTEGER,
    metrics         JSONB DEFAULT '{}'
);

-- Materialized View for Product Statistics
CREATE MATERIALIZED VIEW mv_product_stats AS
SELECT
    p.id AS product_id,
    p.sku,
    p.name,
    p.brand_id,
    p.category_id,
    COUNT(pi.id) AS image_count,
    AVG(pi.quality_score) AS avg_quality,
    MAX(pi.quality_score) AS max_quality,
    COUNT(DISTINCT pi.phash64) AS unique_phashes,
    COUNT(pi.id) FILTER (WHERE pi.source = 'catalog') AS catalog_images,
    COUNT(pi.id) FILTER (WHERE pi.source = 'user_feedback') AS feedback_images,
    COUNT(pi.id) FILTER (WHERE pi.source = 'ai_generated') AS ai_images
FROM products p
LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.status = 'active'
GROUP BY p.id, p.sku, p.name, p.brand_id, p.category_id;

CREATE UNIQUE INDEX idx_mv_product_stats_pk ON mv_product_stats (product_id);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_product_stats()
RETURNS void LANGUAGE sql AS $$
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_product_stats;
$$;

-- Query Image Temp Storage (for feedback processing)
CREATE TABLE query_images (
    hash            CHAR(64) PRIMARY KEY,
    buffer          BYTEA NOT NULL,
    phash64         BIGINT,
    phash256        BYTEA,
    embedding_dinov2 VECTOR(384),
    embedding_clip   VECTOR(512),
    ocr_text        TEXT,
    barcode_value   VARCHAR(100),
    barcode_format  VARCHAR(20),
    color_hist      VECTOR(50),
    feature_descriptors BYTEA,
    quality_score   REAL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_query_images_created ON query_images (created_at DESC);

-- Auto-cleanup old query images
CREATE OR REPLACE FUNCTION cleanup_old_query_images()
RETURNS void LANGUAGE sql AS $$
DELETE FROM query_images WHERE created_at < NOW() - INTERVAL '7 days';
$$;