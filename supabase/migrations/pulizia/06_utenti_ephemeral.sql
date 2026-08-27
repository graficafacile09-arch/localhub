-- ============================================================================
-- 06_PULIZIA UTENTI DI TEST "EPHEMERAL" — CATEGORIA A
-- ============================================================================
-- 8 utenti creati da script di diagnosi/probe/E2E (nessun login dal giorno
-- di creazione, nessuna relazione oltre a user_roles e 1 segnalazione di
-- test). NON si toccano gli utenti seed QA (admin/commercianti/customer .test:
-- categoria B, file 07).
--  590676fc... api-1786042414007@localhub.test
--  a01f8433... diag-flusso-kci92q@test.localhub.it
--  2a18e505... diag-flusso-*@test.localhub.it
--  d7d304eb... diag-flusso-*@test.localhub.it
--  6363d300... diag-flusso-*@test.localhub.it
--  fc52900b... diag-flusso-kck7ma@test.localhub.it   (+1 segnalazione test)
--  847f441b... query-admin-kcldwr@test.localhub.it
--  4b693d71... lh-e2e-39625@web-library.net
-- ----------------------------------------------------------------------------
-- ATTENZIONE: esegui SOLO dopo il backup (vedi 00_ISTRUZIONI.sql).
-- Se la DELETE su auth.users fallisce per privilegi, elimina gli utenti dal
-- pannello Supabase Studio -> Authentication -> Users (stessi ID).

BEGIN;

-- PREVIEW 1: gli utenti (attesi 8)
SELECT id, email, created_at, last_sign_in_at
FROM auth.users
WHERE id IN (
  '590676fc-f946-4e11-a5b8-c715d2c7adf0',
  'a01f8433-52a4-4cdd-9176-93061ef54985',
  '2a18e505-93c7-4d81-8da8-dfa30a856266',
  'd7d304eb-9aab-4ba8-a497-b8228eb72dfa',
  '6363d300-c788-40e3-aafa-76858b842d1b',
  'fc52900b-30e4-48ba-a208-e41888c903c7',
  '847f441b-e84d-46da-8e94-98e66ba71f64',
  '4b693d71-0382-443d-ac92-bda4ebe59c7e'
);

-- PREVIEW 2: ruoli collegati (attesi 6: 0b19c142, 98826c9f, 45061c9b,
-- addd3531, ba9f5deb, b0a12006 — i due utenti senza ruolo non compaiono)
SELECT id, user_id, role FROM user_roles WHERE user_id IN (
  '590676fc-f946-4e11-a5b8-c715d2c7adf0',
  'a01f8433-52a4-4cdd-9176-93061ef54985',
  '2a18e505-93c7-4d81-8da8-dfa30a856266',
  'd7d304eb-9aab-4ba8-a497-b8228eb72dfa',
  '6363d300-c788-40e3-aafa-76858b842d1b',
  'fc52900b-30e4-48ba-a208-e41888c903c7',
  '847f441b-e84d-46da-8e94-98e66ba71f64',
  '4b693d71-0382-443d-ac92-bda4ebe59c7e'
);

-- PREVIEW 3: altre relazioni (attese: 1 segnalazione, 0 preferiti,
-- 0 cliente_profili, 0 reset_tokens, 0 ordini, 0 negozi posseduti)
SELECT 'segnalazioni' AS tab, count(*) FROM segnalazioni WHERE user_id IN (
  '590676fc-f946-4e11-a5b8-c715d2c7adf0',
  'a01f8433-52a4-4cdd-9176-93061ef54985',
  '2a18e505-93c7-4d81-8da8-dfa30a856266',
  'd7d304eb-9aab-4ba8-a497-b8228eb72dfa',
  '6363d300-c788-40e3-aafa-76858b842d1b',
  'fc52900b-30e4-48ba-a208-e41888c903c7',
  '847f441b-e84d-46da-8e94-98e66ba71f64',
  '4b693d71-0382-443d-ac92-bda4ebe59c7e'
)
UNION ALL SELECT 'preferiti', count(*) FROM preferiti WHERE user_id IN (
  '590676fc-f946-4e11-a5b8-c715d2c7adf0',
  'a01f8433-52a4-4cdd-9176-93061ef54985',
  '2a18e505-93c7-4d81-8da8-dfa30a856266',
  'd7d304eb-9aab-4ba8-a497-b8228eb72dfa',
  '6363d300-c788-40e3-aafa-76858b842d1b',
  'fc52900b-30e4-48ba-a208-e41888c903c7',
  '847f441b-e84d-46da-8e94-98e66ba71f64',
  '4b693d71-0382-443d-ac92-bda4ebe59c7e'
)
UNION ALL SELECT 'cliente_profili', count(*) FROM cliente_profili WHERE user_id IN (
  '590676fc-f946-4e11-a5b8-c715d2c7adf0',
  'a01f8433-52a4-4cdd-9176-93061ef54985',
  '2a18e505-93c7-4d81-8da8-dfa30a856266',
  'd7d304eb-9aab-4ba8-a497-b8228eb72dfa',
  '6363d300-c788-40e3-aafa-76858b842d1b',
  'fc52900b-30e4-48ba-a208-e41888c903c7',
  '847f441b-e84d-46da-8e94-98e66ba71f64',
  '4b693d71-0382-443d-ac92-bda4ebe59c7e'
)
UNION ALL SELECT 'reset_tokens', count(*) FROM reset_tokens WHERE user_id IN (
  '590676fc-f946-4e11-a5b8-c715d2c7adf0',
  'a01f8433-52a4-4cdd-9176-93061ef54985',
  '2a18e505-93c7-4d81-8da8-dfa30a856266',
  'd7d304eb-9aab-4ba8-a497-b8228eb72dfa',
  '6363d300-c788-40e3-aafa-76858b842d1b',
  'fc52900b-30e4-48ba-a208-e41888c903c7',
  '847f441b-e84d-46da-8e94-98e66ba71f64',
  '4b693d71-0382-443d-ac92-bda4ebe59c7e'
)
UNION ALL SELECT 'ordini', count(*) FROM ordini WHERE cliente_user_id IN (
  '590676fc-f946-4e11-a5b8-c715d2c7adf0',
  'a01f8433-52a4-4cdd-9176-93061ef54985',
  '2a18e505-93c7-4d81-8da8-dfa30a856266',
  'd7d304eb-9aab-4ba8-a497-b8228eb72dfa',
  '6363d300-c788-40e3-aafa-76858b842d1b',
  'fc52900b-30e4-48ba-a208-e41888c903c7',
  '847f441b-e84d-46da-8e94-98e66ba71f64',
  '4b693d71-0382-443d-ac92-bda4ebe59c7e'
)
UNION ALL SELECT 'negozi posseduti', count(*) FROM negozi WHERE owner_user_id IN (
  '590676fc-f946-4e11-a5b8-c715d2c7adf0',
  'a01f8433-52a4-4cdd-9176-93061ef54985',
  '2a18e505-93c7-4d81-8da8-dfa30a856266',
  'd7d304eb-9aab-4ba8-a497-b8228eb72dfa',
  '6363d300-c788-40e3-aafa-76858b842d1b',
  'fc52900b-30e4-48ba-a208-e41888c903c7',
  '847f441b-e84d-46da-8e94-98e66ba71f64',
  '4b693d71-0382-443d-ac92-bda4ebe59c7e'
);

