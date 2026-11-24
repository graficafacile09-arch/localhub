-- ═══════════════════════════════════════════════════════════════════════
-- RADICISCAN — QUOTE ANALISI · AGGIORNAMENTO LIMITI PER COLLAUDO
-- ═══════════════════════════════════════════════════════════════════════
-- Migration incrementale e transazionale. Non modifica la migration 2A
-- storica e non tocca tabelle, contatori, RLS, policy o altri oggetti.
--
-- Nuovi limiti:
--   anonimo      → 10/minuto, 100/giorno
--   autenticato  → 30/minuto, 300/giorno
--
-- Firma, corpo, SECURITY DEFINER, search_path, controlli fail-closed,
-- atomicità e logica dei contatori restano identici alla 20261118.
-- ═══════════════════════════════════════════════════════════════════════

begin;

set local search_path = pg_catalog, public;

create or replace function public.radiscan_consume_usage(
  p_chiave text,
  p_modalita text,
  p_etichetta text default 'analisi'
)
returns table (
  allowed boolean,
  retry_after integer,
  reason text,
  usati_oggi integer,
  limite_giorno integer,
  limite_minuto integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_chiave text := nullif(btrim(coalesce(p_chiave, '')), '');
  v_modalita text := lower(nullif(btrim(coalesce(p_modalita, '')), ''));
  v_etichetta text := coalesce(nullif(btrim(p_etichetta), ''), 'analisi');
  v_limite_minuto integer;
  v_limite_giorno integer;
  v_usati_minuto integer;
  v_usati_giorno integer;
  v_primo_minuto timestamptz;
  v_inizio_giorno timestamptz;
  v_prossima_mezzanotte timestamptz;
  v_attesa integer;
begin
  if v_chiave is null or length(v_chiave) < 16 or length(v_chiave) > 128 then
    raise exception 'Chiave di quota non valida'
      using errcode = '22023';
  end if;

  if v_modalita = 'anonimo' then
    v_limite_minuto := 10;
    v_limite_giorno := 100;
  elsif v_modalita = 'autenticato' then
    v_limite_minuto := 30;
    v_limite_giorno := 300;
  else
    raise exception 'Modalità di quota non valida'
      using errcode = '22023';
  end if;

  -- Guardia difensiva: nessun limite può essere disattivato.
  if v_limite_minuto is null
     or v_limite_giorno is null
     or v_limite_minuto <= 0
     or v_limite_giorno <= 0 then
    raise exception 'Limiti di quota non validi'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('radiscan:' || v_chiave, 0));

  v_inizio_giorno :=
    date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome';

  -- Mezzanotte locale SUCCESSIVA, calcolata in aritmetica timestamp:
  -- regge sia l'ora legale sia quella solare (giorni da 23 e 25 ore).
  v_prossima_mezzanotte :=
    date_trunc('day', (now() at time zone 'Europe/Rome') + interval '1 day')
      at time zone 'Europe/Rome';

  select count(*)::integer, min(creato_il)
    into v_usati_minuto, v_primo_minuto
    from public.radiscan_usage
   where chiave = v_chiave
     and creato_il >= now() - interval '1 minute';

  select count(*)::integer
    into v_usati_giorno
    from public.radiscan_usage
   where chiave = v_chiave
     and creato_il >= v_inizio_giorno;

  if v_usati_minuto >= v_limite_minuto then
    v_attesa := greatest(
      1,
      ceil(extract(epoch from (v_primo_minuto + interval '1 minute' - now())))::integer
    );
    return query select
      false,
      v_attesa,
      format(
        'Hai raggiunto il limite di %s %s al minuto. Riprova tra poco.',
        v_limite_minuto,
        v_etichetta
      ),
      v_usati_giorno,
      v_limite_giorno,
      v_limite_minuto;
    return;
  end if;

  if v_usati_giorno >= v_limite_giorno then
    v_attesa := greatest(
      1,
      ceil(extract(epoch from (v_prossima_mezzanotte - now())))::integer
    );
    return query select
      false,
      v_attesa,
      format(
        'Hai raggiunto il limite di %s %s al giorno. Riprova domani.',
        v_limite_giorno,
        v_etichetta
      ),
      v_usati_giorno,
      v_limite_giorno,
      v_limite_minuto;
    return;
  end if;

  insert into public.radiscan_usage (chiave) values (v_chiave);

  return query select
    true,
    0,
    null::text,
    v_usati_giorno + 1,
    v_limite_giorno,
    v_limite_minuto;
end;
$$;

-- Permessi invariati: solo service_role può eseguire la RPC.
revoke all on function public.radiscan_consume_usage(text, text, text)
  from public, anon, authenticated;
grant execute on function public.radiscan_consume_usage(text, text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
