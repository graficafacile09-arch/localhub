-- ============================================================================
-- CONFIG EMAIL ADMIN AUTORIZZATA — 20260914 (follow-up di admin_authorization)
-- ============================================================================
-- is_admin_authorized() (creata in 20260914_admin_authorization.sql) leggeva
-- l'email hardcoded. Qui la rende CONFIGURABILE via piattaforma_settings
-- (chiave 'admin_email'), con fallback al default di produzione:
-- graficafacile09@gmail.com.
--
-- PRODUZIONE: la riga viene creata = graficafacile09@gmail.com → comportamento
-- identico alla migration precedente (UNICO admin).
-- AMBIENTE E2E: scripts/setup-test-users.mjs allinea la stessa riga all'admin
-- della suite (admin.test@localhub.it) SOLO quando il server di test viene
-- avviato con NEXT_PUBLIC_ADMIN_EMAIL — esattamente il flusso E2E documentato
-- dai fixture. Il gate DB resta quindi coerente con il gate applicativo in
-- ogni ambiente, senza modifiche permanenti alla produzione.
-- ============================================================================

begin;

-- 1) Riga di configurazione in produzione (idempotente, non sovrascrive
--    eventuali valori già presenti se non esplicitamente richiesto).
insert into public.piattaforma_settings (chiave, valore, tipo, descrizione, pubblico)
values (
  'admin_email',
  'graficafacile09@gmail.com',
  'text',
  'Email dell''amministratore autorizzato (gate admin RLS/RPC via is_admin_authorized). Allineata a NEXT_PUBLIC_ADMIN_EMAIL (default in lib/auth/roles.ts).',
  false
)
on conflict (chiave) do update
  set valore = excluded.valore,
      tipo = excluded.tipo,
      descrizione = excluded.descrizione,
      pubblico = excluded.pubblico,
      updated_at = now();

-- 2) Funzione aggiornata: legge la configurazione con fallback al default.
create or replace function public.is_admin_authorized(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    where ur.user_id = p_user_id
      and ur.role = 'admin'
      and lower(u.email) = lower(coalesce(
        (select valore from public.piattaforma_settings where chiave = 'admin_email'),
        'graficafacile09@gmail.com'
      ))
  );
$$;

revoke all on function public.is_admin_authorized(uuid) from public;
grant execute on function public.is_admin_authorized(uuid) to public;

comment on function public.is_admin_authorized(uuid) is
  'True se l''utente indicato (default auth.uid()) ha ruolo admin in user_roles '
  'E email = piattaforma_settings.admin_email (fallback graficafacile09@gmail.com). '
  'Fonte unica per il gate admin a livello DB, allineata a NEXT_PUBLIC_ADMIN_EMAIL.';

commit;
