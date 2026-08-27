-- =================================================================
-- LocalHub — Admin Activity Log (Registro Attività Amministratore)
-- =================================================================
-- Registra tutte le operazioni amministrative per audit trail.
-- RLS: solo admin può leggere/scrivere.
-- =================================================================

begin;

-- 1. Tabella
create table if not exists public.admin_activity_log (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  -- Amministratore che ha eseguito l'operazione
  admin_user_id     uuid not null references auth.users (id) on delete set null,
  admin_email       text,

  -- Tipo di operazione
  operation_type    text not null,
    -- negozio_creato, negozio_modificato, negozio_cestinato, negozio_ripristinato, negozio_eliminato_definitivo
    -- prodotto_creato, prodotto_modificato, prodotto_eliminato
    -- offerta_creata, offerta_modificata, offerta_eliminata
    -- evento_creato, evento_modificato, evento_eliminato
    -- categoria_creata, categoria_modificata, categoria_eliminata
    -- impostazioni_modificate, utente_modificato, negozio_in_evidenza_modificato
    -- template_creato, template_modificato, template_eliminato

  -- Risorsa interessata
  target_type       text not null,
    -- negozio, prodotto, offerta, evento, categoria, utente, impostazioni, negozio_in_evidenza, template

  target_id         uuid,
  target_name       text,

  -- Negozio correlato (se applicabile)
  negozio_id        uuid,
  negozio_nome      text,

  -- Risultato
  result            text not null default 'success'
    check (result in ('success', 'error')),

  -- Dettaglio sintetico (JSON flessibile)
  detail            jsonb default '{}'::jsonb,

  -- IP/UA opzionali per contesto (senza dati sensibili)
  ip                text,
  user_agent        text
);

-- Indici per query comuni
create index if not exists admin_activity_log_created_at_idx
  on public.admin_activity_log (created_at desc);

create index if not exists admin_activity_log_admin_user_id_idx
  on public.admin_activity_log (admin_user_id, created_at desc);

create index if not exists admin_activity_log_operation_type_idx
  on public.admin_activity_log (operation_type);

create index if not exists admin_activity_log_target_idx
  on public.admin_activity_log (target_type, target_id);

create index if not exists admin_activity_log_negozio_id_idx
  on public.admin_activity_log (negozio_id, created_at desc);

-- 2. RLS
alter table public.admin_activity_log enable row level security;

-- Solo admin può inserire (le API usano service role, ma policy per coerenza)
drop policy if exists "admin_activity_log admin insert" on public.admin_activity_log;
create policy "admin_activity_log admin insert"
  on public.admin_activity_log for insert
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );

-- Solo admin può leggere
drop policy if exists "admin_activity_log admin select" on public.admin_activity_log;
create policy "admin_activity_log admin select"
  on public.admin_activity_log for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );

-- 3. Funzione helper per inserimento da service role (bypassa RLS)
-- Le API admin usano createAdminSupabaseClient() che ha service role,
-- quindi RLS non blocca. Ma la funzione è utile per coerenza.
create or replace function public.log_admin_activity(
  p_admin_user_id uuid,
  p_admin_email text,
  p_operation_type text,
  p_target_type text,
  p_target_id uuid default null,
  p_target_name text default null,
  p_negozio_id uuid default null,
  p_negozio_nome text default null,
  p_result text default 'success',
  p_detail jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.admin_activity_log (
    admin_user_id,
    admin_email,
    operation_type,
    target_type,
    target_id,
    target_name,
    negozio_id,
    negozio_nome,
    result,
    detail
  ) values (
    p_admin_user_id,
    p_admin_email,
    p_operation_type,
    p_target_type,
    p_target_id,
    p_target_name,
    p_negozio_id,
    p_negozio_nome,
    p_result,
    p_detail
  )
  returning id into v_id;

  return v_id;
end $$;

notify pgrst, 'reload schema';

commit;
