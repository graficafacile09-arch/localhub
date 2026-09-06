-- ═══════════════════════════════════════════════════════════════════════
-- P1 — DEDUPLICAZIONE ROBUSTA NOTIZIE (20261002)
--
-- Causa risolta: la dedup storica si basava SOLO su dedup_hash (SHA-256 del
-- titolo normalizzato) e su unique(fonte_id, external_id). Quando Google
-- News mutava guid E URL dello stesso articolo e il titolo cambiava solo
-- leggermente (es. suffisso " · Testata"), nessun controllo scattava e la
-- stessa notizia veniva reinserita a ogni esecuzione del cron.
--
-- Cosa fa (ADDITIVA — non tocca vincoli, dati o RLS esistenti):
--   1. aggiunge tre colonne di dedup: url_hash, ext_hash, titolo_fonte_hash;
--   2. backfill degli articoli ESISTENTI con la stessa normalizzazione usata
--      dal codice (lib/notizie/dedup.ts) — nessuna cancellazione, i vecchi
--      duplicati restano; in caso di collisione vince la riga più vecchia
--      (first-wins), le altre restano senza hash (così l'indice UNIQUE può
--      essere creato);
--   3. indici UNIQUE parziali sulle tre colonne → dedup PERSISTENTE e
--      ATOMICO a livello PostgreSQL (impossibile creare duplicati anche con
--      due esecuzioni concorrenti del cron);
--   4. RPC public.notizie_inserisci(...): INSERT ... ON CONFLICT DO NOTHING
--      SENZA target specifico → QUALSIASI vincolo UNIQUE blocca la riga;
--      ritorna true se inserita, false se duplicato.
--
-- Permessi: revoca EXECUTE a public/anon/authenticated; SOLO service_role
-- può invocare la RPC (il cron usa la service role key). Le funzioni helper
-- _p1_* NON sono esposte da PostgREST (prefisso underscore).
--
-- La normalizzazione SQL qui sotto è LO SPECCHIO ESATTO di lib/notizie/dedup.ts:
-- se una delle due cambia, va aggiornata anche l'altra.
-- ═══════════════════════════════════════════════════════════════════════

-- pgcrypto per digest(): su questo progetto Supabase è installata nello
-- schema `extensions`, quindi il search_path include anche extensions.
set search_path = public, extensions;

create extension if not exists pgcrypto;

-- ── 1. Colonne di dedup (additive) ───────────────────────────────────────
alter table public.notizie
  add column if not exists url_hash text,
  add column if not exists ext_hash text,
  add column if not exists titolo_fonte_hash text;

-- ── 2. Helper di normalizzazione (specchio di lib/notizie/dedup.ts) ─────

-- URL canonica: lowercase, senza frammento, senza parametri di tracking
-- (il separatore ?/& viene conservato e poi ricollassato: `?&` → `?`,
-- `&&` → `&`), senza ?/& finali, senza slash finale di pathname.
create or replace function public._p1_normalizza_url(p_url text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            split_part(lower(btrim(p_url)), '#', 1),
            '([?&])(oc|utm_source|utm_medium|utm_campaign|utm_term|utm_content|fbclid|gclid|gclsrc|ref|ref_src|mkt_tok|mc_cid|mc_eid|yclid|twclid|igshid|msclkid|pk_source|pk_medium|pk_campaign|pk_keyword|pk_content)=[^&#]*',
            '\1', 'gi'),
          '\?&+', '?', 'g'),
        '&{2,}', '&', 'g'),
      '[?&]+$', '', 'g'),
    '\/(?=[?#]|$)', '', 'g');
$$;

