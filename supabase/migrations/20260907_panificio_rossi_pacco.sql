-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — PACCO SPEDIZIONE NEGOZIO DEMO (Panificio Rossi)
--
-- Preparazione del negozio di TEST per la prima transazione simbolica
-- (Stripe TEST MODE). Il motore Poste/BRT (V1, migration 20260901) usa
-- negozi.pacco_peso_grammi come unico requisito per abilitare i corrieri:
-- senza pacco il checkout resta fail-closed (PESO_MANCANTE).
--
-- Valore scelto: 1500 g, derivato dal prodotto di test "Pane Casereccio
-- 1,5 kg" (prodotto id 2) — NON inventato. Le dimensioni pacco restano
-- NULL (non note). Nessun backfill sugli altri negozi, nessun dato
-- economico toccato, nessuna credenziale Stripe inserita.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- Idempotente: aggiorna SOLO se il pacco non è già configurato.
update public.negozi
set pacco_peso_grammi = 1500
where id = 'f3a82af7-dd47-482f-8a49-ea58e692238c'
  and (pacco_peso_grammi is null or pacco_peso_grammi <= 0);

commit;
