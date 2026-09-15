begin;

-- Fix `servizi` / `parole_chiave` drifted to `text` on some environments
-- (migration 2026073002 declares text[]; a drifted DB stores JSON-encoded
-- arrays or comma-separated text instead). Converts both formats to text[].
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'negozi' and column_name = 'servizi' and data_type = 'text'
  ) then
    alter table public.negozi add column servizi_new text[] default '{}';
    update public.negozi set servizi_new = case
      when servizi like '[%' then
        (select coalesce(array_agg(elem order by ord), '{}'::text[])
         from jsonb_array_elements_text(servizi::jsonb) with ordinality as t(elem, ord))
      else
        (select coalesce(array_agg(trim(x) order by ord), '{}'::text[])
         from unnest(string_to_array(servizi, ',')) with ordinality as t(x, ord))
    end;
    alter table public.negozi drop column servizi;
    alter table public.negozi rename column servizi_new to servizi;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'negozi' and column_name = 'parole_chiave' and data_type = 'text'
  ) then
    alter table public.negozi add column parole_chiave_new text[] default '{}';
    update public.negozi set parole_chiave_new = case
      when parole_chiave like '[%' then
        (select coalesce(array_agg(elem order by ord), '{}'::text[])
         from jsonb_array_elements_text(parole_chiave::jsonb) with ordinality as t(elem, ord))
      else
        (select coalesce(array_agg(trim(x) order by ord), '{}'::text[])
         from unnest(string_to_array(parole_chiave, ',')) with ordinality as t(x, ord))
    end;
    alter table public.negozi drop column parole_chiave;
    alter table public.negozi rename column parole_chiave_new to parole_chiave;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
