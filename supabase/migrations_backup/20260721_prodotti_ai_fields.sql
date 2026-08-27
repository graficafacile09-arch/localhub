begin;

-- Aggiunge sottocategoria per classificazione più precisa
alter table if exists public.prodotti
  add column if not exists sottocategoria text;

-- Stato condizione del prodotto (suggerito dall'AI o inserito manualmente)
alter table if exists public.prodotti
  add column if not exists stato_condizione text
    check (stato_condizione in ('nuovo', 'usato', 'ricondizionato'));

-- Imposta default 1 per quantita_disponibile sui nuovi inserimenti
alter table if exists public.prodotti
  alter column quantita_disponibile set default 1;

-- Aggiorna i prodotti esistenti che hanno quantita_disponibile null a 1
update public.prodotti
set quantita_disponibile = 1
where quantita_disponibile is null;

commit;
