-- ============================================================================
-- 03_PULIZIA NEGOZI SENZA ORDINI - CATEGORIA A
-- ============================================================================
-- Elimina SOLO negozi verificati senza ordini, prodotti, media,
-- preferiti negozio e notifiche stock.
-- ============================================================================

BEGIN;

-- PRE-CONTROLLO
SELECT id, nome, slug, is_demo, deleted_at
FROM negozi
WHERE id IN (
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906',
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

-- Devono essere 3 negozi.

-- CONTROLLO ORDINI
SELECT COUNT(*) AS ordini
FROM ordini
WHERE negozio_id IN (
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906',
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

-- Deve essere 0.

-- ELIMINA EVENTUALI RIFERIMENTI DI CONFIGURAZIONE
DELETE FROM negozio_metodi_spedizione
WHERE negozio_id IN (
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906',
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

DELETE FROM negozio_metodi_pagamento
WHERE negozio_id IN (
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906',
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

DELETE FROM negozio_pagamenti
WHERE negozio_id IN (
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906',
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

DELETE FROM eventi
WHERE negozio_id IN (
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906',
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

DELETE FROM offerte
WHERE negozio_id IN (
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906',
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

DELETE FROM product_stock_notifications
WHERE negozio_id IN (
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906',
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

DELETE FROM preferiti
WHERE tipo = 'negozio'
  AND riferimento_id IN (
    'f9f8d7a1-1bae-4614-806a-5bb26f45e906',
    '61d18a8a-587b-4470-b69e-339eea56ad72',
    'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
  );

-- MEDIA
DELETE FROM media
WHERE negozio_id IN (
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906',
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

-- PRODOTTI
DELETE FROM prodotti
WHERE negozio_id IN (
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906',
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

-- NEGOZI
DELETE FROM negozi
WHERE id IN (
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906',
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

COMMIT;

-- VERIFICA FINALE
SELECT 'negozi_residui' AS controllo, COUNT(*) AS totale
FROM negozi
WHERE id IN (
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906',
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
)
UNION ALL
SELECT 'prodotti_residui', COUNT(*)
FROM prodotti
WHERE negozio_id IN (
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906',
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
)
UNION ALL
SELECT 'ordini_residui', COUNT(*)
FROM ordini
WHERE negozio_id IN (
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906',
  '61d18a8a-587b-4470-b69e-339eea56ad72',
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5'
);

-- Tutti devono risultare 0.
