-- Fix: RLS policies call public.is_admin_authorized() through the
-- authenticated role. The function must be executable by authenticated users.
-- The function is SECURITY DEFINER and only returns a boolean authorization
-- result; it does not expose protected data.
grant execute on function public.is_admin_authorized(uuid) to authenticated;
