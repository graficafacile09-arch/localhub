-- ═══════════════════════════════════════════════════════════════════════
-- 20260829_stock_notifications.sql
--
-- "Avvisami quando torna disponibile" — richieste persistenti dei clienti
-- per essere avvisati quando un prodotto esaurito torna in stock.
--
-- Struttura:
--   - prodotto_id  bigint  → riferisce prodotti.id (bigint, come ordini_righe);
--   - negozio_id   uuid    → denormalizzato per letture/filtri veloci e
--                            per il contatore nel dashboard venditore;
--   - user_id      uuid    → NULL per i clienti guest (email-only);
--   - email        text    → SEMPRE valorizzata (account autenticato oppure
--                            email inserita dal guest);
--   - stato        → active / notified / cancelled;
--   - notified_at  → valorizzato quando la notifica è stata inviata.
--
-- Anti-duplicati: un solo avviso ATTIVO per (prodotto_id, email). Dopo una
-- notifica (stato = notified) la riga resta storica e il cliente può
-- iscriversi di nuovo al ciclo successivo (nuova riga active).
--
-- NOTA: nessuna modifica a ordini, pagamenti, Stripe, checkout o alle tabelle
-- esistenti. Tabella nuova, additiva e idempotente.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

create table if not exists public.product_stock_notifications (
  id           uuid primary key default gen_random_uuid(),
  prodotto_id  bigint not null references public.prodotti (id) on delete cascade,
  negozio_id   uuid not null references public.negozi (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete cascade,
  email        text not null,
  stato        text not null default 'active'
               check (stato in ('active', 'notified', 'cancelled')),
  created_at   timestamptz not null default now(),
  notified_at  timestamptz
);

-- Un solo avviso ATTIVO per prodotto + email (anti-duplicati).
create unique index if not exists product_stock_notifications_unique_active
  on public.product_stock_notifications (prodotto_id, email)
  where stato = 'active';

-- Lettura degli interessati attivi di un prodotto (invio notifiche).
create index if not exists product_stock_notifications_prodotto_stato
  on public.product_stock_notifications (prodotto_id, stato);

-- Contatore interessati per negozio (dashboard venditore).
create index if not exists product_stock_notifications_negozio_stato
  on public.product_stock_notifications (negozio_id, stato);

COMMIT;

notify pgrst, 'reload schema';