-- Titolo ridotto: lowercase → ß/æ/œ/þ → mappa accenti 1:1 → solo [a-z0-9]
-- (spazio come separatore) → trim.
create or replace function public._p1_normalizza_titolo(p_testo text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select btrim(regexp_replace(
    translate(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(btrim(p_testo)), 'ß', 'ss', 'g'),
            'æ', 'ae', 'g'),
          'œ', 'oe', 'g'),
        'þ', 'th', 'g'),
      'àáâãäåāăąçćĉċčèéêëēĕėęìíîïīĩñńòóôõöōŏőùúûüūũýÿžźżđøðł',
      'aaaaaaaaacccccceeeeeeeeiiiiiiinnoooooooouuuuuuuyyzzzdodl'),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- Escape dei metacaratteri regex di un nome fonte (specchio dell'escaping
-- JS in rimuoviSuffissoTestata: . * + ? ^ $ { } ( ) | [ ]).
create or replace function public._p1_escape_regex(p_testo text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select regexp_replace(p_testo, '([.^$|?*+()\[\]{}])', '\\\1', 'g');
$$;

-- ── 3. Backfill degli articoli esistenti (first-wins, nessuna cancellazione) ──
do $$
declare
  r record;
  v_url text;
  v_ext text;
  v_tit text;
begin
  for r in
    select id, original_url, source_name, external_id, title
    from public.notizie
    order by created_at asc, id asc
  loop
    v_url := encode(digest(public._p1_normalizza_url(r.original_url), 'sha256'), 'hex');
    v_ext := case
      when r.external_id is not null and btrim(r.external_id) <> ''
      then encode(digest(lower(btrim(r.source_name)) || '|' || btrim(r.external_id), 'sha256'), 'hex')
      else null
    end;
    v_tit := encode(digest(
      lower(btrim(r.source_name)) || '|' ||
      public._p1_normalizza_titolo(
        regexp_replace(
          lower(r.title),
          '\s*(?:-|·|•)\s*' || public._p1_escape_regex(lower(btrim(r.source_name))) || '\s*$',
          '', 'i')
      ),
      'sha256'), 'hex');

    -- First-wins: se l'hash è già assegnato a un'ALTRA riga (es. i vecchi
    -- duplicati), questa riga resta senza hash → l'indice UNIQUE può essere
    -- creato e i duplicati storici NON vengono toccati. `id <> r.id` rende il
    -- backfill idempotente: una riga già valorizzata mantiene i propri hash.
    if exists (select 1 from public.notizie where id <> r.id and url_hash = v_url) then v_url := null; end if;
    if v_ext is not null and exists (select 1 from public.notizie where id <> r.id and ext_hash = v_ext) then v_ext := null; end if;
    if v_tit is not null and exists (select 1 from public.notizie where id <> r.id and titolo_fonte_hash = v_tit) then v_tit := null; end if;

    update public.notizie
      set url_hash = v_url, ext_hash = v_ext, titolo_fonte_hash = v_tit
      where id = r.id;
  end loop;
end $$;

-- ── 4. Indici UNIQUE parziali (dedup persistente e atomica) ──────────────
create unique index if not exists notizie_url_hash_key
  on public.notizie (url_hash) where url_hash is not null;

create unique index if not exists notizie_ext_hash_key
  on public.notizie (ext_hash) where ext_hash is not null;

create unique index if not exists notizie_titolo_fonte_hash_key
  on public.notizie (titolo_fonte_hash) where titolo_fonte_hash is not null;

-- ── 5. RPC di inserimento atomico (ON CONFLICT DO NOTHING senza target) ──
create or replace function public.notizie_inserisci(
  p_fonte_id uuid,
  p_source_name text,
  p_title text,
  p_excerpt text,
  p_original_url text,
  p_external_id text,
  p_published_at timestamptz,
  p_category text,
  p_image_url text,
  p_dedup_hash text,
  p_url_hash text,
  p_ext_hash text,
  p_titolo_fonte_hash text
)
returns boolean
language plpgsql
security invoker
set search_path = public, extensions
as $$
begin
  insert into public.notizie (
    fonte_id, source_name, title, excerpt, original_url, external_id,
    published_at, category, image_url, dedup_hash, url_hash, ext_hash,
    titolo_fonte_hash, stato
  ) values (
    p_fonte_id, p_source_name, p_title, p_excerpt, p_original_url, p_external_id,
    p_published_at, p_category, p_image_url, p_dedup_hash, p_url_hash, p_ext_hash,
    p_titolo_fonte_hash, 'published'
  )
  on conflict do nothing;
  return found;
end;
$$;

-- ── 6. Permessi: SOLO service_role ───────────────────────────────────────
revoke execute on function public._p1_normalizza_url(text) from public, anon, authenticated;
revoke execute on function public._p1_normalizza_titolo(text) from public, anon, authenticated;
revoke execute on function public._p1_escape_regex(text) from public, anon, authenticated;

revoke execute on function public.notizie_inserisci(
  uuid, text, text, text, text, text, timestamptz, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.notizie_inserisci(
  uuid, text, text, text, text, text, timestamptz, text, text, text, text, text, text
) to service_role;

notify pgrst, 'reload schema';