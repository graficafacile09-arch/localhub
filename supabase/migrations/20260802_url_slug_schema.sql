begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- Architettura URL pubbliche basate su slug (FASE 1 — schema)
-- Gli ID restano invariati e continuano ad essere usati internamente.
-- Gli slug diventano l'unico identificatore pubblico (negozio/prodotto).
-- ═══════════════════════════════════════════════════════════════════════════

-- Slug per i prodotti (colonna nuova, nullable: backfill in 20260802_url_slug_backfill.sql)
alter table public.prodotti add column if not exists slug text;

-- Normalizzazione: alcuni negozi storici hanno slug = '' (stringa vuota) che
-- violerebbe l'indice UNIQUE parziale (la condizione 'is not null' include
-- la stringa vuota). Li si riporta a NULL: il backfill li valorizzerà.
update public.negozi set slug = null where slug = '';

-- Unicità: indice UNIQUE parziale (solo slug valorizzati).
create unique index if not exists prodotti_slug_unique_idx
  on public.prodotti (slug)
  where slug is not null;

-- Slug per i negozi: l'indice UNIQUE parziale manca nel DB remoto
-- (era definito solo nella seed 20260730 mai applicata correttamente).
create unique index if not exists negozi_slug_unique_idx
  on public.negozi (slug)
  where slug is not null;

commit;
