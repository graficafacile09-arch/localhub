-- ============================================================================
-- 04_PULIZIA ORDINI DI TEST SU NEGOZI DEMO SEED E PANIFICIO — CATEGORIA A
-- ============================================================================
-- Ordini chiaramente di test (clienti finti, chiavi idempotency prod-*/ntfy-*,
-- email @localhub.test / collaudo-stripe) su:
--   - negozi demo seed (Salus Farma 10000000-...-005): LH-000025..030, 056..058
--   - Panificio Rossi (f3a82af7...) collaudo: LH-000059, 060, 061, 062, 066,
--     067, 069, 070, 476, 853, 911, 980, 1402, 1581, 1582, 1583
-- Incluso: reclamo chiuso c60ba340... (LH-000070) + 2 comunicazioni.
--
-- NOTA: gli ordini da account reale (Marianna/owner) e i 5 "paid" del collaudo
-- Stripe sono in 07_conferme_B.sql (richiedono conferma).
-- ----------------------------------------------------------------------------
-- ATTENZIONE: esegui SOLO dopo il backup (vedi 00_ISTRUZIONI.sql).

BEGIN;

-- PREVIEW 1: gli ordini da eliminare (attesi 25)
SELECT id, numero, cliente_nome, cliente_cognome, cliente_email, stato
FROM ordini
WHERE id IN (
  -- Salus Farma (demo seed)
  'a0b59cc1-84c1-44e2-b5ce-55ba31a4b36c',   -- LH-000025 Verifica Prod
  'c5295b49-1b8f-4394-ac44-044c57370742',   -- LH-000026 Verifica Prod
  '3f50376a-1f56-4842-9a26-10d360975b18',   -- LH-000027 Verifica Prod
  'cebe5dea-a87d-464c-a496-95b7cb5ed295',   -- LH-000028 Verifica Prod
  '3fb74812-a3b7-467a-bc12-eedab8a97a74',   -- LH-000029 Verifica Prod
  '56c8fe3b-3b1d-42c8-a67c-dea2ac53227f',   -- LH-000030 Verifica Prod
  '642e9895-740a-4bce-b4b0-b76005a317ee',   -- LH-000056 Verifica Ntfy
  '91f3c897-9a1c-4370-9e3f-01640e8eb4ec',   -- LH-000057 Verifica Ntfy
  'd1a51b4a-d944-4124-ae13-7cffb9cf4f4c',   -- LH-000058 Verifica Ntfy
  -- Panificio Rossi (collaudo, categoria A)
  '63dfacd3-716c-4202-a502-f090ba2c18a6',   -- LH-000059 dedo dudu
  '4de0b1c3-6a22-4c71-9614-a525dd129994',   -- LH-000060 dusu dasa (700 €)
  '272cd09a-7002-486c-963a-d77235baaefd',   -- LH-000061 fuffa du
  'e2721956-5413-4b83-9ff6-b1dfc1a34971',   -- LH-000062 ggg ghg
  'e949b2d9-0219-4e14-a6d3-3ec1e46038b8',   -- LH-000066 giu bar
  '3d92b142-b585-4d8d-bfba-1826ec3a28c5',   -- LH-000067 giu gio
  'f199995e-60a3-4eea-b1dc-f38d9336722a',   -- LH-000069 ggg hhg
  'ada9f626-5a52-49f4-b1db-17b53ac5a7cb',   -- LH-000070 fgg hhh (129 €)
  'f9f4145f-ef1e-42cd-96cf-b8a92504108c',   -- LH-000476 Mario Rossi
  'ca692b88-4977-40a4-8e6c-65d91ed8913a',   -- LH-000853 ggg nnn
  'c4df45aa-d424-445f-981e-3d1e2b7511ae',   -- LH-000911 ghh nnj
  '8a0d960a-4161-454c-91e5-64a2748dc95b',   -- LH-000980 hh bhb
  '4ec1ddff-c28b-42e7-a672-75851214f0db',   -- LH-001402 bbbv hhhhh
  'a6f0aa33-a161-4818-90ae-4539c8cc1c66',   -- LH-001581 Mario Rossi (stripe)
  'e08ecbb6-8651-4349-af53-2c82f3bff781',   -- LH-001582 Pinco Pallino (stripe)
  'da0ff456-1e6b-4505-ae5e-6be25d813ffb'    -- LH-001583 Collaudo PreviewTest
);

