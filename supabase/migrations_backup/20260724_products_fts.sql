begin;

-- Full Text Search per prodotti
-- Prepara il DB per migliaia di prodotti con ricerca veloce

-- Indice GIN per full-text search su nome + descrizione + categoria
create index if not exists prodotti_fts_idx
  on public.prodotti
  using gin (
    to_tsvector('italian',
      coalesce(nome, '') || ' ' ||
      coalesce(descrizione, '') || ' ' ||
      coalesce(categoria, '') || ' ' ||
      coalesce(sottocategoria, '') || ' ' ||
      coalesce(marca, '')
    )
  );

-- Indice per ricerca like veloce (per fallback)
create index if not exists prodotti_nome_ilike_idx
  on public.prodotti (nome text_pattern_ops);

create index if not exists prodotti_categoria_idx
  on public.prodotti (categoria);

-- Indice composito per negozio + attivo (query frequenti)
create index if not exists prodotti_negozio_attivo_idx
  on public.prodotti (negozio_id, attivo);

-- Indice per ordinamento per data (ultimi inserimenti)
create index if not exists prodotti_created_at_idx
  on public.prodotti (created_at desc);

commit;
