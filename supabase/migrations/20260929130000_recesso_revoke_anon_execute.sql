-- Security hardening: the seller-only withdrawal workflow must not be callable by anonymous clients.
revoke execute on function public.gestisci_richiesta_recesso(uuid,text,text,numeric) from anon;
grant execute on function public.gestisci_richiesta_recesso(uuid,text,text,numeric) to authenticated;
