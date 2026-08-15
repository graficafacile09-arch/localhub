-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — METODI DI SPEDIZIONE PER NEGOZIO (attivazione corrieri/servizi)
--
-- Obiettivo: rendere la gestione spedizioni lato venditore SIMMETRICA alla
-- gestione pagamenti (negozio_metodi_pagamento): il venditore attiva o
-- disattiva i servizi di spedizione che vuole offrire al checkout.
--
-- Principi:
--   1. Migration ESCLUSIVAMENTE additiva: nessun dato esistente toccato,
--      nessun backfill automatico (default fail-closed: nessun servizio
--      attivo = nessuna opzione selezionabile dal cliente).
--   2. RLS coerente con negozio_metodi_pagamento (migration 20260818):
--      SELECT al proprietario del negozio + admin; le scritture applicative
--      passano da service_role (nessuna policy di scrittura).
--   3. Allowlist rigorosa carrier/servizio (CHECK + validazione applicativa
--      in lib/spedizioni/catalogo.ts): mai valori arbitrari dal client.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Tabella servizi di spedizione attivi per negozio ────────────────────
--    Una riga per coppia (carrier, servizio) = un'opzione selezionabile dal
--    cliente. carrier derivato dal servizio (BRT ha 1 servizio, Poste 2).
create table if not exists public.negozio_metodi_spedizione (
  id            uuid primary key default gen_random_uuid(),
  negozio_id    uuid not null references public.negozi (id) on delete cascade,
  carrier       text not null,
  servizio      text not null,
  attivo        boolean not null default false,
  ordine_mostra smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint negozio_metodi_spedizione_negozio_carrier_servizio_unq
    unique (negozio_id, carrier, servizio),
  constraint negozio_metodi_spedizione_carrier_check
    check (carrier in ('poste_italiane', 'brt', 'locale')),
  constraint negozio_metodi_spedizione_servizio_check
    check (
      (carrier = 'poste_italiane' and servizio in ('standard', 'express'))
      or (carrier = 'brt' and servizio = 'online')
      or (carrier = 'locale' and servizio = 'locale')
    )
);

create index if not exists negozio_metodi_spedizione_negozio_id_idx
  on public.negozio_metodi_spedizione (negozio_id);

-- ── 2. RLS (coerente con negozio_metodi_pagamento) ─────────────────────────
alter table public.negozio_metodi_spedizione enable row level security;

drop policy if exists "negozio metodi spedizione merchant select" on public.negozio_metodi_spedizione;
create policy "negozio metodi spedizione merchant select"
  on public.negozio_metodi_spedizione for select
  using (public.is_merchant_for_store(negozio_id::text));

drop policy if exists "negozio metodi spedizione admin select all" on public.negozio_metodi_spedizione;
create policy "negozio metodi spedizione admin select all"
  on public.negozio_metodi_spedizione for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );

notify pgrst, 'reload schema';

commit;
