-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — FATTURAZIONE ORDINI: indirizzo di fatturazione opzionale
--
-- Aggiunge all'ordine i campi dell'indirizzo di fatturazione (solo modalità
-- spedizione). Comportamento:
--   - `fatturazione_diversa = false` (default) → la fatturazione usa i dati
--     dell'indirizzo di spedizione (i campi fatturazione_* restano NULL);
--   - `fatturazione_diversa = true`  → l'utente ha indicato un indirizzo
--     diverso e i campi fatturazione_* sono valorizzati (obbligatori).
--
-- Idempotente e additiva: nessuna modifica a ordini/ordini_righe esistenti,
-- nessun vincolo nuovo che possa rompere gli ordini già salvati. I valori
-- vengono scritti dal server (service role) DOPO la creazione atomica
-- dell'ordine (le RPC crea_ordine/crea_ordine_carrello restano invariate).
-- ═══════════════════════════════════════════════════════════════════════

begin;

alter table public.ordini
  add column if not exists fatturazione_diversa boolean not null default false;

alter table public.ordini
  add column if not exists fatturazione_nome text;

alter table public.ordini
  add column if not exists fatturazione_cognome text;

alter table public.ordini
  add column if not exists fatturazione_indirizzo text;

alter table public.ordini
  add column if not exists fatturazione_numero_civico text;

alter table public.ordini
  add column if not exists fatturazione_cap text;

alter table public.ordini
  add column if not exists fatturazione_comune text;

alter table public.ordini
  add column if not exists fatturazione_provincia text;

alter table public.ordini
  add column if not exists fatturazione_nazione text;

notify pgrst, 'reload schema';

commit;
