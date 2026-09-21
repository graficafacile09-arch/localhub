begin;

-- Dati usati esclusivamente dal metodo bonifico_diretto_venditore.
-- account_name resta il nome business dell'account Stripe Connect.
alter table public.negozio_pagamenti
  add column if not exists iban text,
  add column if not exists bic_swift text,
  add column if not exists bank_account_name text,
  add column if not exists bank_name text;

alter table public.ordini
  add column if not exists bonifico_causale text;

-- Ledger persistente delle commissioni maturate sui bonifici diretti.
create table if not exists public.commissioni_da_riscuotere (
  id uuid primary key default gen_random_uuid(),
  ordine_id uuid not null references public.ordini (id) on delete restrict,
  negozio_id uuid not null references public.negozi (id) on delete restrict,
  venditore_identity_id uuid references public.identita_venditore (id) on delete set null,
  importo_ordine numeric(10,2) not null,
  percentuale_commissione numeric(7,4),
  importo_commissione numeric(10,2),
  stato text not null default 'da_riscuotere'
    check (stato in ('da_riscuotere', 'riscossa', 'stornata')),
  maturata_at timestamptz not null default now(),
  riscossa_at timestamptz,
  stornata_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commissioni_da_riscuotere_ordine_unq unique (ordine_id)
);
create index if not exists commissioni_da_riscuotere_negozio_stato_idx
  on public.commissioni_da_riscuotere (negozio_id, stato, maturata_at);

-- Il nuovo metodo deve poter essere persistito in ordini.metodo_pagamento.
-- I due ordini storici con metodo "bonifico" restano rappresentabili;
-- nuovi ordini con quel metodo non sono consentiti.
alter table public.ordini drop constraint if exists ordini_metodo_pagamento_check;
alter table public.ordini
  add constraint ordini_metodo_pagamento_check
  check (
    metodo_pagamento in ('carta', 'klarna', 'paypal', 'sepa_debit', 'bonifico_istantaneo', 'bonifico_diretto_venditore')
    or (
      metodo_pagamento = 'bonifico'
      and id in (
        '6761b514-d309-482c-ae5b-cfb8757388e8'::uuid,
        'c6472f0c-c1dd-436d-a961-5409d08fc402'::uuid
      )
    )
  );

