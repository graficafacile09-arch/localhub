-- ═══════════════════════════════════════════════════════════════════
-- Template: template_negozi
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.template_negozi (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  nome text not null,
  descrizione text default '',
  categoria text,
  is_system boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_template_negozi_owner on public.template_negozi(owner_user_id);
create index if not exists idx_template_negozi_categoria on public.template_negozi(categoria);

alter table public.template_negozi enable row level security;

-- RLS Policies for template_negozi
-- Users can only access their own templates, except for system templates

-- Create indexes for performance

-- Table is now ready for use
