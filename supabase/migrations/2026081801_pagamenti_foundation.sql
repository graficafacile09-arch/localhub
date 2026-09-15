-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — FASE 1 PAGAMENTI: FOUNDATION (multi-merchant)
--
-- Obiettivo: predisporre in modo NON DISTRUTTIVO l'architettura pagamenti
-- per-negozio, senza toccare checkout, ordini, stock, RPC esistenti o UI.
--
-- Principi:
--   1. Migration ESCLUSIVAMENTE additiva e backward-compatible:
--      CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS. Nessun dato
--      esistente viene modificato o ricalcolato.
--   2. Le colonne payment_* su ordini nascono NULL (nessun default):
--      gli ordini esistenti NON ricevono payment_status='pending'. Gli
--      stati saranno formalizzati (con CHECK) nella fase successiva.
--   3. Nessun secret reale in questa fase (colonne segnaposto vuote;
--      cifratura pgcrypto + chiave server-side in una fase successiva).
--   4. RLS coerente con il pattern già presente: un merchant accede
--      SOLO ai dati dei propri negozi (owner_user_id / is_merchant_for_store);
--      le scritture applicative future passeranno da service_role/RPC.
--   5. Nessuna API, nessun webhook, nessun provider in questa fase.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Tabella config credenziali per negozio (1 negozio × N provider) ─────
--    secret_encrypted / webhook_secret_encrypted: segnaposto (vuoti in questa
--    fase); la cifratura e l'accesso esclusivo via RPC service-role arrivano
--    nella fase dedicata alla gestione secret.
create table if not exists public.negozio_pagamenti (
  id                     uuid primary key default gen_random_uuid(),
  negozio_id             uuid not null references public.negozi (id) on delete cascade,
  provider               text not null,
  attivo                 boolean not null default false,
  test_mode              boolean not null default true,
  client_id              text,
  secret_encrypted       text,
  webhook_secret_encrypted text,
  payee_email            text,
  iban                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint negozio_pagamenti_negozio_provider_unq unique (negozio_id, provider)
);

-- ── 2. Metodi di pagamento attivi per negozio (mostrati al checkout) ───────
create table if not exists public.negozio_metodi_pagamento (
  id           uuid primary key default gen_random_uuid(),
  negozio_id   uuid not null references public.negozi (id) on delete cascade,
  metodo       text not null,
  ordine_mostra smallint not null default 0,
  attivo       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint negozio_metodi_pagamento_negozio_metodo_unq unique (negozio_id, metodo)
);

