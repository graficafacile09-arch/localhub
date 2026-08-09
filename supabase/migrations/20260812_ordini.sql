-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — FASE ORDINI: sistema ordini completo
-- Tabella ordini + ordini_righe.
--
-- Scelte progettuali (allineate allo schema REALE verificato via API):
--   - negozi.id      è uuid  → ordini.negozio_id uuid (FK negozi)
--   - prodotti.id    è bigint → ordini_righe.prodotto_id bigint (FK prodotti)
--   - numero ordine progressivo/leggibile: sequenza dedicata
--     (LH-000001, LH-000002, ...) generata di default a ogni insert.
--   - idempotency_key UNIQUE: il client genera una chiave per ogni tentativo
--     di acquisto → un doppio click / retry NON crea mai due ordini.
--   - snapshot denormalizzati (negozio_nome, nome_prodotto, prezzo_unitario,
--     immagine_url): l'ordine resta integro anche se negozio/prodotto
--     cambiano in seguito.
--   - RLS: nessuna insert pubblica (la creazione avviene solo via API con
--     service role, mai esposto al client); select consentita a cliente
--     proprietario, merchant del negozio e admin (per i futuri pannelli).
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- Sequenza per il numero ordine progressivo (LH-000001, ...)
create sequence if not exists public.ordini_numero_seq;

-- ── 1. Tabella ordini ────────────────────────────────────────────────────────
create table if not exists public.ordini (
  id              uuid primary key default gen_random_uuid(),
  numero          text not null default ('LH-' || lpad(nextval('public.ordini_numero_seq')::text, 6, '0')),
  -- Chiave di idempotenza del client (anti doppio invio)
  idempotency_key text not null,
  -- Stato dell'ordine (allineato al tipo StatoOrdine di lib/cliente/types.ts)
  stato           text not null default 'in_preparazione'
    check (stato in ('in_preparazione', 'in_consegna', 'consegnato', 'cancellato')),
  -- Modalità di consegna
  modalita        text not null check (modalita in ('ritiro', 'spedizione')),
  -- Totale in euro (prezzo * quantità + eventuale spedizione)
  totale          numeric(10, 2) not null,
  -- Negozio (uuid)
  negozio_id      uuid not null references public.negozi (id) on delete restrict,
  negozio_nome    text not null,

  -- Cliente: utente autenticato (nullable: il checkout è pubblico) + snapshot
  cliente_user_id  uuid references auth.users (id) on delete set null,
  cliente_nome     text not null,
  cliente_cognome  text not null,
  cliente_telefono text,
  cliente_email    text,

  -- Dati ritiro (solo modalita='ritiro')
  ritiro_data   text,
  ritiro_fascia text,

  -- Dati spedizione (solo modalita='spedizione')
  spedizione_indirizzo text,
  spedizione_cap       text,
  spedizione_citta     text,
  spedizione_provincia text,
  spedizione_note      text,
  metodo_spedizione    text check (metodo_spedizione in ('standard', 'express')),
  costo_spedizione     numeric(10, 2) not null default 0,
  metodo_pagamento     text check (metodo_pagamento in ('carta', 'paypal', 'bonifico')),

  -- Note libere del cliente (ritiro o spedizione)
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ordini_idempotency_key_unq unique (idempotency_key)
);

-- Indici di lettura per i futuri pannelli (cliente, merchant, admin)
create index if not exists ordini_negozio_id_idx
  on public.ordini (negozio_id, created_at desc);
create index if not exists ordini_cliente_user_id_idx
  on public.ordini (cliente_user_id, created_at desc);
create index if not exists ordini_created_at_idx
  on public.ordini (created_at desc);
create index if not exists ordini_numero_idx
  on public.ordini (numero);

-- Trigger updated_at (funzione già esistente nel progetto)
drop trigger if exists ordini_set_updated_at on public.ordini;
create trigger ordini_set_updated_at
  before update on public.ordini
  for each row execute function public.set_updated_at();

-- ── 2. Tabella ordini_righe ──────────────────────────────────────────────────
create table if not exists public.ordini_righe (
  id              uuid primary key default gen_random_uuid(),
  ordine_id       uuid not null references public.ordini (id) on delete cascade,
  -- prodotti.id è bigint (verificato sullo schema reale)
  prodotto_id     bigint not null references public.prodotti (id) on delete restrict,
  nome_prodotto   text not null,
  prezzo_unitario numeric(10, 2) not null,
  quantita        integer not null check (quantita > 0),
  immagine_url    text,
  created_at      timestamptz not null default now()
);

create index if not exists ordini_righe_ordine_id_idx
  on public.ordini_righe (ordine_id);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
-- La CREAZIONE degli ordini avviene solo via API con service role
-- (mai esposto al client): nessuna policy di insert/update/delete pubblica.
-- Le select sono consentite a: cliente proprietario, merchant del negozio,
-- admin (per i futuri pannelli ordini).
alter table public.ordini enable row level security;
alter table public.ordini_righe enable row level security;

-- Cliente: vede i propri ordini
drop policy if exists "ordini self select" on public.ordini;
create policy "ordini self select"
  on public.ordini for select
  using (cliente_user_id = auth.uid());

-- Merchant proprietario del negozio: vede gli ordini del proprio negozio
drop policy if exists "ordini merchant select" on public.ordini;
create policy "ordini merchant select"
  on public.ordini for select
  using (
    exists (
      select 1 from public.negozi n
      where n.id = ordini.negozio_id
        and n.owner_user_id = auth.uid()
    )
  );

-- Admin: vede tutti gli ordini
drop policy if exists "ordini admin select all" on public.ordini;
create policy "ordini admin select all"
  on public.ordini for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );

-- Righe: visibili insieme all'ordine (regole equivalenti via ordine)
drop policy if exists "ordini righe self select" on public.ordini_righe;
create policy "ordini righe self select"
  on public.ordini_righe for select
  using (
    exists (
      select 1 from public.ordini o
      where o.id = ordini_righe.ordine_id
        and o.cliente_user_id = auth.uid()
    )
  );

drop policy if exists "ordini righe merchant select" on public.ordini_righe;
create policy "ordini righe merchant select"
  on public.ordini_righe for select
  using (
    exists (
      select 1 from public.ordini o
      join public.negozi n on n.id = o.negozio_id
      where o.id = ordini_righe.ordine_id
        and n.owner_user_id = auth.uid()
    )
  );

drop policy if exists "ordini righe admin select all" on public.ordini_righe;
create policy "ordini righe admin select all"
  on public.ordini_righe for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );

notify pgrst, 'reload schema';

commit;
