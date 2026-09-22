-- Harden public functions flagged by Supabase security advisor.
-- Keep the existing behavior unchanged while pinning name resolution.
alter function public.set_updated_at() set search_path = public;
alter function public.is_merchant_for_store(text) set search_path = public;
alter function public.set_user_roles_updated_at() set search_path = public;
alter function public.slugify(text) set search_path = public;
alter function public.set_piattaforma_settings_updated_at() set search_path = public;
alter function public.set_offerte_updated_at() set search_path = public;
alter function public.set_eventi_updated_at() set search_path = public;
alter function public.set_segnalazioni_updated_at() set search_path = public;
alter function public.set_ordine_reclami_updated_at() set search_path = public;
alter function public.prenotazioni_parse_min(text) set search_path = public;
alter function public.test_func() set search_path = public;
alter function public.test_func2() set search_path = public;
alter function public.test_migration() set search_path = public;
