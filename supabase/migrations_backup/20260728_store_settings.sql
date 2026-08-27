begin;

-- ── Colonne settings per negozi ────────────────────────────────────
alter table if exists public.negozi
  add column if not exists indirizzo text,
  add column if not exists telefono text,
  add column if not exists email_negozio text,
  add column if not exists sito_web text,
  add column if not exists logo_url text,
  add column if not exists banner_url text,
  add column if not exists orari_apertura jsonb not null default '{
    "lunedì":    { "apertura": "", "chiusura": "", "chiuso": false },
    "martedì":   { "apertura": "", "chiusura": "", "chiuso": false },
    "mercoledì": { "apertura": "", "chiusura": "", "chiuso": false },
    "giovedì":   { "apertura": "", "chiusura": "", "chiuso": false },
    "venerdì":   { "apertura": "", "chiusura": "", "chiuso": false },
    "sabato":    { "apertura": "", "chiusura": "", "chiuso": false },
    "domenica":  { "apertura": "", "chiusura": "", "chiuso": true  }
  }'::jsonb,
  add column if not exists contatti_social jsonb not null default '{
    "whatsapp": "",
    "facebook": "",
    "instagram": "",
    "tiktok": ""
  }'::jsonb,
  add column if not exists galleria jsonb not null default '[]'::jsonb;

-- ── Bucket storage per galleria negozi ──────────────────────────────
-- (Il bucket store-images viene creato automaticamente dal primo upload.)

notify pgrst, 'reload schema';

commit;
