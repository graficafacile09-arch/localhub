-- =================================================================
-- LocalHub — Segnalazioni: policy DELETE mancanti
-- =================================================================
-- La migration 20260810 ha creato la tabella public.segnalazioni con
-- le policy INSERT/SELECT/UPDATE ma NON la DELETE: un utente non poteva
-- eliminare le proprie segnalazioni e l'admin non poteva rimuovere
-- quelle obsolete. Questa migration completa la RLS in modo coerente
-- con le altre tabelle (preferiti, media, template_negozi).
-- =================================================================

begin;

-- Utente autenticato può eliminare le PROPRIE segnalazioni
drop policy if exists "segnalazioni delete own" on public.segnalazioni;
create policy "segnalazioni delete own"
  on public.segnalazioni for delete
  using (user_id = auth.uid());

-- Admin può eliminare qualsiasi segnalazione
drop policy if exists "segnalazioni admin delete all" on public.segnalazioni;
create policy "segnalazioni admin delete all"
  on public.segnalazioni for delete
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    )
  );

notify pgrst, 'reload schema';

commit;
