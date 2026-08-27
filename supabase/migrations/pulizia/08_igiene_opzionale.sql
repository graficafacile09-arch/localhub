-- ============================================================================
-- 08_IGIENE OPZIONALE (TUTTO COMMENTATO)
-- ============================================================================
-- Pulizie non necessarie (nessun dato riferito da altre tabelle) ma che
-- riducono il rumore del DB. NIENTE viene eseguito: attiva le righe solo
-- se vuoi queste pulizie.

-- 1. cache del benchmark visione AI (102 righe, nessun riferimento)
-- BEGIN;
-- DELETE FROM product_vision_cache;
-- COMMIT;

-- 2. token di reset password scaduti/transienti (21 righe totali; quelli
--    degli utenti di test sono già coperti da 06/07)
-- BEGIN;
-- DELETE FROM reset_tokens;
-- COMMIT;

-- 3. scan_log del Panificio Rossi (84 righe = collaudo): DA ELIMINARE SOLO
--    DOPO la chiusura formale del collaudo pagamenti/scansione (i log sono
--    utili come evidenza fino ad allora)
-- BEGIN;
-- DELETE FROM scan_log WHERE negozio_id = 'f3a82af7-dd47-482f-8a49-ea58e692238c';
-- COMMIT;

-- 4. (riferimento) i 2 scan_log sul negozio demo 10000000-...-009 sono
--    contenuto demo: NON eliminarli.