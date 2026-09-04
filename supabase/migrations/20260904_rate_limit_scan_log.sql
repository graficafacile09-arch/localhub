-- =================================================================
-- LocalHub — Rate limiting condiviso su scan_log
-- =================================================================
-- Il contatore è atomico: il lock per chiave serializza conteggio e insert,
-- evitando che istanze serverless indipendenti superino insieme la soglia.
-- I token usano un provider riservato e vengono esclusi dalle statistiche AI.
-- =================================================================

begin;

create or replace function public.consume_rate_limit(
  p_key text,
  p_per_minute integer default 0,
  p_per_hour integer default 0,
  p_reason_label text default 'richieste'
)
returns table(allowed boolean, retry_after integer, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minute_count integer;
  v_hour_count integer;
  v_minute_limit integer := greatest(coalesce(p_per_minute, 0), 0);
  v_hour_limit integer := greatest(coalesce(p_per_hour, 0), 0);
  v_label text := coalesce(nullif(trim(p_reason_label), ''), 'richieste');
begin
  if p_key is null or length(p_key) = 0 then
    return query select true, 0, null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));

  if v_minute_limit > 0 then
    select count(*)::integer
      into v_minute_count
      from public.scan_log
     where user_id = p_key
       and provider = '__rate_limit__'
       and created_at >= now() - interval '1 minute';

    if v_minute_count >= v_minute_limit then
      return query select
        false,
        60,
        format('Hai superato il limite di %s %s al minuto. Riprova tra qualche minuto.', v_minute_limit, v_label);
      return;
    end if;
  end if;

  if v_hour_limit > 0 then
    select count(*)::integer
      into v_hour_count
      from public.scan_log
     where user_id = p_key
       and provider = '__rate_limit__'
       and created_at >= now() - interval '1 hour';

    if v_hour_count >= v_hour_limit then
      return query select
        false,
        3600,
        format('Hai superato il limite di %s %s all''ora. Riprova più tardi.', v_hour_limit, v_label);
      return;
    end if;
  end if;

  insert into public.scan_log (user_id, provider, response_time_ms, cache_hit, status)
  values (p_key, '__rate_limit__', 0, false, 'success');

  return query select true, 0, null::text;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer, text) to service_role;

commit;
