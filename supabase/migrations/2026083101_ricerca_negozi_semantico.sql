begin;

-- ============================================================
-- Ricerca ibrida InCittà — stroto di RECALL multi-campo pesato
-- -------------------------------------------------------------
-- Questa migration è ADDITIVA (estensione + indici + funzione):
--  - cerca_negozi_semantico(termini[, categoria, tipo, citta,
--                           limit, min_score]) pesa il match su nome,
--    tipo_attivita (data->>'tipo_attivita'), categoria, sottocategoria,
--    servizi_strutturati (data->'servizi_strutturati'), servizi,
--    parole_chiave, descrizione, descrizione_completa, SEO e città/
--    indirizzo, applica una soglia minima anti-spazzatura e ordina per
--    rilevanza.
-- Il ranking FINALE resta in TypeScript (filtraNegoziPerPertinenza);
-- questa funzione è solo il layer di recall + ordinamento grossolano.
-- ============================================================

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- Indici trigram per match parziale/fuzzy veloce sui campi principali.
create index if not exists negozi_nome_trgm_idx
  on public.negozi using gin (nome gin_trgm_ops);

create index if not exists negozi_categoria_trgm_idx
  on public.negozi using gin (categoria gin_trgm_ops);

-- Indice GIN sull'array text[] parole_chiave per il match rapido.
create index if not exists negozi_parole_chiave_gin_idx
  on public.negozi using gin (parole_chiave);

