-- Corriere locale: il costo configurato dal venditore in negozio_metodi_spedizione
-- deve essere la fonte primaria anche nelle RPC definitive di checkout.
-- costo_spedizione_locale sul prodotto resta fallback legacy.

do $$
declare def text;
begin
  select pg_get_functiondef(oid) into def
  from pg_proc
  where proname = 'checkout_intento_crea'
  limit 1;

  def := replace(
    def,
    '  v_max_locale     numeric := null;' || chr(10) ||
    '  v_locale_mancante boolean := false;',
    '  v_max_locale     numeric := null;' || chr(10) ||
    '  v_locale_mancante boolean := false;' || chr(10) ||
    '  v_costo_locale_negozio numeric := null;'
  );

  def := replace(
    def,
    '  end loop;' || chr(10) || chr(10) ||
    '  -- ── Costo spedizione CALCOLATO DAL SISTEMA (mai dal client) ───────────',
    '  end loop;' || chr(10) || chr(10) ||
    '  if v_carrier = ''locale'' then' || chr(10) ||
    '    select nms.costo_euro into v_costo_locale_negozio' || chr(10) ||
    '    from public.negozio_metodi_spedizione nms' || chr(10) ||
    '    where nms.negozio_id = v_negozio_id' || chr(10) ||
    '      and nms.carrier = ''locale''' || chr(10) ||
    '      and nms.servizio = ''locale''' || chr(10) ||
    '      and coalesce(nms.attivo, false) = true' || chr(10) ||
    '    limit 1;' || chr(10) ||
    '    if v_costo_locale_negozio is not null and v_costo_locale_negozio >= 0 then' || chr(10) ||
    '      v_max_locale := v_costo_locale_negozio;' || chr(10) ||
    '      v_locale_mancante := false;' || chr(10) ||
    '    end if;' || chr(10) ||
    '  end if;' || chr(10) || chr(10) ||
    '  -- ── Costo spedizione CALCOLATO DAL SISTEMA (mai dal client) ───────────'
  );

  execute def;
end $$;

do $$
declare def text;
begin
  select pg_get_functiondef(oid) into def
  from pg_proc
  where proname = 'crea_ordine_carrello'
  limit 1;

  def := replace(
    def,
    '  v_max_locale     numeric := null;' || chr(10) ||
    '  v_locale_mancante boolean := false;',
    '  v_max_locale     numeric := null;' || chr(10) ||
    '  v_locale_mancante boolean := false;' || chr(10) ||
    '  v_costo_locale_negozio numeric := null;'
  );

  def := replace(
    def,
    '  end loop;' || chr(10) || chr(10) ||
    '  -- ── 7. Costo spedizione CALCOLATO DAL SISTEMA (mai dal client) ─────────',
    '  end loop;' || chr(10) || chr(10) ||
    '  if v_carrier = ''locale'' then' || chr(10) ||
    '    select nms.costo_euro into v_costo_locale_negozio' || chr(10) ||
    '    from public.negozio_metodi_spedizione nms' || chr(10) ||
    '    where nms.negozio_id = v_negozio.id' || chr(10) ||
    '      and nms.carrier = ''locale''' || chr(10) ||
    '      and nms.servizio = ''locale''' || chr(10) ||
    '      and coalesce(nms.attivo, false) = true' || chr(10) ||
    '    limit 1;' || chr(10) ||
    '    if v_costo_locale_negozio is not null and v_costo_locale_negozio >= 0 then' || chr(10) ||
    '      v_max_locale := v_costo_locale_negozio;' || chr(10) ||
    '      v_locale_mancante := false;' || chr(10) ||
    '    end if;' || chr(10) ||
    '  end if;' || chr(10) || chr(10) ||
    '  -- ── 7. Costo spedizione CALCOLATO DAL SISTEMA (mai dal client) ─────────'
  );

  execute def;
end $$;

do $$
declare def text;
begin
  select pg_get_functiondef(oid) into def
  from pg_proc
  where proname = 'crea_ordine'
  limit 1;

  def := replace(
    def,
    '  v_costo_sped     numeric := 0;' || chr(10) ||
    '  v_peso_grammi    integer;',
    '  v_costo_sped     numeric := 0;' || chr(10) ||
    '  v_peso_grammi    integer;' || chr(10) ||
    '  v_costo_locale_negozio numeric := null;'
  );

  def := replace(
    def,
    '    elsif v_carrier = ''locale'' then' || chr(10) ||
    '      if v_prodotto.costo_spedizione_locale is null or v_prodotto.costo_spedizione_locale < 0 then' || chr(10) ||
    '        return jsonb_build_object(''ok'', false, ''codice'', ''CORRIERE_LOCALE_NON_DISPONIBILE'',' || chr(10) ||
    '          ''messaggio'', ''Il corriere locale non è disponibile per questo prodotto.'');' || chr(10) ||
    '      end if;' || chr(10) ||
    '      v_costo_sped := v_prodotto.costo_spedizione_locale;' || chr(10) ||
    '      v_tariffa_vers := null;',
    '    elsif v_carrier = ''locale'' then' || chr(10) ||
    '      select nms.costo_euro into v_costo_locale_negozio' || chr(10) ||
    '      from public.negozio_metodi_spedizione nms' || chr(10) ||
    '      where nms.negozio_id = v_prodotto.negozio_id' || chr(10) ||
    '        and nms.carrier = ''locale''' || chr(10) ||
    '        and nms.servizio = ''locale''' || chr(10) ||
    '        and coalesce(nms.attivo, false) = true' || chr(10) ||
    '      limit 1;' || chr(10) ||
    '      if v_costo_locale_negozio is not null and v_costo_locale_negozio >= 0 then' || chr(10) ||
    '        v_costo_sped := v_costo_locale_negozio;' || chr(10) ||
    '      elsif v_prodotto.costo_spedizione_locale is null or v_prodotto.costo_spedizione_locale < 0 then' || chr(10) ||
    '        return jsonb_build_object(''ok'', false, ''codice'', ''CORRIERE_LOCALE_NON_DISPONIBILE'',' || chr(10) ||
    '          ''messaggio'', ''Il corriere locale non è disponibile per questo prodotto.'');' || chr(10) ||
    '      else' || chr(10) ||
    '        v_costo_sped := v_prodotto.costo_spedizione_locale;' || chr(10) ||
    '      end if;' || chr(10) ||
    '      v_tariffa_vers := null;'
  );

  execute def;
end $$;