-- ═══════════════════════════════════════════════════════════════════════
-- NOTIFICHE AMMINISTRATORE — 20260920
--
-- Inbox interna del back office (/amministratore/notifiche) per l'admin.
-- NESSUNA notifica esterna: niente servizi push, niente email, niente
-- WhatsApp/ntfy, niente Realtime. Le notifiche vengono generate
-- server-side (BEST-EFFORT, mai bloccanti) dagli eventi applicativi reali
-- (nuovo ordine confermato, nuova segnalazione, nuovo venditore, …) e
-- lette/modificate SOLO tramite le API guardate in app/api/amministratore
-- (requireApiArea("admin") come prima operazione).
--
-- - user_id NULL   → notifica rivolta a tutti gli admin (l'admin autorizzato
--                    è oggi unico; la colonna resta nullable per più
--                    amministratori futuri);
-- - letta_at / archiviata_at → stato di lettura. Nessun DELETE permanente
--                    in questa fase: l'archiviazione è una cancellazione
--                    logica;
-- - admin_activity_log NON viene usato come inbox: resta esclusivamente
--                    audit log delle operazioni;
-- - RLS: il client NON può scrivere (nessuna policy di inserimento/update);
--          può solo leggere la propria riga (user_id = auth.uid()); le
--          notifiche globali (user_id null) restano invisibili ai client e
--          vengono esposte esclusivamente dalle API server-side (service
--          role, già usato da tutto l'area amministratore).
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.admin_notifiche (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  tipo text not null check (tipo in (
    'ordine_nuovo',
    'segnalazione_nuova',
    'venditore_registrato',
    'negozio_creato',
    'prodotto_creato',
    'offerta_creata',
    'evento_creato',
    'payout_da_erogare'
  )),
  titolo text not null,
  corpo text not null,
  gravita text not null check (gravita in ('info', 'attenzione', 'urgente')),
  href text,
  letta_at timestamptz,
  archiviata_at timestamptz,
  created_at timestamptz not null default now()
);

-- Indici utili: raggruppamento utente+data, filtro non lette (parziale),
-- esclusione archiviate e ordinamento temporale.
create index if not exists idx_admin_notifiche_utente_data
  on public.admin_notifiche (user_id, created_at desc);

create index if not exists idx_admin_notifiche_non_lette
  on public.admin_notifiche (letta_at)
  where letta_at is null;

create index if not exists idx_admin_notifiche_archiviata
  on public.admin_notifiche (archiviata_at);

create index if not exists idx_admin_notifiche_created_at
  on public.admin_notifiche (created_at desc);

alter table public.admin_notifiche enable row level security;

-- Solo lettura della propria riga quando user_id è valorizzato. Nessuna
-- policy di INSERT/UPDATE/DELETE per i client: nessuna scrittura diretta
-- dal browser (tutto passa dalle API server-side con service role).
drop policy if exists "admin notifiche self select" on public.admin_notifiche;
create policy "admin notifiche self select"
  on public.admin_notifiche
  for select
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';