# LocalHub - Search-First AI-Last Visual Product Search

Enterprise-grade visual search pipeline achieving >95% no-AI resolution through multi-layered fingerprint matching, vector search, and continuous learning.

## Architecture Overview

```
Image → Preprocess → Fingerprint Extraction → Multi-Index Search → Catalog Match → Rank & Score
                                                                    ↓
                                               [threshold < 0.60] → AI Fallback → Feedback Loop
```

**Key Principle**: AI is a last resort. Only invoked when all deterministic signals fail to reach confidence threshold.

### Pipeline Stages

| Stage | Technology | Latency (P99) | Purpose |
|-------|------------|---------------|---------|
| Acquisition | Sharp, Node.js | 20ms | Normalize, dedupe, validate |
| Preprocessing | Sharp | 30ms | Multi-variant generation |
| Fingerprinting | ONNX (DINOv2), Tesseract, ZXing, ORB | 120ms | pHash, embedding, OCR, barcode, features, color |
| Search | pgvector HNSW, Redis LSH, Trie | 40ms | Parallel multi-index lookup |
| Catalog Match | PostgreSQL | 20ms | Enrich candidates with product data |
| Ranking | Weighted fusion | 10ms | Multi-signal scoring + agreement bonus |
| AI Fallback | Gemini 2.5 Flash / Gemma 3 | 800-2000ms | Only if score < 0.60 |
| Feedback | BullMQ + PG | Async | Auto-enrich DB, retrain weights |

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ with `pgvector` extension
- Redis 7+
- (Optional) ONNX Runtime for local embeddings
- (Optional) NVIDIA GPU for accelerated inference

### Installation

```bash
# Clone and install
cd localhub
npm install

# Install ONNX Runtime (choose one)
npm install onnxruntime-node          # CPU
# npm install onnxruntime-gpu          # NVIDIA GPU

# Download embedding models
mkdir -p models
# DINOv2 ViT-S/14 (384-dim, ~22MB)
wget -O models/dinov2_vits14.onnx https://huggingface.co/onnx-community/dinov2-base/resolve/main/model.onnx
# CLIP ViT-B/32 (512-dim, ~150MB) - optional
wget -O models/clip_vit_b32.onnx https://huggingface.co/onnx-community/clip-vit-base-patch32/resolve/main/model.onnx
```

### Database Setup

```bash
# Create database and enable extensions
psql -U postgres -c "CREATE DATABASE localhub;"
psql -U postgres -d localhub -c "CREATE EXTENSION vector; CREATE EXTENSION pg_trgm;"

# Run schema
psql -U postgres -d localhub -f supabase/schema.sql

# Verify
psql -U postgres -d localhub -c "\dt"
```

### Configuration

```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

Required environment variables:
```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=localhub
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
REDIS_URL=redis://localhost:6379
GEMINI_API_KEY=your_gemini_key  # Required for AI fallback
GEMMA_ENDPOINT=http://localhost:8080/v1  # Optional: local Gemma
DINOV2_MODEL_PATH=./models/dinov2_vits14.onnx
```

### Development

```bash
# Start dev server
npm run dev

# Run API tests
curl -X POST http://localhost:3000/api/search/visual \
  -F "image=@test-image.jpg" \
  -F "maxResults=10"
```

## API Reference

### Visual Search

```bash
POST /api/search/visual
Content-Type: multipart/form-data

Fields:
  image (file)       - Image file (JPEG, PNG, WebP, HEIC)
  url (string)       - HTTP/HTTPS image URL
  base64 (string)    - Base64 encoded image (data URL or raw)
  maxResults (int)   - Default 20, max 100
  threshold (enum)   - exact|high|medium|low|auto (default: auto)
  includeAI (bool)   - Force AI fallback (default: true)
  categoryId (uuid)  - Filter by category
  brandId (uuid)     - Filter by brand
  priceRange (json)  - {"min": 0, "max": 100}
  inStock (bool)     - Filter available products
```

Response:
```json
{
  "queryId": "01HZ...",
  "results": [
    {
      "product": { "id": "...", "sku": "...", "name": "...", "brand": "...", "price": {...} },
      "score": 0.97,
      "tier": "exact",
      "matchedImage": { "url": "...", "variantId": "..." },
      "signals": { "barcode": { "matched": true }, "pHash": { "score": 0.99 } },
      "explanation": "Exact barcode match (EAN13: 8001234567890), pHash distance 3"
    }
  ],
  "aiUsed": false,
  "latencyMs": 187,
  "timestamp": "2026-07-25T10:30:00Z"
}
```

### Submit Feedback

```bash
POST /api/search/feedback
Content-Type: application/json

{
  "queryId": "01HZ...",
  "action": "accepted" | "rejected" | "corrected",
  "correctionProductId": "uuid"  // required for "corrected"
}
```

## Tier Thresholds

| Tier | Score Range | Action |
|------|-------------|--------|
| `exact` | ≥ 0.95 | Return immediately, no AI |
| `high` | ≥ 0.80 | Return with high confidence |
| `medium` | ≥ 0.60 | Return with "verify" flag |
| `low` | ≥ 0.40 | Queue for AI fallback |
| `none` | < 0.40 | AI fallback required |

## Signal Weights (Fusion)

```typescript
const FUSION_WEIGHTS = {
  barcode:    0.35,  // Exact product code match
  ocrExact:   0.25,  // OCR product code found
  pHash:      0.15,  // Perceptual hash similarity
  vector:     0.15,  // Embedding cosine similarity
  features:   0.10,  // Geometric verification
  color:      0.05,  // Color histogram distance
  catalog:    0.05,  // Category/attribute consistency
};
```

## Deployment

### Docker

```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Kubernetes (Helm values)

```yaml
replicaCount: 6
resources:
  limits:
    cpu: "2"
    memory: "4Gi"
  requests:
    cpu: "1"
    memory: "2Gi"

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
  targetCPUUtilization: 70

postgres:
  host: postgres.localhub.svc
  poolSize: 50

redis:
  url: redis://redis.localhub.svc:6379

env:
  GEMINI_API_KEY: ""
  ENABLE_AI: "true"
  AI_THRESHOLD: "0.60"
```

### Monitoring

Key metrics to alert on:
- `search.no_ai_rate` > 0.95 (target)
- `search.p99_latency_ms` < 300 (no AI), < 2500 (with AI)
- `search.ai_fallback_rate` < 0.05
- `search.error_rate` < 0.01

## Scaling Guide

| Scale | Products | Images | Replicas | PG | Redis | GPU |
|-------|----------|--------|----------|-----|-------|-----|
| Dev | 10K | 100K | 2 | 2C/8GB | 2C/4GB | - |
| Staging | 100K | 1M | 4 | 4C/16GB | 4C/8GB | 1x T4 |
| Prod | 1M | 10M | 12 | 8C/64GB | 8C/32GB | 4x A10G |
| Enterprise | 10M | 100M | 30+ | Cluster | Cluster | 16x A100 |

## License

MIT