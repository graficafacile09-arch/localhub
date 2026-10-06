-- Allow product deletion without destroying the legal return-request snapshot.
-- richieste_recesso_righe keeps nome/prezzo/quantita as historical data;
-- prodotto_id becomes optional and is nulled when the product is deleted.

alter table public.richieste_recesso_righe
  alter column prodotto_id drop not null;

alter table public.richieste_recesso_righe
  drop constraint if exists richieste_recesso_righe_prodotto_id_fkey;

alter table public.richieste_recesso_righe
  add constraint richieste_recesso_righe_prodotto_id_fkey
  foreign key (prodotto_id)
  references public.prodotti(id)
  on delete set null;
