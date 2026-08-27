-- ============================================================================
-- 05_PULIZIA WEBHOOK FALSI "KLARNA" + SCAN_LOG ORFANO — CATEGORIA A
-- ============================================================================
-- 11 webhook di probe (event_id = evt_stripe_intruso_*, payment_id =
-- cs_test_wh_15, ordine_id NULL) creati durante i test di collaudo pagamenti.
-- + 1 scan_log orfano riferito al negozio già eliminato db53d55d...
-- ----------------------------------------------------------------------------
-- ATTENZIONE: esegui SOLO dopo il backup (vedi 00_ISTRUZIONI.sql).

BEGIN;

-- PREVIEW 1: gli eventi da eliminare (attesi 11)
SELECT id, event_id, payment_id, ordine_id
FROM pagamenti_eventi
WHERE id IN (
  '559e4e4d-b8bc-43e7-a518-53b24629ad2e',
  '8df3317c-24b9-479c-bcf9-88db5db4f1f1',
  '964886e6-3f70-4db8-87bf-bdc212832ef9',
  '6fcaf655-6047-49c3-81fa-fbf93df21450',
  '2e94b81b-0d10-4459-8890-f34b26cee3cd',
  '78a9b0ab-1ff3-418b-8494-a121be2696ee',
  '2206b0a6-5d58-46fa-a04c-4a78d8773829',
  '7052b165-59d9-4b72-8277-fd5919f560c1',
  '2021bc40-cc4b-4aa7-b180-6b728394ad76',
  '9a659b32-faeb-4507-8601-2c481e7ca877',
  'c2a70c64-c491-446c-89de-900a983585e9'
);

-- PREVIEW 2: lo scan_log orfano (attesa 1 riga)
SELECT id, negozio_id, created_at
FROM scan_log
WHERE negozio_id = 'db53d55d-3e10-452e-9676-a160fcdf354e';

-- DELETE 1: webhook falsi
DELETE FROM pagamenti_eventi WHERE id IN (
  '559e4e4d-b8bc-43e7-a518-53b24629ad2e',
  '8df3317c-24b9-479c-bcf9-88db5db4f1f1',
  '964886e6-3f70-4db8-87bf-bdc212832ef9',
  '6fcaf655-6047-49c3-81fa-fbf93df21450',
  '2e94b81b-0d10-4459-8890-f34b26cee3cd',
  '78a9b0ab-1ff3-418b-8494-a121be2696ee',
  '2206b0a6-5d58-46fa-a04c-4a78d8773829',
  '7052b165-59d9-4b72-8277-fd5919f560c1',
  '2021bc40-cc4b-4aa7-b180-6b728394ad76',
  '9a659b32-faeb-4507-8601-2c481e7ca877',
  'c2a70c64-c491-446c-89de-900a983585e9'
);

-- DELETE 2: scan_log orfano
DELETE FROM scan_log
WHERE negozio_id = 'db53d55d-3e10-452e-9676-a160fcdf354e';

COMMIT;

-- Dopo l'esecuzione verifica:
--   SELECT count(*) FROM pagamenti_eventi; -> atteso 6
--   (5 checkout.session.completed di collaudo + 1 charge.refunded: categoria B,
--    vanno in 07_conferme_B.sql)
--   SELECT count(*) FROM scan_log WHERE negozio_id IS NULL OR negozio_id NOT IN (SELECT id::text FROM negozi); -> atteso 0