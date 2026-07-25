-- LocalHub Search-First AI-Last Pipeline Schema
-- Run in order: 001_init.sql, 002_indices.sql, 003_partitions.sql

-- 001_init.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Products (Catalog)
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku             VARCHAR(100) UNIQUE NOT NULL,
    name            VARCHAR(500) NOT NULL,
    brand_id        UUID REFERENCES brands(id),
    category_id     UUID REFERENCES categories(id),
    attributes      JSONB NOT NULL DEFAULT '{}',
    canonical_image UUID,
    status          VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
    price_amount    NUMERIC(10, 2),
    price_currency  CHAR(3) DEFAULT 'EUR',
    in_stock        BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Brands
CREATE TABLE brands (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(200) UNIQUE NOT NULL,
    logo_url    VARCHAR(1000),
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Categories (Materialized Path)
CREATE TABLE categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id   UUID REFERENCES categories(id),
    name        VARCHAR(200) NOT NULL,
    path        VARCHAR(1000) NOT NULL,
    level       INT NOT NULL DEFAULT 0,
    sort_order  INT DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_path ON categories USING GIN (path gin_trgm_ops);

-- Product Images (Fingerprint Storage)
CREATE TABLE product_images (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id              UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url                     VARCHAR(1000) NOT NULL,
    phash64                 BIGINT NOT NULL,
    phash256                BYTEA NOT NULL,
    embedding_dinov2        VECTOR(384),
    embedding_clip          VECTOR(512),
    ocr_text                TEXT,
    barcode_value           VARCHAR(100),
    barcode_format          VARCHAR(20),
    color_hist              VECTOR(50),
    feature_descriptors     BYTEA,
    quality_score           REAL DEFAULT 1.0,
    is_canonical            BOOLEAN DEFAULT false,
    source                  VARCHAR(50) DEFAULT 'catalog' CHECK (source IN ('catalog', 'user_feedback', 'ai_generated', 'import')),
    status                  VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'pending', 'rejected', 'duplicate')),
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now()
);

-- Query Log (Partitioned by Month)
CREATE TABLE query_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_hash          CHAR(64) NOT NULL,
    image_phash64       BIGINT,
    top_candidate_id    UUID REFERENCES products(id),
    final_score         REAL,
    tier                VARCHAR(20),
    ai_used             BOOLEAN DEFAULT false,
    ai_model            VARCHAR(50),
    ai_confidence       REAL,
    user_action         VARCHAR(20),
    correction_id       UUID REFERENCES products(id),
    latency_ms          INTEGER,
    created_at          TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions for current + next 12 months
DO $$
DECLARE
    start_date DATE := date_trunc('month', CURRENT_DATE);
    end_date DATE := start_date + INTERVAL '13 months';
    partition_name TEXT;
    partition_start DATE;
    partition_end DATE;
BEGIN
    WHILE start_date < end_date LOOP
        partition_name := 'query_log_' || to_char(start_date, 'YYYY_MM');
        partition_start := start_date;
        partition_end := start_date + INTERVAL '1 month';

        EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF query_log FOR VALUES FROM (%L) TO (%L)',
            partition_name, partition_start, partition_end);

        start_date := partition_end;
    END LOOP;
END $$;

-- Feedback Events
CREATE TABLE feedback_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id        UUID NOT NULL REFERENCES query_log(id),
    event_type      VARCHAR(20) NOT NULL CHECK (event_type IN ('accepted', 'rejected', 'corrected', 'ignored')),
    correction_id   UUID REFERENCES products(id),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_feedback_query ON feedback_events(query_id);
CREATE INDEX idx_feedback_type ON feedback_events(event_type);

-- Model Performance Tracking
CREATE TABLE model_performance (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name      VARCHAR(50) NOT NULL,
    task_type       VARCHAR(20) NOT NULL,
    metric_name     VARCHAR(50) NOT NULL,
    metric_value    REAL NOT NULL,
    sample_size     INTEGER,
    evaluation_date TIMESTAMPTZ DEFAULT now(),
    metadata        JSONB DEFAULT '{}'
);

-- Index Maintenance Log
CREATE TABLE index_maintenance (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    index_name      VARCHAR(100) NOT NULL,
    operation       VARCHAR(50) NOT NULL,
    status          VARCHAR(20) NOT NULL,
    duration_ms     INTEGER,
    rows_affected   BIGINT,
    error_message   TEXT,
    started_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

-- Update timestamps trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END $$;

CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_product_images_updated BEFORE UPDATE ON product_images FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();