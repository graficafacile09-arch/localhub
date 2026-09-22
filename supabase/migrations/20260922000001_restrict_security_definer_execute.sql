-- Keep public semantic search callable by the public catalog/search flow.
-- Restrict internal authorization and trigger functions from direct RPC execution.
revoke execute on function public.is_admin_authorized(uuid) from public, anon, authenticated;
revoke execute on function public.sincronizza_costo_corriere_locale() from public, anon, authenticated;

-- cerca_negozi_semantico is intentionally public: it powers public store search.
-- All three functions already use an explicit public search_path.
