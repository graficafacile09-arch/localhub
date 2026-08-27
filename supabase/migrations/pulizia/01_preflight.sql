-- ============================================================================
-- 01_PREFLIGHT — READ-ONLY: conteggi attuali e controllo stato (nessuna DELETE)
-- ============================================================================
-- Esegui prima di tutto: i conteggi qui sotto sono quelli rilevati dall'audit
-- del 17/08/2026; se qualcosa NON corrisponde, fermati e investiga prima di
-- procedere con i file 02-06.

SELECT 'negozi' AS tabella, count(*) FROM negozi
UNION ALL SELECT 'prodotti', count(*) FROM prodotti
UNION ALL SELECT 'ordini', count(*) FROM ordini
UNION ALL SELECT 'ordini_righe', count(*) FROM ordini_righe
UNION ALL SELECT 'ordini_eventi', count(*) FROM ordini_eventi
UNION ALL SELECT 'pagamenti_sessioni', count(*) FROM pagamenti_sessioni
UNION ALL SELECT 'pagamenti_eventi', count(*) FROM pagamenti_eventi
UNION ALL SELECT 'negozio_pagamenti', count(*) FROM negozio_pagamenti
UNION ALL SELECT 'negozio_metodi_pagamento', count(*) FROM negozio_metodi_pagamento
UNION ALL SELECT 'negozio_metodi_spedizione', count(*) FROM negozio_metodi_spedizione
UNION ALL SELECT 'ordine_reclami', count(*) FROM ordine_reclami
UNION ALL SELECT 'reclamo_comunicazioni', count(*) FROM reclamo_comunicazioni
UNION ALL SELECT 'preferiti', count(*) FROM preferiti
UNION ALL SELECT 'segnalazioni', count(*) FROM segnalazioni
UNION ALL SELECT 'eventi', count(*) FROM eventi
UNION ALL SELECT 'offerte', count(*) FROM offerte
UNION ALL SELECT 'media', count(*) FROM media
UNION ALL SELECT 'scan_log', count(*) FROM scan_log
UNION ALL SELECT 'cliente_profili', count(*) FROM cliente_profili
UNION ALL SELECT 'user_roles', count(*) FROM user_roles
UNION ALL SELECT 'reset_tokens', count(*) FROM reset_tokens
UNION ALL SELECT 'product_stock_notifications', count(*) FROM product_stock_notifications
UNION ALL SELECT 'product_vision_cache', count(*) FROM product_vision_cache
UNION ALL SELECT 'template_negozi', count(*) FROM template_negozi
UNION ALL SELECT 'payout', count(*) FROM payout
UNION ALL SELECT 'merchant_profiles', count(*) FROM merchant_profiles
UNION ALL SELECT 'prodotto_varianti', count(*) FROM prodotto_varianti
UNION ALL SELECT 'product_media', count(*) FROM product_media
ORDER BY tabella;

-- Riferimento atteso dall'audit (17/08/2026):
-- negozi 20 | prodotti 53 | ordini 49 | righe 50 | eventi 66 | sessioni 9
-- pagamenti_eventi 17 | negozio_pagamenti 4 | metodi_pagamento 4
-- metodi_spedizione 9 | reclami 6 | comunicazioni 7 | preferiti 2
-- segnalazioni 4 | eventi 1 | offerte 1 | media 5 | scan_log 94
-- cliente_profili 3 | user_roles 26 | reset_tokens 21 | stock_notif 3
-- vision_cache 102 | template_negozi 0 | payout 0 | merchant_profiles 0
-- prodotto_varianti 0 | product_media 0

-- Controlli di coerenza (devono restituire 0 righe / 0 conteggi):
-- 1) ordini appartenenti a negozi eliminati (orlani): atteso 0
SELECT o.id, o.numero
FROM ordini o
LEFT JOIN negozi n ON n.id = o.negozio_id
WHERE n.id IS NULL;

-- 2) prodotti orfani (negozio non esistente): attesi 19
SELECT p.id, p.nome
FROM prodotti p
LEFT JOIN negozi n ON n.id = p.negozio_id
WHERE n.id IS NULL
ORDER BY p.id;

-- 3) scan_log orfani: attesa 1 riga (negozio db53d55d-3e10-452e-9676-a160fcdf354e)
SELECT s.id, s.negozio_id
FROM scan_log s
LEFT JOIN negozi n ON n.id::text = s.negozio_id
WHERE n.id IS NULL;

-- 4) utenti di test presenti: attesi gli 8 "ephemeral" + 8 seed QA
SELECT id, email, created_at
FROM auth.users
WHERE id IN (
  '590676fc-f946-4e11-a5b8-c715d2c7adf0',
  'a01f8433-52a4-4cdd-9176-93061ef54985',
  '2a18e505-93c7-4d81-8da8-dfa30a856266',
  'd7d304eb-9aab-4ba8-a497-b8228eb72dfa',
  '6363d300-c788-40e3-aafa-76858b842d1b',
  'fc52900b-30e4-48ba-a208-e41888c903c7',
  '847f441b-e84d-46da-8e94-98e66ba71f64',
  '4b693d71-0382-443d-ac92-bda4ebe59c7e',
  '2c9f2f4e-7e00-45e0-8ad9-49955338d952',
  '7c59d246-eac0-4b78-b93c-03d0e053b852',
  '468bfc70-bb70-43af-a2b9-522421c4bc89',
  'bcbaf259-56b6-461c-91ae-ffcdc05c147c',
  '8db3d990-7c0f-400a-a2ed-cdf321e780bd',
  'ecfbb11d-8065-4e89-9512-8f4439c77ae5',
  'a7e57527-b679-4a88-b4c5-f1aee330d14c',
  'b15b2364-0302-40d0-8f71-f271a6d63563'
);

-- 5) negozi di categoria A presenti (attesi 6)
SELECT id, nome, slug, is_demo, deleted_at
FROM negozi
WHERE id IN (
  '61d18a8a-587b-4470-b69e-339eea56ad72',   -- E2E Correggi AI 1786274146714
  'cdf5e44e-895c-4b32-bc14-8ebe86482632',   -- Indirizzi Test 1786662041826
  'cd2eca11-d9b0-4e2c-b955-b0da1846f138',   -- Probe-1786541094880
  '9bb3d33e-472f-49d7-998b-4c6a45d762b2',   -- negozio prova Whatsapp
  'd111ddab-17c6-4b6d-ad2f-3a2d68fc80f5',   -- Barone Gioielli (dup -2)
  'f9f8d7a1-1bae-4614-806a-5bb26f45e906'    -- Test Store Vision
);