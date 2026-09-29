create or replace function public.negozio_metodi_inizializza(p_negozio_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_commerciale boolean := false;
  v_pagamenti integer := 0;
  v_spedizioni integer := 0;
  v_tipo text;
  v_moduli jsonb;
begin
  select data->>'tipo_attivita', moduli_attivi into v_tipo, v_moduli
  from public.negozi where id = p_negozio_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'negozio_non_trovato', 'pagamenti', 0, 'spedizioni', 0);
  end if;
  v_commerciale := v_tipo in ('ecommerce','alimentari')
    or (jsonb_typeof(v_moduli) = 'array' and v_moduli ? 'prodotti');
  if not v_commerciale then
    return jsonb_build_object('ok', true, 'commerciale', false, 'pagamenti', 0, 'spedizioni', 0);
  end if;
  insert into public.negozio_metodi_pagamento (negozio_id, metodo, ordine_mostra, attivo)
  values
    (p_negozio_id, 'carta', 0, true),
    (p_negozio_id, 'klarna', 1, true),
    (p_negozio_id, 'paypal', 2, false),
    (p_negozio_id, 'sepa_debit', 3, false),
    (p_negozio_id, 'bonifico_istantaneo', 4, false),
    (p_negozio_id, 'bonifico_diretto_venditore', 5, false)
  on conflict (negozio_id, metodo) do nothing;
  get diagnostics v_pagamenti = row_count;
  insert into public.negozio_metodi_spedizione
    (negozio_id, carrier, servizio, attivo, ordine_mostra, spedizione_gratuita, costo_euro)
  values
    (p_negozio_id, 'poste_italiane', 'standard', true, 0, false, null),
    (p_negozio_id, 'brt', 'online', true, 1, false, null),
    (p_negozio_id, 'gls', 'standard', true, 2, false, null),
    (p_negozio_id, 'poste_italiane', 'express', true, 3, false, null),
    (p_negozio_id, 'locale', 'locale', true, 4, false, null)
  on conflict (negozio_id, carrier, servizio) do nothing;
  get diagnostics v_spedizioni = row_count;
  return jsonb_build_object('ok', true, 'commerciale', true, 'pagamenti', v_pagamenti, 'spedizioni', v_spedizioni);
end;
$$;
comment on function public.negozio_metodi_inizializza(uuid) is 'Inizializza in modo idempotente il catalogo metodi pagamento e spedizione per negozi commerciali.';
revoke all on function public.negozio_metodi_inizializza(uuid) from public, anon, authenticated;
grant execute on function public.negozio_metodi_inizializza(uuid) to service_role;
do $$
declare r record;
begin
  for r in select id from public.negozi where deleted_at is null loop
    perform public.negozio_metodi_inizializza(r.id);
  end loop;
end;
$$;