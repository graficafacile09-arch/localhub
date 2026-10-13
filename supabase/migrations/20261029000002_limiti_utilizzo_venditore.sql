-- Limiti iniziali uguali per tutti i venditori InCittà.
-- 200 annunci totali per negozio, massimo 5 immagini per annuncio,
-- 1.000 scansioni AI al mese per account venditore.
begin;

create table if not exists public.merchant_monthly_scan_usage (
  user_id text not null,
  month_start date not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month_start)
);

create index if not exists merchant_monthly_scan_usage_month_idx
  on public.merchant_monthly_scan_usage (month_start);

alter table public.merchant_monthly_scan_usage enable row level security;
revoke all on public.merchant_monthly_scan_usage from public, anon, authenticated;
grant select, insert, update, delete on public.merchant_monthly_scan_usage to service_role;

create or replace function public.consume_merchant_monthly_scan(
  p_user_id text,
  p_limit integer default 1000
)
returns table(allowed boolean, used integer, resets_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', now() at time zone 'UTC')::date;
  v_next_month timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  v_used integer;
begin
  if p_user_id is null or length(trim(p_user_id)) = 0 then
    raise exception 'p_user_id obbligatorio';
  end if;

  if p_limit is null or p_limit < 1 then
    raise exception 'p_limit non valido';
  end if;

  -- Serializza gli incrementi dello stesso account: nessuna corsa tra istanze serverless.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id || ':' || v_month_start::text, 0));

  insert into public.merchant_monthly_scan_usage (user_id, month_start, used)
  values (p_user_id, v_month_start, 0)
  on conflict (user_id, month_start) do nothing;

  select u.used
    into v_used
    from public.merchant_monthly_scan_usage u
   where u.user_id = p_user_id
     and u.month_start = v_month_start
   for update;

  if v_used >= p_limit then
    return query select false, v_used, v_next_month;
    return;
  end if;

  update public.merchant_monthly_scan_usage u
     set used = u.used + 1,
         updated_at = now()
   where u.user_id = p_user_id
     and u.month_start = v_month_start
   returning u.used into v_used;

  return query select true, v_used, v_next_month;
end;
$$;

revoke all on function public.consume_merchant_monthly_scan(text, integer) from public, anon, authenticated;
grant execute on function public.consume_merchant_monthly_scan(text, integer) to service_role;

-- Guardia DB per impedire di superare 200 prodotti totali per negozio,
-- includendo bozze e prodotti inattivi e serializzando gli inserimenti concorrenti.
create or replace function public.enforce_merchant_product_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if new.negozio_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.negozio_id::text, 0));

  select count(*)::integer
    into v_count
    from public.prodotti p
   where p.negozio_id = new.negozio_id;

  if v_count >= 200 then
    raise exception using
      errcode = 'P0001',
      message = 'MERCHANT_PRODUCT_LIMIT_REACHED',
      detail = 'Ogni negozio può avere al massimo 200 annunci, incluse le bozze.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_merchant_product_limit() from public, anon, authenticated;
revoke all on function public.enforce_product_media_limit() from public, anon, authenticated;

drop trigger if exists trg_enforce_merchant_product_limit on public.prodotti;
create trigger trg_enforce_merchant_product_limit
before insert on public.prodotti
for each row execute function public.enforce_merchant_product_limit();

-- Guardia DB per massimo 5 immagini per annuncio, contando anche
-- l'immagine principale legacy quando non è ancora presente in product_media.
create or replace function public.enforce_product_media_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_main_url text;
  v_main_unrepresented integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.product_id::text, 1));

  select p.immagine_principale
    into v_main_url
    from public.prodotti p
   where p.id::text = new.product_id::text;

  select count(*)::integer
    into v_count
    from public.product_media m
   where m.product_id::text = new.product_id::text;

  if v_main_url is not null
     and not exists (
       select 1 from public.product_media m
        where m.product_id::text = new.product_id::text
          and m.public_url = v_main_url
     )
     and new.public_url is distinct from v_main_url then
    v_main_unrepresented := 1;
  end if;

  if v_count + v_main_unrepresented + 1 > 5 then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_IMAGE_LIMIT_REACHED',
      detail = 'Ogni annuncio può avere al massimo 5 foto, inclusa l’immagine principale.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_product_media_limit on public.product_media;
create trigger trg_enforce_product_media_limit
before insert on public.product_media
for each row execute function public.enforce_product_media_limit();

commit;
