-- Recesso workflow: align state/event constraints with the seller workflow RPC.
-- The RPC already uses reso_da_spedire, rimborso_in_corso and azione_venditore.
alter table public.richieste_recesso
  drop constraint if exists richieste_recesso_stato_check;

alter table public.richieste_recesso
  add constraint richieste_recesso_stato_check
  check (
    stato = any (
      array[
        'richiesta',
        'presa_in_carico',
        'istruzioni_reso',
        'reso_da_spedire',
        'reso_ricevuto',
        'rimborso_in_elaborazione',
        'rimborso_in_corso',
        'rimborsata',
        'rifiutata',
        'annullata',
        'chiusa'
      ]::text[]
    )
  );

alter table public.richieste_recesso_eventi
  drop constraint if exists richieste_recesso_eventi_tipo_check;

alter table public.richieste_recesso_eventi
  add constraint richieste_recesso_eventi_tipo_check
  check (
    tipo = any (
      array[
        'creato',
        'stato',
        'nota',
        'ricevuta',
        'istruzioni_reso',
        'reso',
        'rimborso',
        'chiusura',
        'azione_venditore'
      ]::text[]
    )
  );
