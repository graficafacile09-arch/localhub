-- Recesso: rifiuto con codice controllato, chiusura solo dopo rimborso
-- provider confermato e registrazione affidabile della ricevuta durevole.

drop function if exists public.gestisci_richiesta_recesso(uuid,text,text,numeric);

create or replace function public.gestisci_richiesta_recesso(
  p_richiesta_id uuid,
  p_azione text,
  p_nota text default null,
  p_importo_rimborsato numeric default null,
  p_rimborso_operazione_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_r record;
  v_op record;
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_new text;
begin
  if v_uid is null then
    return jsonb_build_object('ok',false,'codice','UNAUTHORIZED','messaggio','Accesso non autorizzato.');
  end if;

  select rr.*, n.owner_user_id into v_r
  from public.richieste_recesso rr
  join public.negozi n on n.id=rr.negozio_id
  where rr.id=p_richiesta_id for update;

  if v_r.id is null or v_r.owner_user_id<>v_uid then
    return jsonb_build_object('ok',false,'codice','NOT_FOUND','messaggio','Pratica non trovata.');
  end if;

  if p_azione not in ('presa_in_carico','istruzioni_reso','reso_ricevuto','rimborso_avviato','rimborsata','chiusa','rifiuta') then
    return jsonb_build_object('ok',false,'codice','VALIDATION_ERROR','messaggio','Azione non valida.');
  end if;

  v_new:=case p_azione
    when 'presa_in_carico' then 'presa_in_carico'
    when 'istruzioni_reso' then 'reso_da_spedire'
    when 'reso_ricevuto' then 'reso_ricevuto'
    when 'rimborso_avviato' then 'rimborso_in_corso'
    when 'rimborsata' then 'rimborsata'
    when 'chiusa' then 'chiusa'
    when 'rifiuta' then 'rifiutata'
  end;

  if p_azione='presa_in_carico' and v_r.stato<>'richiesta' then
    return jsonb_build_object('ok',false,'codice','INVALID_TRANSITION','messaggio','La pratica non è nello stato previsto per la presa in carico.');
  end if;
  if p_azione='istruzioni_reso' and v_r.stato<>'presa_in_carico' then
    return jsonb_build_object('ok',false,'codice','INVALID_TRANSITION','messaggio','Prima devi prendere in carico la pratica.');
  end if;
  if p_azione='reso_ricevuto' and v_r.stato<>'reso_da_spedire' then
    return jsonb_build_object('ok',false,'codice','INVALID_TRANSITION','messaggio','Il reso non è ancora nello stato previsto.');
  end if;
  if p_azione='rimborso_avviato' and v_r.stato<>'reso_ricevuto' then
    return jsonb_build_object('ok',false,'codice','INVALID_TRANSITION','messaggio','Prima devi registrare la ricezione del reso.');
  end if;
  if p_azione='rimborsata' and v_r.stato<>'rimborso_in_corso' then
    return jsonb_build_object('ok',false,'codice','INVALID_TRANSITION','messaggio','Prima devi avviare il rimborso.');
  end if;
  if p_azione='chiusa' and v_r.stato<>'rimborsata' then
    return jsonb_build_object('ok',false,'codice','INVALID_TRANSITION','messaggio','La pratica può essere chiusa solo dopo il rimborso.');
  end if;
  if p_azione='rifiuta' and v_r.stato not in ('richiesta','presa_in_carico','reso_da_spedire') then
    return jsonb_build_object('ok',false,'codice','INVALID_TRANSITION','messaggio','La pratica non può più essere rifiutata in questo stato.');
  end if;

  if p_azione in ('istruzioni_reso','rifiuta') and coalesce(btrim(p_nota),'')='' then
    return jsonb_build_object('ok',false,'codice','NOTA_RICHIESTA','messaggio','Per questa azione è necessaria una nota.');
  end if;

  if p_azione='rimborsata' then
    if p_importo_rimborsato is null or p_importo_rimborsato<=0 then
      return jsonb_build_object('ok',false,'codice','IMPORTO_RIMBORSO_MANCANTE','messaggio','Indica l''importo effettivamente rimborsato.');
    end if;
    if p_importo_rimborsato>coalesce(v_r.importo_previsto,0) then
      return jsonb_build_object('ok',false,'codice','IMPORTO_RIMBORSO_NON_VALIDO','messaggio','L''importo rimborsato non può superare l''importo previsto.');
    end if;
    if p_rimborso_operazione_id is null then
      return jsonb_build_object('ok',false,'codice','RIMBORSO_NON_VERIFICATO','messaggio','Il rimborso deve essere confermato dal sistema pagamenti prima di chiudere la pratica.');
    end if;

    select id, ordine_id, importo, stato, refund_id into v_op
    from public.pagamenti_rimborso_operazioni
    where id=p_rimborso_operazione_id for update;

    if v_op.id is null
       or v_op.ordine_id<>v_r.ordine_id
       or v_op.stato<>'succeeded'
       or v_op.refund_id is null
       or round(v_op.importo,2)<>round(p_importo_rimborsato,2) then
      return jsonb_build_object('ok',false,'codice','RIMBORSO_NON_VERIFICATO','messaggio','Il rimborso indicato non risulta confermato dal sistema pagamenti.');
    end if;
  end if;

  update public.richieste_recesso set
    stato=v_new,
    presa_in_carico_at=case when p_azione='presa_in_carico' then v_now else presa_in_carico_at end,
    istruzioni_reso_at=case when p_azione='istruzioni_reso' then v_now else istruzioni_reso_at end,
    reso_ricevuto_at=case when p_azione='reso_ricevuto' then v_now else reso_ricevuto_at end,
    rimborso_avviato_at=case when p_azione='rimborso_avviato' then v_now else rimborso_avviato_at end,
    rimborsata_at=case when p_azione='rimborsata' then v_now else rimborsata_at end,
    chiusa_at=case when p_azione='chiusa' then v_now else chiusa_at end,
    importo_rimborsato=case when p_azione='rimborsata' then round(p_importo_rimborsato,2) else importo_rimborsato end,
    rimborso_operazione_id=case when p_azione='rimborsata' then p_rimborso_operazione_id else rimborso_operazione_id end,
    rifiuto_codice=case when p_azione='rifiuta' then 'altro_documentato' else rifiuto_codice end,
    rifiuto_nota=case when p_azione='rifiuta' then nullif(btrim(p_nota),'') else rifiuto_nota end,
    updated_at=v_now
  where id=p_richiesta_id;

  insert into public.richieste_recesso_eventi
    (richiesta_id,tipo,autore_user_id,stato_precedente,stato_nuovo,messaggio,metadata)
  values
    (p_richiesta_id,'stato',v_uid,v_r.stato,v_new,
     coalesce(nullif(btrim(p_nota),''),'Aggiornamento della pratica da parte del venditore.'),
     jsonb_build_object('azione',p_azione,'importoRimborsato',p_importo_rimborsato,'rimborsoOperazioneId',p_rimborso_operazione_id));

  return jsonb_build_object('ok',true,'id',p_richiesta_id,'stato',v_new,
    'importoRimborsato',case when p_azione='rimborsata' then round(p_importo_rimborsato,2) else v_r.importo_rimborsato end);
exception when others then
  return jsonb_build_object('ok',false,'codice','SAVE_FAILED','messaggio','Impossibile aggiornare la pratica.');
end;
$function$;
