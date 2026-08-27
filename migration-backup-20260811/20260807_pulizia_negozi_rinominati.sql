-- =================================================================
-- LocalHub — Soft-delete dei negozi di test "Negozio Rinominato <timestamp>"
-- =================================================================
-- I negozi creati durante le prove (pattern "Negozio Rinominato <timestamp>"
-- oppure slug "negozio-rinominato-<timestamp>") devono sparire dalle liste
-- dei negozi attivi. Usa il sistema di soft-delete già esistente
-- (deleted_at / deleted_by): i record restano recuperabili dal Cestino.
-- NON tocca: negozi reali, altri nomi, record già nel Cestino.
-- Idempotente: un secondo run non trova record attivi da aggiornare.
-- =================================================================
begin;

update public.negozi
set deleted_at = now(),
    deleted_by = null
where deleted_at is null
  and (
    slug like 'negozio-rinominato-%'
    or (
      is_demo = true
      and nome ~ '^(Negozio Rinominato|Negozio Rinomìnato)[[:space:]][0-9]{13}$'
    )
  );

notify pgrst, 'reload schema';

commit;