-- PREVIEW 2: sessioni di pagamento collegate (attese 3: 1581, 1582, 1583)
SELECT id, ordine_id FROM pagamenti_sessioni
WHERE ordine_id IN (
  'a6f0aa33-a161-4818-90ae-4539c8cc1c66',
  'e08ecbb6-8651-4349-af53-2c82f3bff781',
  'da0ff456-1e6b-4505-ae5e-6be25d813ffb'
);

-- PREVIEW 3: reclami collegati (atteso 1: c60ba340... su LH-000070)
SELECT id, ordine_id, stato FROM ordine_reclami
WHERE ordine_id IN (
  'ada9f626-5a52-49f4-b1db-17b53ac5a7cb'
);

-- ---------------------------------------------------------------------------
-- DELETE (figli -> padre)
-- ---------------------------------------------------------------------------

-- 1. comunicazioni dei reclami (attese 2: e130cdbd..., 484157e7...)
DELETE FROM reclamo_comunicazioni
WHERE reclamo_id IN (
  SELECT id FROM ordine_reclami WHERE ordine_id IN (
    'a0b59cc1-84c1-44e2-b5ce-55ba31a4b36c',
    'c5295b49-1b8f-4394-ac44-044c57370742',
    '3f50376a-1f56-4842-9a26-10d360975b18',
    'cebe5dea-a87d-464c-a496-95b7cb5ed295',
    '3fb74812-a3b7-467a-bc12-eedab8a97a74',
    '56c8fe3b-3b1d-42c8-a67c-dea2ac53227f',
    '642e9895-740a-4bce-b4b0-b76005a317ee',
    '91f3c897-9a1c-4370-9e3f-01640e8eb4ec',
    'd1a51b4a-d944-4124-ae13-7cffb9cf4f4c',
    '63dfacd3-716c-4202-a502-f090ba2c18a6',
    '4de0b1c3-6a22-4c71-9614-a525dd129994',
    '272cd09a-7002-486c-963a-d77235baaefd',
    'e2721956-5413-4b83-9ff6-b1dfc1a34971',
    'e949b2d9-0219-4e14-a6d3-3ec1e46038b8',
    '3d92b142-b585-4d8d-bfba-1826ec3a28c5',
    'f199995e-60a3-4eea-b1dc-f38d9336722a',
    'ada9f626-5a52-49f4-b1db-17b53ac5a7cb',
    'f9f4145f-ef1e-42cd-96cf-b8a92504108c',
    'ca692b88-4977-40a4-8e6c-65d91ed8913a',
    'c4df45aa-d424-445f-981e-3d1e2b7511ae',
    '8a0d960a-4161-454c-91e5-64a2748dc95b',
    '4ec1ddff-c28b-42e7-a672-75851214f0db',
    'a6f0aa33-a161-4818-90ae-4539c8cc1c66',
    'e08ecbb6-8651-4349-af53-2c82f3bff781',
    'da0ff456-1e6b-4505-ae5e-6be25d813ffb'
  )
);

-- 2. reclami (atteso 1: c60ba340... risolto su LH-000070)
DELETE FROM ordine_reclami WHERE ordine_id IN (
  'ada9f626-5a52-49f4-b1db-17b53ac5a7cb'
);

