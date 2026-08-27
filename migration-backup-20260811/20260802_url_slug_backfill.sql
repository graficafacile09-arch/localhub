begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- Architettura URL pubbliche basate su slug (FASE 1 — backfill deterministico)
-- Popola gli slug mancanti su negozi e prodotti in modo completamente
-- riproducibile: chiunque cloni il repo e applichi le migration otterrà
-- ESATTAMENTE gli stessi slug (nessun dato casuale).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Funzione slugify condivisa (riproducibile, idempotente) ────────────────
-- È la stessa logica del helper TS lib/slug.ts usato dall'applicazione.
create or replace function public.slugify(testo text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '-' from regexp_replace(
      translate(
        lower(coalesce(testo, '')),
        'àáâãäåæçèéêëìíîïñòóôõöùúûüýÿ',
        'aaaaaaaceeeeiiiinoooooouuuuyy'
      ),
      '[^a-z0-9]+', '-', 'g'
    )),
    ''
  );
$$;

-- ── Backfill negozi senza slug ──────────────────────────────────────────────
-- Ordine deterministico: created_at ASC, id ASC. Ogni slug viene reso
-- univoco (se già usato, suffisso -2, -3, ...) rispetto ALLA TABELLA INTERA,
-- così non può mai collidere con slug già valorizzati.
do $$
declare
  r record;
  base text;
  candidato text;
  n int;
begin
  for r in
    select id, nome, created_at
    from public.negozi
    where slug is null
      and deleted_at is null
    order by created_at, id
  loop
    base := public.slugify(r.nome);
    if base is null then
      base := 'negozio-' || left(replace(r.id::text, '-', ''), 8);
    end if;

    candidato := base;
    n := 1;
    while exists (
      select 1 from public.negozi
      where slug = candidato and id <> r.id
    ) loop
      n := n + 1;
      candidato := base || '-' || n;
    end loop;

    update public.negozi set slug = candidato where id = r.id;
  end loop;
end $$;

-- ── Backfill prodotti senza slug ────────────────────────────────────────────
-- Stesso criterio deterministico (created_at ASC, id ASC) e stessa garanzia
-- di unicità sull'intera tabella.
do $$
declare
  r record;
  base text;
  candidato text;
  n int;
begin
  for r in
    select id, nome, created_at
    from public.prodotti
    where slug is null
    order by created_at, id
  loop
    base := public.slugify(r.nome);
    if base is null then
      base := 'prodotto-' || r.id::text;
    end if;

    candidato := base;
    n := 1;
    while exists (
      select 1 from public.prodotti
      where slug = candidato and id <> r.id
    ) loop
      n := n + 1;
      candidato := base || '-' || n;
    end loop;

    update public.prodotti set slug = candidato where id = r.id;
  end loop;
end $$;

commit;
