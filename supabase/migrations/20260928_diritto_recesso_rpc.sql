-- InCittà — DIRITTO DI RECESSO V1
-- FASE 2: RPC server-side per la trasmissione atomica della richiesta.

begin;

alter table public.richieste_recesso
  alter column decorrenza_at drop not null,
  alter column termine_recesso_at drop not null;

create or replace function public.crea_richiesta_recesso(
  p_ordine_id uuid,
  p_cliente_user_id uuid default null,
  p_guest_email text default null,
  p_guest_telefono text default null,
  p_righe jsonb default '[]'::jsonb,
  p_motivo text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordine record;
  v_riga record;
  v_prevista integer;
  v_importo numeric := 0;
  v_ora timestamptz := now();
  v_decorrenza timestamptz;
  v_termine timestamptz;
  v_richiesta_id uuid;
  v_numero text;
  v_esistente record;
  v_item jsonb;
  v_riga_id uuid;
  v_qta integer;
  v_email text;
  v_tel text;
  v_dichiarazione text;
begin
  if p_ordine_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Ordine non valido.');
  end if;

  if p_righe is null or jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) < 1 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Seleziona almeno un articolo per il recesso.');
  end if;

  if jsonb_array_length(p_righe) > 50 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Troppe righe nella richiesta.');
  end if;

  if p_motivo is not null and length(p_motivo) > 500 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Il motivo supera 500 caratteri.');
  end if;

  if p_note is not null and length(p_note) > 1500 then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'La nota supera 1500 caratteri.');
  end if;

  select * into v_ordine
  from public.ordini
  where id = p_ordine_id
  for update;

  if v_ordine.id is null then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  end if;

  if v_ordine.stato = 'cancellato' then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_AMMISSIBILE', 'messaggio', 'Questo ordine è annullato e non può essere oggetto di una nuova richiesta di recesso.');
  end if;

  if p_cliente_user_id is not null then
    if v_ordine.cliente_user_id is null or v_ordine.cliente_user_id <> p_cliente_user_id then
      return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi gestire il recesso di questo ordine.');
    end if;
  else
    v_email := lower(btrim(coalesce(p_guest_email, '')));
    v_tel := regexp_replace(coalesce(p_guest_telefono, ''), '[^0-9]', '', 'g');

    if v_email = '' or v_tel = '' then
      return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Per un ordine ospite servono email e telefono.');
    end if;

    if lower(coalesce(v_ordine.cliente_email, '')) <> v_email
       or regexp_replace(coalesce(v_ordine.cliente_telefono, ''), '[^0-9]', '', 'g') <> v_tel then
      return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'I dati del cliente non corrispondono all''ordine.');
    end if;
  end if;

  select * into v_esistente
  from public.richieste_recesso rr
  where rr.ordine_id = p_ordine_id
    and rr.stato not in ('rimborsata', 'rifiutata', 'annullata', 'chiusa')
  order by rr.created_at desc
  limit 1;

  if v_esistente.id is not null then
    return jsonb_build_object(
      'ok', true,
      'giaEsistente', true,
      'id', v_esistente.id,
      'numero', v_esistente.numero,
      'stato', v_esistente.stato,
      'decorrenzaAt', v_esistente.decorrenza_at,
      'termineRecessoAt', v_esistente.termine_recesso_at,
      'richiestaAt', v_esistente.richiesta_at,
      'ricevutaAt', v_esistente.ricevuta_at
    );
  end if;

  v_decorrenza := v_ordine.consegnata_at;
  if v_decorrenza is not null then
    v_termine := v_decorrenza + interval '14 days';
    if v_ora > v_termine then
      return jsonb_build_object(
        'ok', false,
        'codice', 'FUORI_TERMINE',
        'messaggio', 'Il termine ordinario per il recesso risulta scaduto.'
      );
    end if;
  else
    v_termine := null;
  end if;

  for v_item in select * from jsonb_array_elements(p_righe)
  loop
    begin
      v_riga_id := (v_item ->> 'ordineRigaId')::uuid;
      v_qta := (v_item ->> 'quantita')::integer;
    exception
      when others then
        return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Riga o quantità non valide.');
    end;

    if v_riga_id is null or v_qta is null or v_qta < 1 then
      return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Riga o quantità non valide.');
    end if;

    select * into v_riga
    from public.ordini_righe orr
    where orr.id = v_riga_id
      and orr.ordine_id = p_ordine_id
    for update;

    if v_riga.id is null then
      return jsonb_build_object('ok', false, 'codice', 'RIGA_NON_TROVATA', 'messaggio', 'Una riga dell''ordine non è disponibile per il recesso.');
    end if;

    if v_riga.recesso_applicabile is null then
      return jsonb_build_object(
        'ok', false,
        'codice', 'RECESSO_NON_CONFIGURATO',
        'messaggio', 'Per uno degli articoli dell''ordine non è presente una regola di recesso storica. La pratica deve essere gestita direttamente con il venditore.'
      );
    end if;

    if v_riga.recesso_applicabile = false then
      return jsonb_build_object(
        'ok', false,
        'codice', 'RECESSO_ESCLUSO',
        'messaggio', 'Uno degli articoli selezionati rientra in un''esclusione del diritto di recesso.'
      );
    end if;

    if v_qta > v_riga.quantita then
      return jsonb_build_object('ok', false, 'codice', 'QUANTITA_NON_VALIDA', 'messaggio', 'La quantità richiesta supera quella dell''ordine.');
    end if;

    select coalesce(sum(rrr.quantita_richiesta), 0)
      into v_prevista
      from public.richieste_recesso_righe rrr
      join public.richieste_recesso rrh on rrh.id = rrr.richiesta_id
     where rrh.ordine_id = p_ordine_id
       and rrr.ordine_riga_id = v_riga.id
       and rrh.stato not in ('rifiutata', 'annullata');

    if v_qta + coalesce(v_prevista, 0) > v_riga.quantita then
      return jsonb_build_object(
        'ok', false,
        'codice', 'QUANTITA_GIA_RICHIESTA',
        'messaggio', 'Una quantità selezionata è già stata inclusa in una precedente pratica di recesso.'
      );
    end if;

    v_importo := v_importo + round((v_riga.prezzo_unitario * v_qta)::numeric, 2);
  end loop;

  if v_importo <= 0 then
    return jsonb_build_object('ok', false, 'codice', 'IMPORTO_NON_VALIDO', 'messaggio', 'L''importo della richiesta non è valido.');
  end if;

  v_dichiarazione :=
    'Con la presente comunico a InCittà e al venditore indicato nell''ordine ' ||
    coalesce(v_ordine.numero, '(ordine)') ||
    ' la mia volontà di recedere dal contratto relativo ai prodotti selezionati. ' ||
    'La richiesta è trasmessa tramite la funzione online di recesso e viene registrata con data e ora dal sistema.';

  insert into public.richieste_recesso (
    ordine_id, negozio_id, cliente_user_id,
    cliente_nome, cliente_cognome, cliente_email, cliente_telefono,
    venditore_identity_id, venditore_denominazione_legale, venditore_nome_commerciale,
    venditore_partita_iva, venditore_codice_fiscale, venditore_pec, venditore_sede_legale,
    venditore_email, venditore_telefono,
    metodo_richiesta, decorrenza_tipo, decorrenza_at, termine_recesso_at,
    dichiarazione_testo, richiesta_at, ricevuta_at, stato,
    motivo_cliente, note_cliente, importo_previsto
  ) values (
    v_ordine.id, v_ordine.negozio_id, v_ordine.cliente_user_id,
    v_ordine.cliente_nome, v_ordine.cliente_cognome, v_ordine.cliente_email, v_ordine.cliente_telefono,
    v_ordine.venditore_identity_id, v_ordine.venditore_denominazione_legale, v_ordine.venditore_nome_commerciale,
    v_ordine.venditore_partita_iva, v_ordine.venditore_codice_fiscale, v_ordine.venditore_pec, v_ordine.venditore_sede_legale,
    v_ordine.venditore_email, v_ordine.venditore_telefono,
    'funzione_online', 'consegna', v_decorrenza, v_termine,
    v_dichiarazione, v_ora, v_ora, 'richiesta',
    nullif(btrim(p_motivo), ''), nullif(btrim(p_note), ''), v_importo
  )
  returning id, numero into v_richiesta_id, v_numero;

  for v_item in select * from jsonb_array_elements(p_righe)
  loop
    v_riga_id := (v_item ->> 'ordineRigaId')::uuid;
    v_qta := (v_item ->> 'quantita')::integer;

    select * into v_riga
    from public.ordini_righe orr
    where orr.id = v_riga_id
      and orr.ordine_id = p_ordine_id
    for update;

    insert into public.richieste_recesso_righe (
      richiesta_id, ordine_riga_id, prodotto_id, nome_prodotto, prezzo_unitario,
      quantita_ordine, quantita_richiesta,
      recesso_applicabile, recesso_esclusione_codice, recesso_esclusione_dettaglio
    ) values (
      v_richiesta_id, v_riga.id, v_riga.prodotto_id, v_riga.nome_prodotto, v_riga.prezzo_unitario,
      v_riga.quantita, v_qta,
      v_riga.recesso_applicabile, v_riga.recesso_esclusione_codice, v_riga.recesso_esclusione_dettaglio
    );
  end loop;

  return jsonb_build_object(
    'ok', true, 'giaEsistente', false,
    'id', v_richiesta_id, 'numero', v_numero, 'stato', 'richiesta',
    'decorrenzaAt', v_decorrenza, 'termineRecessoAt', v_termine,
    'richiestaAt', v_ora, 'ricevutaAt', v_ora,
    'importoPrevisto', v_importo,
    'ordineNumero', v_ordine.numero, 'ordineStato', v_ordine.stato,
    'negozioNome', v_ordine.negozio_nome
  );

exception
  when unique_violation then
    select * into v_esistente
      from public.richieste_recesso
     where ordine_id = p_ordine_id
       and stato not in ('rimborsata', 'rifiutata', 'annullata', 'chiusa')
     order by created_at desc
     limit 1;

    if v_esistente.id is not null then
      return jsonb_build_object(
        'ok', true, 'giaEsistente', true, 'id', v_esistente.id,
        'numero', v_esistente.numero, 'stato', v_esistente.stato,
        'decorrenzaAt', v_esistente.decorrenza_at, 'termineRecessoAt', v_esistente.termine_recesso_at,
        'richiestaAt', v_esistente.richiesta_at, 'ricevutaAt', v_esistente.ricevuta_at
      );
    end if;
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile registrare la richiesta di recesso.');
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile registrare la richiesta di recesso.');
end;
$$;

revoke execute on function public.crea_richiesta_recesso(uuid, uuid, text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.crea_richiesta_recesso(uuid, uuid, text, text, jsonb, text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
