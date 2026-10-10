# Production recovery — October 10, 2026

This recovery branch starts from the last successful production version before the accidental October 8 rollback.

- Base commit: 7f332d4c2850b55e14c5a494c72071869b14dec9
- Homepage hero preserved from the October 10 image change: public/hero-coppia-castrovillari.webp
- Hero image SHA-256: b81208aa351d670235febaeb7ad9f153725701662e87dd789885ef88466ad1c4
- The homepage text and all unrelated files from the base version are preserved.
- Social preview image metadata is aligned to the same hero image.
- No database changes are part of this recovery.
- The recovery point was fast-forwarded to `main` without rewriting Git history.
