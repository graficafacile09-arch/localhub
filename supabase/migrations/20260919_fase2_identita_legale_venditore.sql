-- Fase 2: identità legale venditore + snapshot ordine.
-- Applicata sul progetto remoto prima del commit per mantenere schema e repo allineati.

alter table public.negozi
  add column if not exists denominazione_legale text,
  add column if not exists forma_giuridica text,
  add column if not exists partita_iva text,
  add column if not exists codice_fiscale text,
  add column if not exists pec text,
  add column if not exists sede_legale text,
  add column if not exists legal_identity_verified_at timestamptz;

alter table public.ordini
  add column if not exists venditore_denominazione_legale text,
  add column if not exists venditore_partita_iva text,
  add column if not exists venditore_codice_fiscale text,
  add column if not exists venditore_email text,
  add column if not exists venditore_pec text,
  add column if not exists venditore_sede_legale text;

-- Le funzioni di creazione ordine devono fotografare i dati del venditore al momento dell'ordine.
-- L'email usata per il contatto legale è quella già presente in public.negozi.email.
do $$ declare v text; begin
select pg_get_functiondef(p.oid) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crea_ordine' and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';
v:=replace(v,'venditore_denominazione_legale, venditore_partita_iva, venditore_codice_fiscale, venditore_pec, venditore_sede_legale,','venditore_denominazione_legale, venditore_partita_iva, venditore_codice_fiscale, venditore_email, venditore_pec, venditore_sede_legale,');
v:=replace(v,'nullif(v_negozio.codice_fiscale, ''''), nullif(v_negozio.pec, ''''), nullif(v_negozio.sede_legale, ''''),','nullif(v_negozio.codice_fiscale, ''''), nullif(v_negozio.email, ''''), nullif(v_negozio.pec, ''''), nullif(v_negozio.sede_legale, ''''),'); execute v; end $$;

do $$ declare v text; begin
select pg_get_functiondef(p.oid) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crea_ordine_carrello' and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';
v:=replace(v,'venditore_denominazione_legale, venditore_partita_iva, venditore_codice_fiscale, venditore_pec, venditore_sede_legale,','venditore_denominazione_legale, venditore_partita_iva, venditore_codice_fiscale, venditore_email, venditore_pec, venditore_sede_legale,');
v:=replace(v,'nullif(v_negozio.codice_fiscale, ''''), nullif(v_negozio.pec, ''''), nullif(v_negozio.sede_legale, ''''),','nullif(v_negozio.codice_fiscale, ''''), nullif(v_negozio.email, ''''), nullif(v_negozio.pec, ''''), nullif(v_negozio.sede_legale, ''''),'); execute v; end $$;

do $$ declare v text; begin
select pg_get_functiondef(p.oid) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='checkout_intento_conferma' and pg_get_function_identity_arguments(p.oid)='p_sessione_id uuid, p_payment_id text, p_transaction_id text, p_importo numeric, p_valuta text';
v:=replace(v,'venditore_denominazione_legale, venditore_partita_iva, venditore_codice_fiscale, venditore_pec, venditore_sede_legale,','venditore_denominazione_legale, venditore_partita_iva, venditore_codice_fiscale, venditore_email, venditore_pec, venditore_sede_legale,');
v:=replace(v,'nullif((select n.codice_fiscale from public.negozi n where n.id=v_negozio_id), ''''),\n    nullif((select n.pec from public.negozi n where n.id=v_negozio_id), ''''),','nullif((select n.codice_fiscale from public.negozi n where n.id=v_negozio_id), ''''),\n    nullif((select n.email from public.negozi n where n.id=v_negozio_id), ''''),\n    nullif((select n.pec from public.negozi n where n.id=v_negozio_id), ''''),'); execute v; end $$;