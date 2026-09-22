-- These tables have RLS enabled with no policies and are used through
-- server-side/service-role paths. Remove direct API-role table privileges
-- without changing service_role access or RLS behavior.
revoke all on table public.commissioni_da_riscuotere from public, anon, authenticated;
revoke all on table public.contenuti from public, anon, authenticated;
revoke all on table public.notizie from public, anon, authenticated;
revoke all on table public.notizie_fonti from public, anon, authenticated;
revoke all on table public.ordine_reclami_eventi from public, anon, authenticated;
revoke all on table public.pagamenti_rimborso_operazioni from public, anon, authenticated;
revoke all on table public.piattaforma_config from public, anon, authenticated;
revoke all on table public.reset_tokens from public, anon, authenticated;
revoke all on table public.shipping_carriers from public, anon, authenticated;
revoke all on table public.shipping_services from public, anon, authenticated;
revoke all on table public.shipping_tariff_versions from public, anon, authenticated;
revoke all on table public.shipping_tariffs from public, anon, authenticated;
revoke all on table public.template_negozi from public, anon, authenticated;
revoke all on table public.venditori_termini_accettazioni from public, anon, authenticated;
