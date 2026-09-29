alter table public.prodotti
  add column if not exists soggetto_verifica_eta boolean not null default false;

alter table public.ordini
  add column if not exists contiene_prodotti_verifica_eta boolean not null default false,
  add column if not exists dichiarazione_eta_confermata boolean not null default false,
  add column if not exists dichiarazione_eta_at timestamptz;

create or replace function public.sincronizza_verifica_eta_checkout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ordine_id is not null
     and new.checkout_payload is not null
     and coalesce((new.checkout_payload ->> 'dichiarazioneEta')::boolean, false) = true then
    update public.ordini
       set contiene_prodotti_verifica_eta = true,
           dichiarazione_eta_confermata = true,
           dichiarazione_eta_at = coalesce(
             nullif(new.checkout_payload ->> 'dichiarazioneEtaAt','')::timestamptz,
             now()
           ),
           updated_at = now()
     where id = new.ordine_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sincronizza_verifica_eta_checkout on public.pagamenti_sessioni;

create trigger trg_sincronizza_verifica_eta_checkout
after insert or update of ordine_id, checkout_payload on public.pagamenti_sessioni
for each row execute function public.sincronizza_verifica_eta_checkout();

revoke all on function public.sincronizza_verifica_eta_checkout() from public, anon, authenticated;
grant execute on function public.sincronizza_verifica_eta_checkout() to service_role;
