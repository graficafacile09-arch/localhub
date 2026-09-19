-- Reclami: funzioni operative aggiornate per snapshot venditore e audit.
-- Applicare dopo 20260919_reclami_venditore_audit.sql.

create or replace function public.crea_reclamo_ordine(p_ordine_id uuid,p_cliente_user_id uuid,p_tipo text default 'ordine_non_arrivato',p_messaggio text default null)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_ordine record; v_reclamo record; v_messaggio text;
begin
 if p_cliente_user_id is null then return jsonb_build_object('ok',false,'codice','FORBIDDEN','messaggio','Reclami disponibili solo per utenti autenticati.'); end if;
 if p_tipo is null or p_tipo not in ('ordine_non_arrivato') then return jsonb_build_object('ok',false,'codice','VALIDATION_ERROR','messaggio','Tipo di reclamo non valido.'); end if;
 v_messaggio:=nullif(trim(coalesce(p_messaggio,'')),'');
 if v_messaggio is not null and length(v_messaggio)>1000 then return jsonb_build_object('ok',false,'codice','VALIDATION_ERROR','messaggio','Messaggio troppo lungo (max 1000 caratteri).'); end if;
 select * into v_ordine from public.ordini where id=p_ordine_id limit 1;
 if v_ordine.id is null then return jsonb_build_object('ok',false,'codice','ORDINE_NON_TROVATO','messaggio','Ordine non trovato.'); end if;
 if v_ordine.cliente_user_id is distinct from p_cliente_user_id then return jsonb_build_object('ok',false,'codice','FORBIDDEN','messaggio','Non puoi segnalare un ordine altrui.'); end if;
 if v_ordine.stato='cancellato' then return jsonb_build_object('ok',false,'codice','RECLAMO_NON_AMMESSO','messaggio','Gli ordini annullati non possono essere segnalati.'); end if;
 select * into v_reclamo from public.ordine_reclami where ordine_id=p_ordine_id and tipo=p_tipo and stato in ('aperto','in_gestione') limit 1;
 if v_reclamo.id is not null then return jsonb_build_object('ok',true,'giaEsistente',true,'reclamo',public.reclamo_to_json(v_reclamo.id)); end if;
 insert into public.ordine_reclami (ordine_id,negozio_id,cliente_user_id,cliente_nome,cliente_email,cliente_telefono,venditore_denominazione_legale,venditore_partita_iva,venditore_email,venditore_sede_legale,prima_risposta_scadenza_at,tipo,messaggio,stato)
 values (v_ordine.id,v_ordine.negozio_id,p_cliente_user_id,trim(coalesce(v_ordine.cliente_nome,'')||' '||coalesce(v_ordine.cliente_cognome,'')),v_ordine.cliente_email,v_ordine.cliente_telefono,v_ordine.venditore_denominazione_legale,v_ordine.venditore_partita_iva,v_ordine.venditore_email,v_ordine.venditore_sede_legale,now()+interval '48 hours',p_tipo,v_messaggio,'aperto')
 returning * into v_reclamo;
 insert into public.ordine_reclami_eventi(reclamo_id,tipo,autore_user_id,messaggio,metadata)
 values(v_reclamo.id,'creato',p_cliente_user_id,v_messaggio,jsonb_build_object('ordine_id',v_ordine.id,'negozio_id',v_ordine.negozio_id,'prima_risposta_scadenza_at',v_reclamo.prima_risposta_scadenza_at));
 return jsonb_build_object('ok',true,'giaEsistente',false,'reclamo',public.reclamo_to_json(v_reclamo.id));
exception when unique_violation then
 select * into v_reclamo from public.ordine_reclami where ordine_id=p_ordine_id and tipo=p_tipo and stato in ('aperto','in_gestione') limit 1;
 if v_reclamo.id is not null then return jsonb_build_object('ok',true,'giaEsistente',true,'reclamo',public.reclamo_to_json(v_reclamo.id)); end if;
 raise;
when others then return jsonb_build_object('ok',false,'codice','SAVE_FAILED','messaggio','Impossibile salvare il reclamo.'); end;
$function$;

create or replace function public.aggiorna_stato_reclamo(p_reclamo_id uuid,p_nuovo_stato text,p_merchant_user_id uuid,p_nota text default null)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_reclamo record; v_ownership boolean; v_prev text;
begin
 if p_merchant_user_id is null then return jsonb_build_object('ok',false,'codice','FORBIDDEN','messaggio','Operazione consentita solo ai venditori autenticati.'); end if;
 if p_nuovo_stato is null or p_nuovo_stato not in ('aperto','in_gestione','risolto','chiuso') then return jsonb_build_object('ok',false,'codice','VALIDATION_ERROR','messaggio','Stato del reclamo non valido.'); end if;
 select * into v_reclamo from public.ordine_reclami where id=p_reclamo_id for update;
 if v_reclamo.id is null then return jsonb_build_object('ok',false,'codice','RECLAMO_NON_TROVATO','messaggio','Reclamo non trovato.'); end if;
 select exists(select 1 from public.negozi n where n.id=v_reclamo.negozio_id and n.deleted_at is null and (n.owner_user_id=p_merchant_user_id or public.is_admin_authorized(p_merchant_user_id))) into v_ownership;
 if not v_ownership then return jsonb_build_object('ok',false,'codice','FORBIDDEN','messaggio','Non puoi gestire reclami di altri negozi.'); end if;
 if v_reclamo.stato=p_nuovo_stato then return jsonb_build_object('ok',true,'cambiato',false,'reclamo',public.reclamo_to_json(v_reclamo.id)); end if;
 if not ((v_reclamo.stato='aperto' and p_nuovo_stato in ('in_gestione','risolto','chiuso')) or (v_reclamo.stato='in_gestione' and p_nuovo_stato in ('risolto','chiuso')) or (v_reclamo.stato='risolto' and p_nuovo_stato='chiuso')) then return jsonb_build_object('ok',false,'codice','TRANSIZIONE_NON_CONSENTITA','messaggio','Transizione di stato non consentita per questo reclamo.'); end if;
 v_prev:=v_reclamo.stato;
 update public.ordine_reclami set stato=p_nuovo_stato,gestito_at=now(),gestito_da=p_merchant_user_id,gestito_nota=coalesce(nullif(trim(coalesce(p_nota,'')),''),gestito_nota) where id=p_reclamo_id returning * into v_reclamo;
 insert into public.ordine_reclami_eventi(reclamo_id,tipo,autore_user_id,stato_precedente,stato_nuovo,messaggio,metadata)
 values(v_reclamo.id,'stato',p_merchant_user_id,v_prev,p_nuovo_stato,nullif(trim(coalesce(p_nota,'')),''),jsonb_build_object('gestito_at',v_reclamo.gestito_at));
 return jsonb_build_object('ok',true,'cambiato',true,'reclamo',public.reclamo_to_json(v_reclamo.id));
exception when others then return jsonb_build_object('ok',false,'codice','SAVE_FAILED','messaggio','Impossibile aggiornare il reclamo.'); end;
$function$;
