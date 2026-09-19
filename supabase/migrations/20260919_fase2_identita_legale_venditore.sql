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
  add column if not exists venditore_pec text,
  add column if not exists venditore_sede_legale text;

do $$
declare v text;
begin
 select pg_get_functiondef(p.oid) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='crea_ordine' and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';
 v := replace(v, E'    costo_spedizione, commissione_percentuale, commissione_importo,\r\n    metodo_pagamento, note',
                 E'    costo_spedizione, commissione_percentuale, commissione_importo,\r\n    venditore_denominazione_legale, venditore_partita_iva, venditore_codice_fiscale, venditore_pec, venditore_sede_legale,\r\n    metodo_pagamento, note');
 v := replace(v, E'    v_costo_sped, v_commissione_pct, v_commissione,\r\n    case when v_modalita = ''spedizione'' then v_metodo_pag else null end,',
                 E'    v_costo_sped, v_commissione_pct, v_commissione,\r\n    nullif(v_negozio.denominazione_legale, ''''), nullif(v_negozio.partita_iva, ''''), nullif(v_negozio.codice_fiscale, ''''), nullif(v_negozio.pec, ''''), nullif(v_negozio.sede_legale, ''''),\r\n    case when v_modalita = ''spedizione'' then v_metodo_pag else null end,');
 execute v;
end $$;

do $$
declare v text;
begin
 select pg_get_functiondef(p.oid) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='crea_ordine_carrello' and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';
 v := replace(v, E'    costo_spedizione, commissione_percentuale, commissione_importo,\r\n    metodo_pagamento, note',
                 E'    costo_spedizione, commissione_percentuale, commissione_importo,\r\n    venditore_denominazione_legale, venditore_partita_iva, venditore_codice_fiscale, venditore_pec, venditore_sede_legale,\r\n    metodo_pagamento, note');
 v := replace(v, E'    v_costo_sped, v_commissione_pct, v_commissione,\r\n    case when v_modalita = ''spedizione'' then v_metodo_pag else null end,',
                 E'    v_costo_sped, v_commissione_pct, v_commissione,\r\n    nullif(v_negozio.denominazione_legale, ''''), nullif(v_negozio.partita_iva, ''''), nullif(v_negozio.codice_fiscale, ''''), nullif(v_negozio.pec, ''''), nullif(v_negozio.sede_legale, ''''),\r\n    case when v_modalita = ''spedizione'' then v_metodo_pag else null end,');
 execute v;
end $$;

do $$
declare v text;
begin
 select pg_get_functiondef(p.oid) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='checkout_intento_conferma' and pg_get_function_identity_arguments(p.oid)='p_sessione_id uuid, p_payment_id text, p_transaction_id text, p_importo numeric, p_valuta text';
 v := replace(v, E'    costo_spedizione, commissione_percentuale, commissione_importo,\n    metodo_pagamento, note,',
                 E'    costo_spedizione, commissione_percentuale, commissione_importo,\n    venditore_denominazione_legale, venditore_partita_iva, venditore_codice_fiscale, venditore_pec, venditore_sede_legale,\n    metodo_pagamento, note,');
 v := replace(v, E'    v_costo_sped, v_commissione_pct, v_commissione,\n    v_metodo_pag,',
                 E'    v_costo_sped, v_commissione_pct, v_commissione,\n    nullif((select n.denominazione_legale from public.negozi n where n.id=v_negozio_id), ''''),\n    nullif((select n.partita_iva from public.negozi n where n.id=v_negozio_id), ''''),\n    nullif((select n.codice_fiscale from public.negozi n where n.id=v_negozio_id), ''''),\n    nullif((select n.pec from public.negozi n where n.id=v_negozio_id), ''''),\n    nullif((select n.sede_legale from public.negozi n where n.id=v_negozio_id), ''''),\n    v_metodo_pag,');
 execute v;
end $$;