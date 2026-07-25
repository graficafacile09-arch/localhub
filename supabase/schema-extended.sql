-- LocalHub Search-First AI-Last Database Schema (Extended)
-- Run after supabase/schema.sql

-- ============================================================
-- PRODUCT PROFILES (Core identity tables)
-- ============================================================

CREATE TABLE product_profiles (
    product_id        UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    sku               VARCHAR(100) NOT NULL,
    
    -- Layer 1: Deterministic
    barcode_primary   VARCHAR(20),
    barcode_variants  VARCHAR(20)[] DEFAULT '{}',
    ocr_codes         JSONB DEFAULT '{}',  -- {code: {type, confidence, count, locations[]}}
    
    -- Layer 2: Probabilistic Visual
    phash_centroids   BIGINT[] DEFAULT '{}',
    phash_radius      INT DEFAULT 12,
    phash_sample_count INT DEFAULT 0,
    
    embedding_dinov2_centroid   VECTOR(384),
    embedding_dinov2_variance   VECTOR(384),
    embedding_dinov2_count      INT DEFAULT 0,
    
    embedding_clip_centroid     VECTOR(512),
    embedding_clip_variance     VECTOR(512),
    embedding_clip_count        INT DEFAULT 0,
    
    color_hist_centroid VECTOR(50),
    color_dominant      JSONB,   -- [{"r":255,"g":100,"b":50}, ...]
    color_palette       JSONB,   -- 8-color palette
    
    feature_clusters    BYTEA,   -- Compressed keypoint clusters
    
    -- Layer 3: Packaging
    shape_descriptor    JSONB,   -- {type, aspect_ratio, contour_complexity, symmetry, keypoints[]}
    logo_embeddings     VECTOR(512)[],
    layout_signature    BYTEA,
    
    -- Layer 4: Semantic
    category_path       TEXT[] DEFAULT '{}',
    brand_id            UUID REFERENCES brands(id),
    attributes          JSONB DEFAULT '{}',  -- {color, size, volume, weight, material, flavor, packaging, custom...}
    price_range         NUMRANGE,
    
    -- Learning Metadata
    total_queries       INT DEFAULT 0,
    accepted_count      INT DEFAULT 0,
    rejected_count      INT DEFAULT 0,
    corrections         JSONB DEFAULT '[]',  -- [{from_query, to_product, timestamp, was_false_positive}]
    false_positives     UUID[] DEFAULT '{}',
    false_negatives     UUID[] DEFAULT '{}',
    confidence          REAL DEFAULT 0,
    version             INT DEFAULT 1,
    last_updated        TIMESTAMPTZ DEFAULT now(),
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_product_profiles_barcode ON product_profiles(barcode_primary) WHERE barcode_primary IS NOT NULL;
CREATE INDEX idx_product_profiles_category ON product_profiles USING GIN(category_path);
CREATE INDEX idx_product_profiles_brand ON product_profiles(brand_id);
CREATE INDEX idx_product_profiles_embedding_dinov2 ON product_profiles USING hnsw (embedding_dinov2_centroid vector_cosine_ops);
CREATE INDEX idx_product_profiles_embedding_clip ON product_profiles USING hnsw (embedding_clip_centroid vector_cosine_ops);

-- Product Profile Images (variant images for each product)
CREATE TABLE product_profile_images (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id       UUID NOT NULL REFERENCES product_profiles(product_id) ON DELETE CASCADE,
    image_url        VARCHAR(1000) NOT NULL,
    phash64          BIGINT NOT NULL,
    embedding_dinov2 VECTOR(384),
    embedding_clip   VECTOR(512),
    variant_type     VARCHAR(30) DEFAULT 'angle',  -- canonical, angle, color, packaging, context
    quality          REAL DEFAULT 0.5,
    source           VARCHAR(20) DEFAULT 'catalog',  -- catalog, user, ai, correction
    added_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ppi_product ON product_profile_images(product_id);
CREATE INDEX idx_ppi_phash_lsh ON product_profile_images USING hash (phash64 >> 48);
CREATE INDEX idx_ppi_embedding_dinov2 ON product_profile_images USING hnsw (embedding_dinov2 vector_cosine_ops) WHERE embedding_dinov2 IS NOT NULL;
CREATE INDEX idx_ppi_embedding_clip ON product_profile_images USING hnsw (embedding_clip vector_cosine_ops) WHERE embedding_clip IS NOT NULL;

-- ============================================================
-- QUERY PROFILES (for training/analysis)
-- ============================================================

CREATE TABLE query_profiles (
    query_id         CHAR(26) PRIMARY KEY,  -- ULID
    image_hash       CHAR(64) NOT NULL,
    
    -- Layer 1: Deterministic
    barcode_data     JSONB,   -- {primary, variants[], format, confidence, locations[]}
    ocr_data         JSONB,   -- {productCodes[], textBlocks[], brandDetections[], confidence, language}
    
    -- Layer 2: Visual
    visual_data      JSONB,   -- {pHash, embeddings, color, localFeatures}
    
    -- Layer 3: Packaging
    packaging_data   JSONB,   -- {shape, logos[], layout, materials}
    
    -- Layer 4: Semantic
    semantic_data    JSONB,   -- {category, attributes, brand, priceTier}
    
    -- Layer 5: Quality & Context
    quality_data     JSONB,   -- {overall, sharpness, exposure, lighting, occlusion, perspective, resolution, compressionArtifacts, isSufficient}
    context_data     JSONB,   -- {sceneType, backgroundComplexity, multipleObjects, objectProminence, lightingType}
    completeness     REAL,
    
    -- Results
    top_candidate    UUID REFERENCES products(id),
    deterministic_score REAL,
    probabilistic_score REAL,
    packaging_score  REAL,
    semantic_score   REAL,
    fused_score      REAL,
    confidence_tier  VARCHAR(20),
    requires_ai      BOOLEAN DEFAULT false,
    
    -- AI Fallback
    ai_used          BOOLEAN DEFAULT false,
    ai_model         VARCHAR(50),
    ai_confidence    REAL,
    ai_reasoning     TEXT,
    ai_latency_ms    INT,
    
    -- Feedback
    user_action      VARCHAR(20),  -- accepted, rejected, corrected, ignored
    correction_id    UUID REFERENCES products(id),
    
    -- Timing
    latency_ms       INT,
    created_at       TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Monthly partitions
DO $$
DECLARE
    start_date DATE := date_trunc('month', CURRENT_DATE);
    end_date DATE := start_date + INTERVAL '13 months';
    partition_name TEXT;
    partition_start DATE;
    partition_end DATE;
BEGIN
    WHILE start_date < end_date LOOP
        partition_name := 'query_profiles_' || to_char(start_date, 'YYYY_MM');
        partition_start := start_date;
        partition_end := start_date + INTERVAL '1 month';
        
        EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF query_profiles FOR VALUES FROM (%L) TO (%L)',
            partition_name, partition_start, partition_end);
        
        start_date := partition_end;
    END LOOP;
END $$;

CREATE INDEX idx_query_profiles_hash ON query_profiles(image_hash);
CREATE INDEX idx_query_profiles_candidate ON query_profiles(top_candidate);
CREATE INDEX idx_query_profiles_ai ON query_profiles(ai_used) WHERE ai_used = true;
CREATE INDEX idx_query_profiles_tier ON query_profiles(confidence_tier);

-- ============================================================
-- FUSION WEIGHTS (Learned monthly)
-- ============================================================

CREATE TABLE fusion_weights (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layer            VARCHAR(20) NOT NULL,  -- deterministic, probabilistic, packaging, semantic
    signal           VARCHAR(50) NOT NULL,  -- barcode, productCode, pHash, embedding, color, features, shape, logo, layout, category, attributes, brand, priceTier
    weight           REAL NOT NULL,
    trained_at       TIMESTAMPTZ DEFAULT now(),
    training_samples INT,
    validation_auc   REAL,
    is_active        BOOLEAN DEFAULT true,
    UNIQUE(layer, signal, is_active)
);

-- ============================================================
-- FEEDBACK EVENTS (detailed)
-- ============================================================

CREATE TABLE feedback_events (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id           CHAR(26) NOT NULL REFERENCES query_profiles(query_id),
    event_type         VARCHAR(20) NOT NULL,  -- accepted, rejected, corrected, ignored
    correction_id      UUID REFERENCES products(id),
    reinforcement      JSONB,  -- {barcode, ocr, visual, packaging, semantic}
    new_visual_data    JSONB,
    new_packaging_data JSONB,
    new_semantic_data  JSONB,
    was_false_positive BOOLEAN DEFAULT false,
    created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fe_query ON feedback_events(query_id);
CREATE INDEX idx_fe_type ON feedback_events(event_type);

-- ============================================================
-- VIEWS
-- ============================================================

-- Product Profile Completeness
CREATE VIEW v_product_profile_completeness AS
SELECT 
    pp.product_id,
    pp.sku,
    pp.confidence,
    pp.total_queries,
    pp.accepted_count,
    pp.rejected_count,
    CASE WHEN pp.barcode_primary IS NOT NULL THEN 1 ELSE 0 END as has_barcode,
    CASE WHEN jsonb_object_keys(pp.ocr_codes) IS NOT NULL THEN 1 ELSE 0 END as has_ocr,
    CASE WHEN pp.phash_centroids IS NOT NULL AND array_length(pp.phash_centroids, 1) > 0 THEN 1 ELSE 0 END as has_phash,
    CASE WHEN pp.embedding_dinov2_centroid IS NOT NULL THEN 1 ELSE 0 END as has_embedding,
    CASE WHEN pp.color_hist_centroid IS NOT NULL THEN 1 ELSE 0 END as has_color,
    CASE WHEN pp.shape_descriptor IS NOT NULL AND pp.shape_descriptor != '{}' THEN 1 ELSE 0 END as has_shape,
    CASE WHEN pp.logo_embeddings IS NOT NULL AND array_length(pp.logo_embeddings, 1) > 0 THEN 1 ELSE 0 END as has_logo,
    CASE WHEN pp.category_path IS NOT NULL AND array_length(pp.category_path, 1) > 0 THEN 1 ELSE 0 END as has_category,
    (SELECT COUNT(*) FROM product_profile_images ppi WHERE ppi.product_id = pp.product_id) as image_count
FROM product_profiles pp;

-- Search Quality Metrics
CREATE VIEW v_search_quality AS
SELECT 
    DATE_TRUNC('day', created_at) as day,
    COUNT(*) as total_queries,
    COUNT(*) FILTER (WHERE confidence_tier = 'exact') as exact_count,
    COUNT(*) FILTER (WHERE confidence_tier = 'high') as high_count,
    COUNT(*) FILTER (WHERE confidence_tier = 'medium') as medium_count,
    COUNT(*) FILTER (WHERE confidence_tier = 'low') as low_count,
    COUNT(*) FILTER (WHERE confidence_tier = 'ambiguous') as ambiguous_count,
    COUNT(*) FILTER (WHERE ai_used = true) as ai_fallback_count,
    AVG(fused_score) FILTER (WHERE fused_score IS NOT NULL) as avg_fused_score,
    AVG(latency_ms) as avg_latency_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99_latency_ms,
    COUNT(*) FILTER (WHERE user_action = 'accepted') as accepted_count,
    COUNT(*) FILTER (WHERE user_action = 'rejected') as rejected_count,
    COUNT(*) FILTER (WHERE user_action = 'corrected') as corrected_count
FROM query_profiles
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;

-- AI Fallback Performance
CREATE VIEW v_ai_fallback_performance AS
SELECT 
    DATE_TRUNC('day', created_at) as day,
    ai_model,
    COUNT(*) as total_ai_calls,
    AVG(ai_confidence) as avg_confidence,
    COUNT(*) FILTER (WHERE user_action = 'accepted') as accepted,
    COUNT(*) FILTER (WHERE user_action = 'rejected') as rejected,
    COUNT(*) FILTER (WHERE user_action = 'corrected') as corrected,
    AVG(ai_latency_ms) as avg_latency_ms
FROM query_profiles
WHERE ai_used = true AND created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at), ai_model
ORDER BY day DESC, total_ai_calls DESC;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Update product profile confidence based on feedback ratio
CREATE OR REPLACE FUNCTION update_profile_confidence()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.total_queries > 10 THEN
        NEW.confidence := LEAST(1.0, 
            0.3 + 0.5 * (NEW.accepted_count::REAL / NULLIF(NEW.total_queries, 0)) 
            + 0.2 * (NEW.accepted_count::REAL / GREATEST(NEW.accepted_count + NEW.rejected_count, 1))
        );
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trigger_update_confidence
    BEFORE UPDATE ON product_profiles
    FOR EACH ROW EXECUTE FUNCTION update_profile_confidence();

-- Auto-cleanup old query profiles (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_query_profiles()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE 'DROP TABLE IF EXISTS query_profiles_' || to_char(CURRENT_DATE - INTERVAL '90 days', 'YYYY_MM');
END $$;