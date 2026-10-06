-- Fix merchant product deletion: merchants may delete products belonging to their own active store.
drop policy if exists "merchant own products delete" on public.prodotti;

create policy "merchant own products delete"
on public.prodotti
for delete
using (
  exists (
    select 1
    from public.negozi n
    where n.id = prodotti.negozio_id
      and n.owner_user_id = auth.uid()
      and n.deleted_at is null
  )
);
