-- InCittà — DIRITTO DI RECESSO
-- Backfill dello snapshot sulle righe ordine storiche ancora collegabili al prodotto.
-- Le righe legacy senza prodotto_id restano non configurate e vengono gestite
-- esplicitamente dalla RPC senza inventare una regola retroattiva.

update public.ordini_righe as orr
set
  recesso_applicabile = p.recesso_applicabile,
  recesso_esclusione_codice = p.recesso_esclusione_codice,
  recesso_esclusione_dettaglio = p.recesso_esclusione_dettaglio
from public.prodotti as p
where orr.prodotto_id = p.id
  and orr.recesso_applicabile is null;
