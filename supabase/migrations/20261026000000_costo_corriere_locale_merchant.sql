-- Costo predefinito del Corriere locale: €2,00.
-- Il venditore può modificarlo dall'Area Venditore.
alter table public.negozio_metodi_spedizione
  alter column costo_euro set default 2.00;

update public.negozio_metodi_spedizione
set costo_euro = 2.00,
    updated_at = now()
where carrier = 'locale'
  and servizio = 'locale'
  and attivo = true
  and costo_euro is null;