create or replace function public.pagamenti_bonifico_diretto_salva(
  p_negozio_id uuid,
  p_attivo boolean default false,
  p_iban text default null,
  p_bic_swift text default null,
  p_bank_account_name text default null,
  p_bank_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_iban text := nullif(regexp_replace(coalesce(p_iban, ''), '\s+', '', 'g'), '');
  v_bic text := nullif(regexp_replace(upper(coalesce(p_bic_swift, '')), '\s+', '', 'g'), '');
  v_account_name text := nullif(btrim(coalesce(p_bank_account_name, '')), '');
  v_bank_name text := nullif(btrim(coalesce(p_bank_name, '')), '');
begin
  if p_negozio_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Negozio non valido.');
  end if;

  if not exists (select 1 from public.negozi where id = p_negozio_id) then
    return jsonb_build_object('ok', false, 'codice', 'NEGOZIO_NON_TROVATO', 'messaggio', 'Negozio non trovato.');
  end if;

  if v_iban is not null and v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then
    return jsonb_build_object('ok', false, 'codice', 'IBAN_NON_VALIDO', 'messaggio', 'IBAN non valido.');
  end if;

  if v_bic is not null and v_bic !~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$' then
    return jsonb_build_object('ok', false, 'codice', 'BIC_NON_VALIDO', 'messaggio', 'BIC/SWIFT non valido.');
  end if;

  if coalesce(p_attivo, false)
     and (v_iban is null or v_bic is null or v_account_name is null or v_bank_name is null) then
    return jsonb_build_object(
      'ok', false,
      'codice', 'DATI_BANCARI_INCOMPLETI',
      'messaggio', 'Per abilitare il bonifico diretto sono necessari intestatario, banca, IBAN e BIC/SWIFT.'
    );
  end if;

  insert into public.negozio_pagamenti (
    negozio_id,
    provider,
    attivo,
    test_mode,
    iban,
    bic_swift,
    bank_account_name,
    bank_name
  ) values (
    p_negozio_id,
    'bonifico_diretto_venditore',
    coalesce(p_attivo, false),
    false,
    v_iban,
    v_bic,
    v_account_name,
    v_bank_name
  )
  on conflict (negozio_id, provider) do update set
    attivo = excluded.attivo,
    test_mode = false,
    iban = excluded.iban,
    bic_swift = excluded.bic_swift,
    bank_account_name = excluded.bank_account_name,
    bank_name = excluded.bank_name,
    updated_at = now();

  return jsonb_build_object('ok', true, 'provider', 'bonifico_diretto_venditore');
exception
  when others then
    return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile salvare i dati bancari.');
end;
$$;

create or replace function public.pagamenti_bonifico_diretto_leggi(
  p_negozio_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_riga public.negozio_pagamenti%rowtype;
begin
  if p_negozio_id is null then
    return jsonb_build_object('ok', false, 'codice', 'VALIDATION_ERROR', 'messaggio', 'Negozio non valido.');
  end if;

  select * into v_riga
  from public.negozio_pagamenti
  where negozio_id = p_negozio_id
    and provider = 'bonifico_diretto_venditore'
  limit 1;

  if v_riga.id is null then
    return jsonb_build_object('ok', true, 'presente', false, 'provider', 'bonifico_diretto_venditore');
  end if;

  return jsonb_build_object(
    'ok', true,
    'presente', true,
    'provider', 'bonifico_diretto_venditore',
    'attivo', v_riga.attivo,
    'iban', v_riga.iban,
    'bic_swift', v_riga.bic_swift,
    'bank_account_name', v_riga.bank_account_name,
    'bank_name', v_riga.bank_name
  );
end;
$$;

revoke execute on function public.pagamenti_bonifico_diretto_salva(uuid, boolean, text, text, text, text) from public, anon, authenticated;
grant execute on function public.pagamenti_bonifico_diretto_salva(uuid, boolean, text, text, text, text) to service_role;
revoke execute on function public.pagamenti_bonifico_diretto_leggi(uuid) from public, anon, authenticated;
grant execute on function public.pagamenti_bonifico_diretto_leggi(uuid) to service_role;

create or replace function public.conferma_bonifico_diretto(
  p_ordine_id uuid,
  p_negozio_id uuid,
  p_merchant_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordine record;
begin
  select * into v_ordine
  from public.ordini
  where id = p_ordine_id
    and negozio_id = p_negozio_id
  for update;

  if v_ordine.id is null then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_NON_TROVATO', 'messaggio', 'Ordine non trovato.');
  end if;
  if not exists (
    select 1 from public.negozi n
    where n.id = v_ordine.negozio_id and n.owner_user_id = p_merchant_user_id
  ) and not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_merchant_user_id and ur.role = 'admin'
  ) then
    return jsonb_build_object('ok', false, 'codice', 'FORBIDDEN', 'messaggio', 'Non puoi gestire questo ordine.');
  end if;
  if v_ordine.metodo_pagamento <> 'bonifico_diretto_venditore'
     or v_ordine.payment_status <> 'pending' then
    return jsonb_build_object('ok', false, 'codice', 'TRANSIZIONE_NON_CONSENTITA', 'messaggio', 'La conferma del bonifico non è consentita per questo ordine.');
  end if;
  if v_ordine.stato = 'cancellato' then
    return jsonb_build_object('ok', false, 'codice', 'ORDINE_CANCELLATO', 'messaggio', 'L''ordine è cancellato.');
  end if;

  update public.ordini
  set payment_status = 'paid',
      payment_paid_at = now(),
      stato = case when stato = 'in_preparazione' then 'in_lavorazione' else stato end,
      aggiornato_da = p_merchant_user_id,
      updated_at = now()
  where id = p_ordine_id
    and metodo_pagamento = 'bonifico_diretto_venditore'
    and payment_status = 'pending'
    and stato <> 'cancellato';

  if not found then
    return jsonb_build_object('ok', false, 'codice', 'TRANSIZIONE_NON_CONSENTITA', 'messaggio', 'Il pagamento è già stato confermato o non è più disponibile.');
  end if;

  -- La commissione usa esclusivamente gli snapshot congelati nell'ordine.
  -- Nessuna lettura di piattaforma_config e nessun ricalcolo della percentuale.
  insert into public.commissioni_da_riscuotere (
    ordine_id,
    negozio_id,
    venditore_identity_id,
    importo_ordine,
    percentuale_commissione,
    importo_commissione,
    stato,
    maturata_at
  ) values (
    v_ordine.id,
    v_ordine.negozio_id,
    v_ordine.venditore_identity_id,
    v_ordine.totale,
    v_ordine.commissione_percentuale,
    v_ordine.commissione_importo,
    'da_riscuotere',
    now()
  )
  on conflict (ordine_id) do nothing;

  insert into public.ordini_eventi (ordine_id, evento, dettaglio, nota, autore_id)
  values (p_ordine_id, 'bonifico_diretto_confermato', 'Bonifico diretto ricevuto dal venditore', 'payment_status: pending → paid; commissione: da_riscuotere', p_merchant_user_id);

  return jsonb_build_object('ok', true, 'cambiato', true);
exception when others then
  return jsonb_build_object('ok', false, 'codice', 'SAVE_FAILED', 'messaggio', 'Impossibile confermare il pagamento.');
end;
$$;

revoke execute on function public.conferma_bonifico_diretto(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.conferma_bonifico_diretto(uuid, uuid, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
