-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — P0 PAYMENT-FIRST: PREPARAZIONE SCHEMA SESSIONI (additiva)
--
-- Obiettivo: predisporre il database al flusso payment-first (l'ordine
-- commerciale nasce SOLO dopo il pagamento riuscito) SENZA modificare il
-- comportamento attuale del checkout.
--
--  1. pagamenti_sessioni.ordine_id → NULLABLE: una sessione di pagamento
--     può esistere prima dell'ordine (intento di checkout). Le sessioni
--     esistenti (ordine_id valorizzato) restano invariate: il vincolo FK
--     `pagamenti_sessioni_ordine_id_fkey` e l'indice parziale unico
--     `pagamenti_sessioni_ordine_attiva_unq`
--     (WHERE status IN ('created','pending')) sono compatibili con NULL
--     (PostgreSQL: i NULL non collidono negli indici unici).
--  2. checkout_payload jsonb: snapshot completo del checkout (negozio,
--     righe/varianti/prezzi, cliente, spedizione, fatturazione, totale,
--     commissione) necessario a creare l'ordine DOPO il pagamento.
--  3. checkout_key text + indice parziale unico (checkout_key, negozio_id)
--     WHERE status IN ('created','pending'): chiave di idempotenza del
--     CLIENTE a livello di intento (oggi vive su ordini.idempotency_key);
--     garantisce AL MASSIMO un intento attivo per tentativo di checkout
--     (retry → riuso della sessione attiva; scaduto → l'indice si libera
--     e l'intento può ripartire con la stessa chiave). I NULL non
--     collidono (righe esistenti: nessuna collisione).
--  4. Indice parziale per lo SWEEP delle sessioni SENZA ordine:
--     (status, expires_at) WHERE ordine_id IS NULL — la coda che le fasi
--     P1/P3 useranno per scadere gli intenti abbandonati e rilasciare la
--     riserva stock.
--
-- Migration ESCLUSIVAMENTE additiva: nessuna riga esistente modificata o
-- distrutta; nessun dato ricalcolato. Nessuna modifica a RLS (le policy
-- esistenti restano valide: la lettura passa sempre da service role/RPC).
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. ordine_id nullable (intento di checkout senza ordine) ────────────
alter table public.pagamenti_sessioni
  alter column ordine_id drop not null;

-- ── 2. Payload del checkout (snapshot per creare l'ordine post-paid) ────
alter table public.pagamenti_sessioni
  add column if not exists checkout_payload jsonb;

-- ── 3. Chiave di idempotenza del cliente a livello di intento ───────────
alter table public.pagamenti_sessioni
  add column if not exists checkout_key text;

-- Al massimo UN intento ATTIVO per (chiave client, negozio): un retry con
-- la stessa chiave riusa la sessione attiva; quando la sessione scade
-- (status → expired) l'indice si libera e un nuovo tentativo con la stessa
-- chiave può creare una nuova sessione. I NULL non collidono (righe
-- esistenti).
create unique index if not exists pagamenti_sessioni_checkout_key_attiva_unq
  on public.pagamenti_sessioni (checkout_key, negozio_id)
  where status in ('created', 'pending');

-- ── 4. Indice di sweep per gli intenti senza ordine ─────────────────────
-- (status, expires_at) WHERE ordine_id IS NULL: usato dalle fasi P1/P3 per
-- scadere gli intenti abbandonati e rilasciare la riserva stock.
create index if not exists pagamenti_sessioni_sweep_no_ordine_idx
  on public.pagamenti_sessioni (status, expires_at)
  where ordine_id is null;

notify pgrst, 'reload schema';

commit;