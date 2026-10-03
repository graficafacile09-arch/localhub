-- CORRIERE LOCALE — collegamento automatico ordini -> consegne
--
-- Crea/aggiorna la consegna locale quando un ordine viene creato o marcato
-- come corriere locale. Le spedizioni nazionali (Poste/BRT/GLS) non vengono
-- coinvolte.

create or replace function public.inizializza_corriere_locale_da_ordine()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.modalita = 'spedizione'
     and new.spedizione_carrier = 'locale'
     and new.spedizione_servizio = 'locale' then
    insert into public.corrieri_locali (ordine_id)
    values (new.id)
    on conflict (ordine_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ordine_corriere_locale on public.ordini;

create trigger trg_ordine_corriere_locale
after insert or update of modalita, spedizione_carrier, spedizione_servizio
on public.ordini
for each row
execute function public.inizializza_corriere_locale_da_ordine();

insert into public.corrieri_locali (ordine_id)
select o.id
from public.ordini o
where o.modalita = 'spedizione'
  and o.spedizione_carrier = 'locale'
  and o.spedizione_servizio = 'locale'
on conflict (ordine_id) do nothing;
