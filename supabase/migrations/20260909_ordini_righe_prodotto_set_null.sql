begin;

-- ── Fix cancellazione prodotto nel pannello venditore ───────────────────────
-- ordini_righe.prodotto_id era NOT NULL + ON DELETE RESTRICT: eliminare un
-- prodotto già acquistato (presente in ordini_righe) falliva con
--   update or delete on table "prodotti" violates foreign key constraint
--   "ordini_righe_prodotto_id_fkey" on table "ordini_righe"
-- Seguiamo lo STESSO pattern già usato per variante_id (ON DELETE SET NULL):
-- la riga ordine resta integra grazie allo snapshot (nome_prodotto,
-- prezzo_unitario, immagine_url, variante_nome) e prodotto_id diventa NULL
-- solo quando il prodotto non esiste più.
alter table public.ordini_righe
  alter column prodotto_id drop not null;

alter table public.ordini_righe
  drop constraint if exists ordini_righe_prodotto_id_fkey;

alter table public.ordini_righe
  add constraint ordini_righe_prodotto_id_fkey
    foreign key (prodotto_id) references public.prodotti (id) on delete set null;

notify pgrst, 'reload schema';

commit;
