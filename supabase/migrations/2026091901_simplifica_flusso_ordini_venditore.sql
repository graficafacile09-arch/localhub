-- InCittà — Semplificazione workflow ordini venditore
--
-- Nuovo flusso operativo:
--   NUOVO -> IN_LAVORAZIONE -> PRONTO -> COMPLETATO
--   oppure NUOVO -> CANCELLATO per prodotto non disponibile.
--
-- Lo stato CONFERMATO resta supportato per gli ordini storici.
-- La modifica consente al pulsante unico "Accetta l'ordine e prepara la
-- spedizione" di fare una sola transizione atomica: accettazione + avvio
-- della preparazione.

begin;

create or replace function public.aggiorna_stato_ordine(
  p_ordine_id uuid,
  p_nuovo_stato text,
  p_motivo text default null,
  p_nota text default null,
  p_merchant_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordine record;
  v_riga record;
begin
  if p_ordine_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Ordine non valido.');
  end if;

  if p_nuovo_stato is null or p_nuovo_stato not in (
    'in_preparazione', 'confermato', 'in_lavorazione', 'pronto',
    'in_consegna', 'consegnato', 'cancellato'
  ) then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Stato non valido.');
  end if;

  -- Lock riga ordine: serializza le operazioni concorrenti.
  select * into v_ordine
  from public.ordini
  where id = p_ordine_id
  for update;

  if v_ordine.id is null then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  end if;

  -- Ownership server-side: venditore proprietario oppure admin.
  if p_merchant_user_id is null then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Utente non autorizzato.');
  end if;

  if not exists (
    select 1
    from public.negozi n
    where n.id = v_ordine.negozio_id
      and n.owner_user_id = p_merchant_user_id
  ) and not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p_merchant_user_id
      and ur.role = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi gestire questo ordine.');
  end if;

  -- Idempotenza: stesso stato = nessun effetto secondario.
  if v_ordine.stato = p_nuovo_stato then
    return jsonb_build_object('ok', true, 'cambiato', false, 'ordine', public.ordine_to_json(v_ordine.id));
  end if;

  -- Macchina a stati.
  -- Nuovo flusso: NUOVO -> IN_LAVORAZIONE -> PRONTO -> COMPLETATO.
  -- Compatibilità: NUOVO -> CONFERMATO resta accettata per ordini storici,
  -- mentre gli ordini nuovi usano la transizione diretta a IN_LAVORAZIONE.
  if not (
    (v_ordine.stato = 'in_preparazione' and p_nuovo_stato in ('in_lavorazione', 'confermato', 'cancellato'))
    or (v_ordine.stato = 'confermato' and p_nuovo_stato in ('in_lavorazione', 'cancellato'))
    or (v_ordine.stato = 'in_lavorazione' and p_nuovo_stato in ('pronto', 'cancellato'))
    or (v_ordine.stato = 'pronto' and p_nuovo_stato in ('consegnato', 'cancellato'))
    or (v_ordine.stato = 'in_consegna' and p_nuovo_stato in ('consegnato', 'cancellato'))
  ) then
    return jsonb_build_object('ok', false, 'codice', 'TRANSIZIONE_NON_CONSENTITA', 'messaggio', 'Transizione di stato non consentita.');
  end if;

  -- Annullamento: motivo obbligatorio.
  if p_nuovo_stato = 'cancellato' and (p_motivo is null or length(btrim(p_motivo)) = 0) then
    return jsonb_build_object('ok', false, 'codice', 'MOTIVO_OBBLIGATORIO', 'messaggio', 'Indica un motivo per l''annullamento.');
  end if;

  update public.ordini
  set stato = p_nuovo_stato,
      aggiornato_da = p_merchant_user_id,
      updated_at = now(),
      annullato_motivo = case when p_nuovo_stato = 'cancellato' then left(btrim(coalesce(p_motivo, '')), 120) else null end,
      annullato_nota = case when p_nuovo_stato = 'cancellato' then left(btrim(coalesce(p_nota, '')), 500) else null end,
      annullato_at = case when p_nuovo_stato = 'cancellato' then now() else null end,
      annullato_da = case when p_nuovo_stato = 'cancellato' then p_merchant_user_id else null end
  where id = p_ordine_id;

  -- Ripristino atomico stock solo in caso di annullamento.
  if p_nuovo_stato = 'cancellato' then
    for v_riga in
      select *
      from public.ordini_righe
      where ordine_id = p_ordine_id
      for update
    loop
      update public.prodotti
      set quantita_disponibile = quantita_disponibile + v_riga.quantita,
          updated_at = now()
      where id = v_riga.prodotto_id
        and quantita_disponibile is not null;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'cambiato', true, 'ordine', public.ordine_to_json(v_ordine.id));

exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile aggiornare l''ordine.');
end;
$$;

revoke execute on function public.aggiorna_stato_ordine(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.aggiorna_stato_ordine(uuid, text, text, text, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
