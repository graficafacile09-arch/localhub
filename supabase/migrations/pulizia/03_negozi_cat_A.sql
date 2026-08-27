-- ============================================================================
-- 03_PULIZIA NEGOZI CATEGORIA A (SICURA) + INTERA CATENA
-- ============================================================================
-- Negozi chiaramente di test (nomi espliciti / is_demo / duplicati senza
-- ordini / owner inesistente). Eliminazione esplicita dei figli in ordine
-- di dipendenza FK, poi il negozio.
--
--  61d18a8a-... E2E Correggi AI 1786274146714  (già soft-deleted 09/08)
--  cdf5e44e-... Indirizzi Test 1786662041826    (is_demo)
--  cd2eca11-... Probe-1786541094880             (is_demo)
--  9bb3d33e-... negozio prova Whatsapp
--  d111ddab-... Barone Gioielli (duplicato -2)  (0 ordini)
--  f9f8d7a1-... Test Store Vision               (is_demo, owner inesistente)
-- ----------------------------------------------------------------------------
-- ATTENZIONE: esegui SOLO dopo il backup (vedi 00_ISTRUZIONI.sql).

BEGIN;

-- PREVIEW 1: i negozi (attesi 6)
SELECT id, nome, slug, is_demo, deleted_at
FROM negozi
WHERE id IN (
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
);

-- PREVIEW 2: gli ordini di questi negozi (attesi: LH-000068, LH-000176, LH-001400)
SELECT id, numero, cliente_nome, cliente_cognome, stato
FROM ordini
WHERE negozio_id IN (
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
);

-- PREVIEW 3: i prodotti (attesi: 1152, 335, 336, 196, 197, 1156)
SELECT id, nome FROM prodotti
WHERE negozio_id IN (
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

-- PREVIEW 4: media (attesi: 3854b663..., 0824c7ce..., 080254b6..., ffbd6be5...)
SELECT id, negozio_id FROM media
WHERE negozio_id IN (
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

-- ---------------------------------------------------------------------------
-- DELETE (figli -> padre)
-- ---------------------------------------------------------------------------

-- 1. comunicazioni dei reclami degli ordini di questi negozi
DELETE FROM reclamo_comunicazioni
WHERE reclamo_id IN (
  SELECT id FROM ordine_reclami
  WHERE ordine_id IN (SELECT id FROM ordini WHERE negozio_id IN (
    '61d18a8a-587b-4470-b69e-339eea56ad72',
    'cdf5e44e-895c-4b32-bc14-8ebe86482632',
    'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
    '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
    'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
    'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
  ))
);

-- 2. reclami degli ordini (atteso: 445f5698... sul negozio prova Whatsapp)
DELETE FROM ordine_reclami
WHERE ordine_id IN (SELECT id FROM ordini WHERE negozio_id IN (
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
));

-- 3. righe ordine
DELETE FROM ordini_righe
WHERE ordine_id IN (SELECT id FROM ordini WHERE negozio_id IN (
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
));

-- 4. eventi ordine
DELETE FROM ordini_eventi
WHERE ordine_id IN (SELECT id FROM ordini WHERE negozio_id IN (
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
));

-- 5. sessioni di pagamento (attese: 0 per questi negozi)
DELETE FROM pagamenti_sessioni
WHERE ordine_id IN (SELECT id FROM ordini WHERE negozio_id IN (
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
));

-- 6. eventi di pagamento collegati a questi ordini (attesi: 0)
DELETE FROM pagamenti_eventi
WHERE ordine_id IN (SELECT id FROM ordini WHERE negozio_id IN (
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
));

-- 7. ordini (attesi: LH-000068, LH-000176, LH-001400)
DELETE FROM ordini WHERE negozio_id IN (
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
);

-- 8. prodotti di questi negozi (attesi: 1152, 335, 336, 196, 197, 1156)
DELETE FROM prodotti WHERE negozio_id IN (
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

-- 9. preferiti su quei prodotti (attesi: 0)
-- NOTA: preferiti.riferimento_id è un testo; si confronta con l'id del prodotto
DELETE FROM preferiti
WHERE tipo = 'prodotto'
  AND riferimento_id IN (
    SELECT id::text FROM prodotti WHERE negozio_id IN (
      '61d18a8a-587b-4470-b69e-339eea56ad72',
      'cdf5e44e-895c-4b32-bc14-8ebe86482632',
      'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
      '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
      'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
      'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
    )
  );

-- 10. preferiti dei negozi (tipo='negozio'; attesi: 0 per questi negozi)
DELETE FROM preferiti
WHERE tipo = 'negozio'
  AND riferimento_id IN (
    SELECT id::text FROM negozi WHERE id IN (
      '61d18a8a-587b-4470-b69e-339eea56ad72',
      'cdf5e44e-895c-4b32-bc14-8ebe86482632',
      'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
      '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
      'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
      'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
    )
  );

-- 11. notifiche stock (attese: 0 per questi negozi)
DELETE FROM product_stock_notifications WHERE negozio_id IN (
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
);

-- 12. media (attesi: 3854b663..., 0824c7ce..., 080254b6..., ffbd6be5...)
DELETE FROM media WHERE negozio_id IN (
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

-- 13. log di scansione (attesi: 2 per prova Whatsapp + 2 per Barone-2)
DELETE FROM scan_log WHERE negozio_id IN (
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

-- 14. configurazioni negozio (attese: 0 per questi negozi)
DELETE FROM negozio_metodi_spedizione WHERE negozio_id IN (
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
);
DELETE FROM negozio_metodi_pagamento WHERE negozio_id IN (
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
);
DELETE FROM negozio_pagamenti WHERE negozio_id IN (
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
);

-- 15. eventi/offerte negozio (attesi: 0 per questi negozi)
DELETE FROM eventi WHERE negozio_id IN (
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
);
DELETE FROM offerte WHERE negozio_id IN (
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
);

-- 16. i negozi (attesi 6 righe eliminate)
DELETE FROM negozi WHERE id IN (
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906'
);

COMMIT;

-- Nota: le righe media eliminate (3854b663, 0824c7ce, 080254b6, ffbd6be5)
-- riferiscono file nello storage `store-images/...`: se vuoi liberare anche
-- quelli, cancella i blob dal bucket Storage di Supabase (stessi percorsi
-- in media.file_path) dopo la verifica.
-- Dopo l'esecuzione verifica: SELECT count(*) FROM negozi; -> atteso 14