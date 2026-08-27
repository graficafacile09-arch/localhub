-- =================================================================
-- assign_store_owners.sql
--
-- Associa manualmente ogni negozio esistente al relativo proprietario.
-- Eseguire DOPO 20260723_owner_user_id.sql.
--
-- I dati sotto riflettono lo stato attuale del database.
-- Per verificare: SELECT id, nome, owner_user_id FROM public.negozi;
-- =================================================================

-- Utente esistente:
-- graficafacile09@gmail.com (Domenico Bellini)
-- ID: 3ec07260-d0c0-4097-b1f1-8a30536fd868

-- Imposta il proprietario per ogni negozio
update public.negozi
set owner_user_id = '3ec07260-d0c0-4097-b1f1-8a30536fd868'
where id = '1f90b145-3acd-4cc1-b365-dfaac944da6d'
  and owner_user_id is null;

update public.negozi
set owner_user_id = '3ec07260-d0c0-4097-b1f1-8a30536fd868'
where id = 'e92a474a-b5bf-4ffe-bda2-d4b9bdf650fa'
  and owner_user_id is null;

update public.negozi
set owner_user_id = '3ec07260-d0c0-4097-b1f1-8a30536fd868'
where id = 'f3a82af7-dd47-482f-8a49-ea58e692238c'
  and owner_user_id is null;
