-- ============================================================================
-- 09_VERIFICA FINALE — READ-ONLY (eseguire DOPO la pulizia)
-- ============================================================================
-- Riconteggio e controlli di coerenza. Valori attesi per lo scenario
-- "solo categoria A" (02-06) e per lo scenario "A + B" (02-07).

-- 1. Conteggi post-pulizia
SELECT 'negozi' AS tabella, count(*) FROM negozi
UNION ALL SELECT 'prodotti', count(*) FROM prodotti
UNION ALL SELECT 'ordini', count(*) FROM ordini
UNION ALL SELECT 'ordini_righe', count(*) FROM ordini_righe
UNION ALL SELECT 'ordini_eventi', count(*) FROM ordini_eventi
UNION ALL SELECT 'pagamenti_sessioni', count(*) FROM pagamenti_sessioni
UNION ALL SELECT 'pagamenti_eventi', count(*) FROM pagamenti_eventi
UNION ALL SELECT 'ordine_reclami', count(*) FROM ordine_reclami
UNION ALL SELECT 'reclamo_comunicazioni', count(*) FROM reclamo_comunicazioni
UNION ALL SELECT 'preferiti', count(*) FROM preferiti
UNION ALL SELECT 'segnalazioni', count(*) FROM segnalazioni
UNION ALL SELECT 'media', count(*) FROM media
UNION ALL SELECT 'scan_log', count(*) FROM scan_log
UNION ALL SELECT 'user_roles', count(*) FROM user_roles
ORDER BY tabella;

-- Attesi con SOLO cat. A (02-06):
--   negozi 14 | prodotti 28 | ordini 21 | righe 21 | eventi 33
--   sessioni 6 | pagamenti_eventi 6 | reclami 4 (1d8b14b5, dce40a27,
--   1ced3f52, d780f213) | comunicazioni 5 | preferiti 2 | segnalazioni 3
--   media 1 (demo) | scan_log 89 (84 Panificio + 1 TechStore2 + 1 Barone-1 +
--   1 Fashion + 2 demo) | user_roles 20 | reset_tokens 21 (o meno)
-- Attesi con A + B (02-07):
--   negozi 9 (8 demo seed + Panificio) | prodotti 23 | ordini 0
--   pagamenti_eventi 0 | reclami 0 | comunicazioni 0 | preferiti 1 (Marianna)
--   segnalazioni 3 | media 1 | user_roles 4 (utenti reali)

-- 2. Nessun riferimento pendente (tutte 0)
SELECT 'prodotti orfani' AS check_tab, count(*) AS righe
FROM prodotti p LEFT JOIN negozi n ON n.id = p.negozio_id WHERE n.id IS NULL
UNION ALL
SELECT 'ordini su negozi inesistenti', count(*)
FROM ordini o LEFT JOIN negozi n ON n.id = o.negozio_id WHERE n.id IS NULL
UNION ALL
SELECT 'righe su ordini inesistenti', count(*)
FROM ordini_righe r LEFT JOIN ordini o ON o.id = r.ordine_id WHERE o.id IS NULL
UNION ALL
SELECT 'eventi su ordini inesistenti', count(*)
FROM ordini_eventi e LEFT JOIN ordini o ON o.id = e.ordine_id WHERE o.id IS NULL
UNION ALL
SELECT 'reclami su ordini inesistenti', count(*)
FROM ordine_reclami r LEFT JOIN ordini o ON o.id = r.ordine_id WHERE o.id IS NULL
UNION ALL
SELECT 'comunicazioni su reclami inesistenti', count(*)
FROM reclamo_comunicazioni c LEFT JOIN ordine_reclami r ON r.id = c.reclamo_id WHERE r.id IS NULL
UNION ALL
SELECT 'sessioni su ordini inesistenti', count(*)
FROM pagamenti_sessioni s LEFT JOIN ordini o ON o.id = s.ordine_id WHERE o.id IS NULL
UNION ALL
SELECT 'scan_log orfani', count(*)
FROM scan_log s LEFT JOIN negozi n ON n.id::text = s.negozio_id WHERE n.id IS NULL;

-- 3. Riepilogo finale negozi (attesi: demo seed + Panificio)
SELECT id, nome, slug, is_demo
FROM negozi
ORDER BY is_demo DESC, nome;

-- 4. Utenti rimasti in auth.users (attesi solo i 3 reali + eventuali seed QA
--    se la B9 non è stata attivata)
SELECT id, email FROM auth.users ORDER BY created_at;