create or replace function public.cerca_negozi_semantico(
  p_termini text[] default '{}'::text[],
  p_categoria text default null,
  p_tipo text default null,
  p_citta text default null,
  p_limit int default 24,
  p_min_score int default 8
)
returns table (
  id                 uuid,
  slug               text,
  nome               text,
  categoria          text,
  sottocategoria     text,
  descrizione        text,
  descrizione_completa text,
  indirizzo          text,
  citta              text,
  telefono           text,
  logo_url           text,
  copertina_url      text,
  seo_title          text,
  seo_description    text,
  seo_keywords       text[],
  parole_chiave      text[],
  servizi            text[],
  tipo_attivita      text,
  moduli_attivi      jsonb,
  data               jsonb,
  in_evidenza        boolean,
  created_at         timestamptz,
  score              int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  terms text[] := coalesce(
    array(
      select lower(unaccent(x)) from unnest(p_termini) as x
      where x is not null and btrim(x) <> ''
      group by lower(unaccent(x))
      order by lower(unaccent(x))
    ), '{}'::text[]
  );
begin
  if array_length(terms, 1) is null
     and coalesce(p_categoria, '') = ''
     and coalesce(p_tipo, '') = ''
     and coalesce(p_citta, '') = '' then
    return;
  end if;

  return query
  with target as (
    select
      n.id,
      n.slug,
      n.nome,
      coalesce(n.categoria, '')             as categoria,
      coalesce(n.sottocategoria, '')        as sottocategoria,
      coalesce(n.descrizione, '')           as descrizione,
      coalesce(n.descrizione_completa, '')  as descrizione_completa,
      coalesce(n.indirizzo, '')             as indirizzo,
      coalesce(n.citta, '')                 as citta,
      n.telefono,
      n.logo_url,
      n.copertina_url,
      coalesce(n.seo_title, '')             as seo_title,
      coalesce(n.seo_description, '')       as seo_description,
      n.seo_keywords,
      n.parole_chiave,
      n.servizi,
      coalesce(nullif(n.data ->> 'tipo_attivita', ''), '') as tipo_attivita,
      n.moduli_attivi,
      n.data,
      coalesce(n.in_evidenza, false)        as in_evidenza,
      n.created_at
    from public.negozi n
    where n.attivo = true
      and n.deleted_at is null
      and ( p_categoria is null
            or n.categoria ilike '%' || p_categoria || '%'
            or n.sottocategoria ilike '%' || p_categoria || '%'
            or (n.data ->> 'tipo_attivita') ilike '%' || p_categoria || '%' )
      and ( p_tipo is null
            or (n.data ->> 'tipo_attivita') ilike '%' || p_tipo || '%'
            or lower(unaccent(coalesce(n.nome, ''))) ilike '%' || p_tipo || '%'
            or n.categoria ilike '%' || p_tipo || '%' )
      and ( p_citta is null
            or n.citta ilike '%' || p_citta || '%'
            or n.indirizzo ilike '%' || p_citta || '%' )
  ),
  scored as (
    select
      t.id, t.slug, t.nome, t.categoria, t.sottocategoria, t.descrizione,
      t.descrizione_completa, t.indirizzo, t.citta, t.telefono, t.logo_url,
      t.copertina_url, t.seo_title, t.seo_description, t.seo_keywords,
      t.parole_chiave, t.servizi, t.tipo_attivita, t.moduli_attivi, t.data,
      t.in_evidenza, t.created_at,
      sum(
          case
            -- match esatto di token nel nome (massimo peso)
            when lower(unaccent(t.nome)) ~ ('(^|[^a-z0-9])' || term || '([^a-z0-9]|$)') then 26
            when t.nome ilike '%' || term || '%' then 12
            else 0
          end
        + case when t.tipo_attivita ilike '%' || term || '%' then 20 else 0 end
        + case when t.categoria     ilike '%' || term || '%' then 16 else 0 end
        + case when t.sottocategoria ilike '%' || term || '%' then 12 else 0 end
        + case when t.descrizione   ilike '%' || term || '%' then 6  else 0 end
        + case when t.descrizione_completa ilike '%' || term || '%' then 4 else 0 end
        + case when t.citta ilike '%' || term || '%' or t.indirizzo ilike '%' || term || '%' then 3 else 0 end
        + case when t.seo_title ilike '%' || term || '%' or t.seo_description ilike '%' || term || '%' then 3 else 0 end
        + case when exists (
              select 1 from unnest(t.parole_chiave) pc
              where pc is not null and lower(unaccent(pc)) like '%' || term || '%'
            ) then 10 else 0 end
        + case when exists (
              select 1 from unnest(t.servizi) sv
              where sv is not null and lower(unaccent(sv)) like '%' || term || '%'
            ) then 10 else 0 end
        + case when t.data is not null and exists (
              select 1
              from jsonb_array_elements(
                     case jsonb_typeof(t.data -> 'servizi_strutturati')
                       when 'array' then t.data -> 'servizi_strutturati'
                       else '[]'::jsonb
                     end
                   ) sv
              where lower(unaccent(coalesce(sv ->> 'nome', ''))) like '%' || term || '%'
                and coalesce((sv ->> 'attivo')::boolean, true) = true
            ) then 14 else 0 end
      )::int as score
    from target t
    cross join lateral unnest(terms) as term
    group by t.id, t.slug, t.nome, t.categoria, t.sottocategoria, t.descrizione,
             t.descrizione_completa, t.indirizzo, t.citta, t.telefono, t.logo_url,
             t.copertina_url, t.seo_title, t.seo_description, t.seo_keywords,
             t.parole_chiave, t.servizi, t.tipo_attivita, t.moduli_attivi, t.data,
             t.in_evidenza, t.created_at
  )
  select
    s.id, s.slug, s.nome, s.categoria, s.sottocategoria, s.descrizione,
    s.descrizione_completa, s.indirizzo, s.citta, s.telefono, s.logo_url,
    s.copertina_url, s.seo_title, s.seo_description, s.seo_keywords,
    s.parole_chiave, s.servizi, s.tipo_attivita, s.moduli_attivi, s.data,
    s.in_evidenza, s.created_at, s.score
  from scored s
  where s.score >= p_min_score
  order by s.score desc, s.in_evidenza desc, s.created_at desc
  limit p_limit;
end;
$$;

grant execute on function public.cerca_negozi_semantico(text[], text, text, text, int, int)
  to anon, authenticated, service_role;

commit;