-- 3. righe ordine
DELETE FROM ordini_righe WHERE ordine_id IN (
  'a0b59cc1-84c1-44e2-b5ce-55ba31a4b36c',
  'c5295b49-1b8f-4394-ac44-044c57370742',
  '3f50376a-1f56-4842-9a26-10d360975b18',
  'cebe5dea-a87d-464c-a496-95b7cb5ed295',
  '3fb74812-a3b7-467a-bc12-eedab8a97a74',
  '56c8fe3b-3b1d-42c8-a67c-dea2ac53227f',
  '642e9895-740a-4bce-b4b0-b76005a317ee',
  '91f3c897-9a1c-4370-9e3f-01640e8eb4ec',
  'd1a51b4a-d944-4124-ae13-7cffb9cf4f4c',
  '63dfacd3-716c-4202-a502-f090ba2c18a6',
  '4de0b1c3-6a22-4c71-9614-a525dd129994',
  '272cd09a-7002-486c-963a-d77235baaefd',
  'e2721956-5413-4b83-9ff6-b1dfc1a34971',
  'e949b2d9-0219-4e14-a6d3-3ec1e46038b8',
  '3d92b142-b585-4d8d-bfba-1826ec3a28c5',
  'f199995e-60a3-4eea-b1dc-f38d9336722a',
  'ada9f626-5a52-49f4-b1db-17b53ac5a7cb',
  'f9f4145f-ef1e-42cd-96cf-b8a92504108c',
  'ca692b88-4977-40a4-8e6c-65d91ed8913a',
  'c4df45aa-d424-445f-981e-3d1e2b7511ae',
  '8a0d960a-4161-454c-91e5-64a2748dc95b',
  '4ec1ddff-c28b-42e7-a672-75851214f0db',
  'a6f0aa33-a161-4818-90ae-4539c8cc1c66',
  'e08ecbb6-8651-4349-af53-2c82f3bff781',
  'da0ff456-1e6b-4505-ae5e-6be25d813ffb'
);

-- 4. eventi ordine
DELETE FROM ordini_eventi WHERE ordine_id IN (
  'a0b59cc1-84c1-44e2-b5ce-55ba31a4b36c',
  'c5295b49-1b8f-4394-ac44-044c57370742',
  '3f50376a-1f56-4842-9a26-10d360975b18',
  'cebe5dea-a87d-464c-a496-95b7cb5ed295',
  '3fb74812-a3b7-467a-bc12-eedab8a97a74',
  '56c8fe3b-3b1d-42c8-a67c-dea2ac53227f',
  '642e9895-740a-4bce-b4b0-b76005a317ee',
  '91f3c897-9a1c-4370-9e3f-01640e8eb4ec',
  'd1a51b4a-d944-4124-ae13-7cffb9cf4f4c',
  '63dfacd3-716c-4202-a502-f090ba2c18a6',
  '4de0b1c3-6a22-4c71-9614-a525dd129994',
  '272cd09a-7002-486c-963a-d77235baaefd',
  'e2721956-5413-4b83-9ff6-b1dfc1a34971',
  'e949b2d9-0219-4e14-a6d3-3ec1e46038b8',
  '3d92b142-b585-4d8d-bfba-1826ec3a28c5',
  'f199995e-60a3-4eea-b1dc-f38d9336722a',
  'ada9f626-5a52-49f4-b1db-17b53ac5a7cb',
  'f9f4145f-ef1e-42cd-96cf-b8a92504108c',
  'ca692b88-4977-40a4-8e6c-65d91ed8913a',
  'c4df45aa-d424-445f-981e-3d1e2b7511ae',
  '8a0d960a-4161-454c-91e5-64a2748dc95b',
  '4ec1ddff-c28b-42e7-a672-75851214f0db',
  'a6f0aa33-a161-4818-90ae-4539c8cc1c66',
  'e08ecbb6-8651-4349-af53-2c82f3bff781',
  'da0ff456-1e6b-4505-ae5e-6be25d813ffb'
);

-- 5. sessioni di pagamento (attese 3)
DELETE FROM pagamenti_sessioni WHERE ordine_id IN (
  'a6f0aa33-a161-4818-90ae-4539c8cc1c66',
  'e08ecbb6-8651-4349-af53-2c82f3bff781',
  'da0ff456-1e6b-4505-ae5e-6be25d813ffb'
);