-- ---------------------------------------------------------------------------
-- DELETE (figli -> padre)
-- ---------------------------------------------------------------------------

-- 1. ruoli (attesi 6)
DELETE FROM user_roles WHERE user_id IN (
  '590676fc-f946-4e11-a5b8-c715d2c7adf0',
  'a01f8433-52a4-4cdd-9176-93061ef54985',
  '2a18e505-93c7-4d81-8da8-dfa30a856266',
  'd7d304eb-9aab-4ba8-a497-b8228eb72dfa',
  '6363d300-c788-40e3-aafa-76858b842d1b',
  'fc52900b-30e4-48ba-a208-e41888c903c7',
  '847f441b-e84d-46da-8e94-98e66ba71f64',
  '4b693d71-0382-443d-ac92-bda4ebe59c7e'
);

-- 2. segnalazione di test "TEST DIAGNOSI FLUSSO kck7ma" (7a18c89f...)
DELETE FROM segnalazioni WHERE user_id = 'fc52900b-30e4-48ba-a208-e41888c903c7';

-- 3. preferiti / profili / token collegati (attesi 0)
DELETE FROM preferiti WHERE user_id IN (
  '590676fc-f946-4e11-a5b8-c715d2c7adf0',
  'a01f8433-52a4-4cdd-9176-93061ef54985',
  '2a18e505-93c7-4d81-8da8-dfa30a856266',
  'd7d304eb-9aab-4ba8-a497-b8228eb72dfa',
  '6363d300-c788-40e3-aafa-76858b842d1b',
  'fc52900b-30e4-48ba-a208-e41888c903c7',
  '847f441b-e84d-46da-8e94-98e66ba71f64',
  '4b693d71-0382-443d-ac92-bda4ebe59c7e'
);
DELETE FROM cliente_profili WHERE user_id IN (
  '590676fc-f946-4e11-a5b8-c715d2c7adf0',
  'a01f8433-52a4-4cdd-9176-93061ef54985',
  '2a18e505-93c7-4d81-8da8-dfa30a856266',
  'd7d304eb-9aab-4ba8-a497-b8228eb72dfa',
  '6363d300-c788-40e3-aafa-76858b842d1b',
  'fc52900b-30e4-48ba-a208-e41888c903c7',
  '847f441b-e84d-46da-8e94-98e66ba71f64',
  '4b693d71-0382-443d-ac92-bda4ebe59c7e'
);
DELETE FROM reset_tokens WHERE user_id IN (
  '590676fc-f946-4e11-a5b8-c715d2c7adf0',
  'a01f8433-52a4-4cdd-9176-93061ef54985',
  '2a18e505-93c7-4d81-8da8-dfa30a856266',
  'd7d304eb-9aab-4ba8-a497-b8228eb72dfa',
  '6363d300-c788-40e3-aafa-76858b842d1b',
  'fc52900b-30e4-48ba-a208-e41888c903c7',
  '847f441b-e84d-46da-8e94-98e66ba71f64',
  '4b693d71-0382-443d-ac92-bda4ebe59c7e'
);

-- 4. gli utenti (attesi 8)
DELETE FROM auth.users WHERE id IN (
  '590676fc-f946-4e11-a5b8-c715d2c7adf0',
  'a01f8433-52a4-4cdd-9176-93061ef54985',
  '2a18e505-93c7-4d81-8da8-dfa30a856266',
  'd7d304eb-9aab-4ba8-a497-b8228eb72dfa',
  '6363d300-c788-40e3-aafa-76858b842d1b',
  'fc52900b-30e4-48ba-a208-e41888c903c7',
  '847f441b-e84d-46da-8e94-98e66ba71f64',
  '4b693d71-0382-443d-ac92-bda4ebe59c7e'
);

COMMIT;