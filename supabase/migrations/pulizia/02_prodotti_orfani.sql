-- ============================================================================
-- 02_PULIZIA PRODOTTI ORFANI — CATEGORIA A (SICURA)
-- ============================================================================
-- Prodotti di test residui di negozi già eliminati definitivamente (15/08/2026)
-- o creati da scan AI su negozi demo. Nessuna riga in: ordini_righe,
-- preferiti, product_stock_notifications, prodotto_varianti, product_media.
-- ----------------------------------------------------------------------------
-- ATTENZIONE: esegui SOLO dopo il backup (vedi 00_ISTRUZIONI.sql).

BEGIN;

-- PREVIEW 1: i prodotti che verranno eliminati (attesi 19)
SELECT id, nome, prezzo, negozio_id
FROM prodotti
WHERE id IN (49, 50, 51, 63, 64, 65, 66, 67, 68, 69, 70, 71, 148, 716, 717, 719, 730, 219, 192)
ORDER BY id;

-- PREVIEW 2: verifica che NON esistano riferimenti a questi prodotti
-- (tutte le query devono restituire 0 righe)
SELECT 'ordini_righe' AS tab, count(*) FROM ordini_righe WHERE prodotto_id IN (49, 50, 51, 63, 64, 65, 66, 67, 68, 69, 70, 71, 148, 716, 717, 719, 730, 219, 192)
UNION ALL SELECT 'preferiti', count(*) FROM preferiti WHERE tipo = 'prodotto' AND riferimento_id IN ('49', '50', '51', '63', '64', '65', '66', '67', '68', '69', '70', '71', '148', '716', '717', '719', '730', '219', '192')
UNION ALL SELECT 'product_stock_notifications', count(*) FROM product_stock_notifications WHERE prodotto_id IN (49, 50, 51, 63, 64, 65, 66, 67, 68, 69, 70, 71, 148, 716, 717, 719, 730, 219, 192)
UNION ALL SELECT 'prodotto_varianti', count(*) FROM prodotto_varianti WHERE prodotto_id IN (49, 50, 51, 63, 64, 65, 66, 67, 68, 69, 70, 71, 148, 716, 717, 719, 730, 219, 192)
UNION ALL SELECT 'product_media', count(*) FROM product_media WHERE product_id::text IN ('49','50','51','63','64','65','66','67','68','69','70','71','148','716','717','719','730','219','192');

-- DELETE 1: prodotti orfani "Prodotto E2E *" e "Prodotto Test Notifiche E2E"
-- (id 49..148: negozi eliminati; id 219: negozio 00c4ec4b eliminato)
DELETE FROM prodotti
WHERE id IN (49, 50, 51, 63, 64, 65, 66, 67, 68, 69, 70, 71, 148, 219)
  AND negozio_id NOT IN (SELECT id FROM negozi);

-- DELETE 2: prodotti residui test Klarna (716, 717, 719, 730 — negozi eliminati)
DELETE FROM prodotti
WHERE id IN (716, 717, 719, 730)
  AND negozio_id NOT IN (SELECT id FROM negozi);

-- DELETE 3: prodotto 192 "Prodotto non identificabile" (scan AI, prezzo 0)
-- creato sul negozio demo 10000000-...-009 (Amici a Quattro Zampe):
-- si elimina SOLO il prodotto, il negozio demo resta.
DELETE FROM prodotti WHERE id = 192;

COMMIT;

-- Dopo l'esecuzione verifica: SELECT count(*) FROM prodotti; -> atteso 34
