-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — MARCATORE DISPUTE (webhook charge.dispute.created/closed)
--
-- Aggiunge la colonna `payment_disputed_at` su ordini: quando Stripe apre
-- una disputa (charge.dispute.created) l'ordine viene MARCATO, senza
-- inventare un rimborso automatico né una transizione di stato (la macchina
-- a stati non ha uno stato 'disputed'). Alla chiusura della disputa
-- (charge.dispute.closed) il marcatore viene liberato.
--
-- Migration additiva e idempotente (ADD COLUMN IF NOT EXISTS):
-- nessun dato esistente viene toccato.
-- ═══════════════════════════════════════════════════════════════════════

begin;

alter table public.ordini
  add column if not exists payment_disputed_at timestamptz;

commit;