-- ── 3. Sessioni di pagamento per ordine (ogni tentativo) ───────────────────
create table if not exists public.pagamenti_sessioni (
  id               uuid primary key default gen_random_uuid(),
  ordine_id        uuid not null references public.ordini (id) on delete cascade,
  negozio_id       uuid not null references public.negozi (id) on delete cascade,
  provider         text not null,
  payment_id       text,
  status           text not null default 'created',
  redirect_url     text,
  amount           numeric(10, 2),
  currency         text not null default 'EUR',
  expires_at       timestamptz,
  idempotency_key  text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── 4. Log webhook (fonte autorevole del pagamento, idempotente) ───────────
create table if not exists public.pagamenti_eventi (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  event_id     text not null unique,
  event_type   text,
  ordine_id    uuid references public.ordini (id) on delete set null,
  negozio_id   uuid references public.negozi (id) on delete set null,
  payment_id   text,
  payload      jsonb,
  status       text not null default 'received',
  attempts     integer not null default 0,
  error        text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

-- ── 5. Colonne pagamento su ordini (NULL sugli esistenti, nessun CHECK) ────
--    Gli stati verranno formalizzati nella fase 2: qui le colonne restano
--    libere e NULL per non toccare il comportamento attuale degli ordini.
alter table public.ordini
  add column if not exists payment_status text,
  add column if not exists payment_provider text,
  add column if not exists payment_id text,
  add column if not exists payment_transaction_id text,
  add column if not exists payment_amount numeric(10, 2),
  add column if not exists payment_currency text,
  add column if not exists payment_authorized_at timestamptz,
  add column if not exists payment_paid_at timestamptz,
  add column if not exists payment_expires_at timestamptz,
  add column if not exists payment_refunded_at timestamptz,
  add column if not exists payment_refunded_amount numeric(10, 2),
  add column if not exists payment_metadata jsonb;

-- ── 6. Riserva stock sui prodotti (default 0: nessun dato ricalcolato) ─────
--    quantita_disponibile NON viene toccata.
alter table public.prodotti
  add column if not exists quantita_riservata integer not null default 0;

-- ── 7. Indici (prodotti(negozio_id) esiste già: prodotti_negozio_id_idx) ───
create index if not exists negozio_pagamenti_negozio_id_idx
  on public.negozio_pagamenti (negozio_id);
create index if not exists negozio_metodi_pagamento_negozio_id_idx
  on public.negozio_metodi_pagamento (negozio_id);
create index if not exists pagamenti_sessioni_ordine_id_idx
  on public.pagamenti_sessioni (ordine_id);
create index if not exists pagamenti_sessioni_negozio_id_idx
  on public.pagamenti_sessioni (negozio_id);
create index if not exists pagamenti_sessioni_payment_id_idx
  on public.pagamenti_sessioni (payment_id);
create index if not exists pagamenti_eventi_ordine_id_idx
  on public.pagamenti_eventi (ordine_id);
create index if not exists pagamenti_eventi_negozio_id_idx
  on public.pagamenti_eventi (negozio_id);
create index if not exists pagamenti_eventi_payment_id_idx
  on public.pagamenti_eventi (payment_id);
create index if not exists ordini_payment_status_idx
  on public.ordini (payment_status);
create index if not exists ordini_payment_provider_idx
  on public.ordini (payment_provider);

-- ── 8. RLS ──────────────────────────────────────────────────────────────────
--    Nessuna policy di scrittura: le operazioni applicative future passano
--    da service_role / RPC (pattern crea_ordine). Le policy di lettura
--    seguono il pattern ordini_eventi (20260815): cliente proprietario,
--    merchant del negozio, admin.

-- 8.1 negozio_pagamenti: SELECT al proprietario del negozio + admin.
--     Le colonne secret_encrypted/webhook_secret_encrypted non vengono
--     esposte da alcuna API in questa fase (nessuna API creata).
alter table public.negozio_pagamenti enable row level security;

drop policy if exists "negozio pagamenti merchant select" on public.negozio_pagamenti;
create policy "negozio pagamenti merchant select"
  on public.negozio_pagamenti for select
  using (public.is_merchant_for_store(negozio_id::text));

drop policy if exists "negozio pagamenti admin select all" on public.negozio_pagamenti;
create policy "negozio pagamenti admin select all"
  on public.negozio_pagamenti for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );

-- 8.2 negozio_metodi_pagamento: SELECT al proprietario + admin.
--     Il CLIENTE (anon/authenticated senza ruolo) non vede questa tabella:
--     i metodi attivi verranno esposti in fase successiva via API server
--     con un filtro esplicito (attivo = true), mai per accesso diretto.
alter table public.negozio_metodi_pagamento enable row level security;

drop policy if exists "negozio metodi merchant select" on public.negozio_metodi_pagamento;
create policy "negozio metodi merchant select"
  on public.negozio_metodi_pagamento for select
  using (public.is_merchant_for_store(negozio_id::text));

drop policy if exists "negozio metodi admin select all" on public.negozio_metodi_pagamento;
create policy "negozio metodi admin select all"
  on public.negozio_metodi_pagamento for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );

-- 8.3 pagamenti_sessioni: nessuna scrittura da anon/authenticated.
--     Lettura coerente con ordini_eventi: cliente proprietario, merchant,
--     admin.
alter table public.pagamenti_sessioni enable row level security;

drop policy if exists "pagamenti sessioni self select" on public.pagamenti_sessioni;
create policy "pagamenti sessioni self select"
  on public.pagamenti_sessioni for select
  using (
    exists (
      select 1 from public.ordini o
      where o.id = pagamenti_sessioni.ordine_id
        and o.cliente_user_id = auth.uid()
    )
  );

drop policy if exists "pagamenti sessioni merchant select" on public.pagamenti_sessioni;
create policy "pagamenti sessioni merchant select"
  on public.pagamenti_sessioni for select
  using (
    exists (
      select 1 from public.ordini o
      join public.negozi n on n.id = o.negozio_id
      where o.id = pagamenti_sessioni.ordine_id
        and n.owner_user_id = auth.uid()
    )
  );

drop policy if exists "pagamenti sessioni admin select all" on public.pagamenti_sessioni;
create policy "pagamenti sessioni admin select all"
  on public.pagamenti_sessioni for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );

-- 8.4 pagamenti_eventi: nessuna scrittura da anon/authenticated.
--     Lettura coerente con ordini_eventi.
alter table public.pagamenti_eventi enable row level security;

drop policy if exists "pagamenti eventi self select" on public.pagamenti_eventi;
create policy "pagamenti eventi self select"
  on public.pagamenti_eventi for select
  using (
    exists (
      select 1 from public.ordini o
      where o.id = pagamenti_eventi.ordine_id
        and o.cliente_user_id = auth.uid()
    )
  );

drop policy if exists "pagamenti eventi merchant select" on public.pagamenti_eventi;
create policy "pagamenti eventi merchant select"
  on public.pagamenti_eventi for select
  using (
    exists (
      select 1 from public.ordini o
      join public.negozi n on n.id = o.negozio_id
      where o.id = pagamenti_eventi.ordine_id
        and n.owner_user_id = auth.uid()
    )
  );

drop policy if exists "pagamenti eventi admin select all" on public.pagamenti_eventi;
create policy "pagamenti eventi admin select all"
  on public.pagamenti_eventi for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );

notify pgrst, 'reload schema';

commit;