-- 6. eventi di pagamento collegati (attesi 0 per questi ordini)
DELETE FROM pagamenti_eventi WHERE ordine_id IN (
  'a0b59cc1-84c1-44e2-b5ce-55ba31a4b36c',
  'c5295b49-1b8f-4394-ac44-044c57370742',
  '3f50376a-1f56-4842-9a26-10d360975b18',
  'cebe5dea-a87d-464c-a496-95b7cb5ed295',
  '3fb74812-a3b7-467a-bc12-eedab8a97a74',
  '56c8fe3b-3b1d-42c8-a67c-dea2ac53227f',
  '642e9895-740a-4bce-b4b0-b76005a317ee',
  '91f3c897-9a1c-4370-9e3f-01640e8eb4ec',
  'd1a51b4a-d944-4124-ae13-7cffb9cf4f4c',
  '63dfacd3-716c-4202-a502-f090ba2c18a6',
  '4de0b1c3-6a22-4c71-9614-a525dd129994',
  '272cd09a-7002-486c-963a-d77235baaefd',
  'e2721956-5413-4b83-9ff6-b1dfc1a34971',
  'e949b2d9-0219-4e14-a6d3-3ec1e46038b8',
  '3d92b142-b585-4d8d-bfba-1826ec3a28c5',
  'f199995e-60a3-4eea-b1dc-f38d9336722a',
  'ada9f626-5a52-49f4-b1db-17b53ac5a7cb',
  'f9f4145f-ef1e-42cd-96cf-b8a92504108c',
  'ca692b88-4977-40a4-8e6c-65d91ed8913a',
  'c4df45aa-d424-445f-981e-3d1e2b7511ae',
  '8a0d960a-4161-454c-91e5-64a2748dc95b',
  '4ec1ddff-c28b-42e7-a672-75851214f0db',
  'a6f0aa33-a161-4818-90ae-4539c8cc1c66',
  'e08ecbb6-8651-4349-af53-2c82f3bff781',
  'da0ff456-1e6b-4505-ae5e-6be25d813ffb'
);

-- 7. gli ordini (attesi 25)
DELETE FROM ordini WHERE id IN (
  'a0b59cc1-84c1-44e2-b5ce-55ba31a4b36c',
  'c5295b49-1b8f-4394-ac44-044c57370742',
  '3f50376a-1f56-4842-9a26-10d360975b18',
  'cebe5dea-a87d-464c-a496-95b7cb5ed295',
  '3fb74812-a3b7-467a-bc12-eedab8a97a74',
  '56c8fe3b-3b1d-42c8-a67c-dea2ac53227f',
  '642e9895-740a-4bce-b4b0-b76005a317ee',
  '91f3c897-9a1c-4370-9e3f-01640e8eb4ec',
  'd1a51b4a-d944-4124-ae13-7cffb9cf4f4c',
  '63dfacd3-716c-4202-a502-f090ba2c18a6',
  '4de0b1c3-6a22-4c71-9614-a525dd129994',
  '272cd09a-7002-486c-963a-d77235baaefd',
  'e2721956-5413-4b83-9ff6-b1dfc1a34971',
  'e949b2d9-0219-4e14-a6d3-3ec1e46038b8',
  '3d92b142-b585-4d8d-bfba-1826ec3a28c5',
  'f199995e-60a3-4eea-b1dc-f38d9336722a',
  'ada9f626-5a52-49f4-b1db-17b53ac5a7cb',
  'f9f4145f-ef1e-42cd-96cf-b8a92504108c',
  'ca692b88-4977-40a4-8e6c-65d91ed8913a',
  'c4df45aa-d424-445f-981e-3d1e2b7511ae',
  '8a0d960a-4161-454c-91e5-64a2748dc95b',
  '4ec1ddff-c28b-42e7-a672-75851214f0db',
  'a6f0aa33-a161-4818-90ae-4539c8cc1c66',
  'e08ecbb6-8651-4349-af53-2c82f3bff781',
  'da0ff456-1e6b-4505-ae5e-6be25d813ffb'
);

COMMIT;

-- Dopo l'esecuzione verifica: SELECT count(*) FROM ordini; -> atteso 21
-- (in sequenza dopo 02+03; 24 se 04 viene eseguito da solo)