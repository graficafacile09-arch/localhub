-- ═══════════════════════════════════════════════════════════════════════
-- RADISCAN — M1a · ACL COMPLETE PER service_role (FASE 2Z.36)
-- ═══════════════════════════════════════════════════════════════════════
-- Migration separata, transazionale e additiva.
--
-- Perimetro:
--   - 13 tabelle M1a;
--   - 3 sequenze identity M1a;
--   - 12 funzioni helper M1a;
--   - 15 funzioni trigger M1a;
--   - 13 RPC M1a, solo verifica della conservazione dei privilegi.
--
-- Esclusione 2A:
--   nessun oggetto della migration 20261118_radiscan_core.sql viene
--   revocato, concesso, alterato o verificato qui.
--
-- Esclusione vista M1a:
--   la vista resta fuori perimetro e non viene modificata.
--
-- Obiettivo:
--   lasciare operativo esclusivamente il percorso autorizzato attraverso
--   le 13 RPC SECURITY DEFINER di proprietà postgres. Nessun accesso
--   diretto o indiretto a tabelle, colonne, sequenze, helper o trigger
--   function deve sopravvivere a questa migration.
--
-- Garanzie:
--   - nessun ALTER FUNCTION OWNER;
--   - nessuna modifica a corpo, firma, SECURITY DEFINER/INVOKER,
--     search_path o tipo di ritorno delle funzioni;
--   - nessun GRANT;
--   - nessuna modifica ai trigger esistenti;
--   - nessun intervento su ruoli o membership.
--
-- Se un controllo fallisce, l'intera transazione abortisce.
-- ═══════════════════════════════════════════════════════════════════════

begin;

set local search_path = pg_catalog, public;

-- ───────────────────────────────────────────────────────────────────────
-- 1. Tabelle M1a: nessun privilegio diretto per i ruoli applicativi
-- ───────────────────────────────────────────────────────────────────────
-- REVOKE ALL PRIVILEGES ON TABLE revoca anche i privilegi di colonna
-- corrispondenti per i ruoli nominati (PostgreSQL 17, REVOKE).
revoke all privileges on table
  public.radiscan_operatori,
  public.radiscan_motori,
  public.radiscan_denominazioni,
  public.radiscan_alias,
  public.radiscan_documenti_disciplinari,
  public.radiscan_documenti_vigenza_eventi,
  public.radiscan_documenti_estratti,
  public.radiscan_sessioni,
  public.radiscan_prove,
  public.radiscan_sessione_documenti,
  public.radiscan_esiti_verifica,
  public.radiscan_pulizie_sessioni,
  public.radiscan_registro_chiamate
  from service_role, public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────
-- 2. Sequenze identity M1a: nessun privilegio diretto
-- ───────────────────────────────────────────────────────────────────────
revoke all privileges on sequence
  public.radiscan_documenti_vigenza_eventi_id_seq,
  public.radiscan_pulizie_sessioni_id_seq,
  public.radiscan_registro_chiamate_id_seq
  from service_role, public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────
-- 3. Le 12 helper: nessun EXECUTE diretto
-- ───────────────────────────────────────────────────────────────────────
-- Le RPC continuano a usare gli helper come proprietario postgres.
-- Non viene revocato EXECUTE a postgres.
revoke all on function public.radiscan_normalizza_chiave(text)
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_chiave_valida(text)
  from service_role, public, anon, authenticated;
revoke all on function public.estratto_contiene_denominazione(text, text)
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_livello_massimo_m1a()
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_richiesta_valida(text)
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_operatore_autorizzato(uuid, text[])
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_documento_vigente(uuid)
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_documento_e_vigente(uuid)
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_motore_attivo(uuid)
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_prova_attiva(uuid)
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_sessioni_scadute(interval)
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_estratto_coerente(uuid)
  from service_role, public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────
-- 4. Le 15 trigger function: nessun EXECUTE diretto
-- ───────────────────────────────────────────────────────────────────────
-- La revoca non disattiva i trigger esistenti: il trigger manager invoca
-- la funzione nel contesto del proprietario, che conserva EXECUTE.
revoke all on function public.radiscan_operatori_normalizza()
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_motori_normalizza()
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_denominazioni_chiave()
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_alias_chiave()
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_documenti_valida()
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_documenti_transizione()
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_eventi_append_only()
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_estratti_valida()
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_sessioni_token()
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_sessioni_chiusura()
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_prove_valida()
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_prove_immutabile()
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_sessione_documenti_valida()
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_esiti_verifica_valida()
  from service_role, public, anon, authenticated;
revoke all on function public.radiscan_pulizie_valida()
  from service_role, public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────
-- 5. Assert transazionali completi
-- ───────────────────────────────────────────────────────────────────────
do $acl_completo$
declare
  v_tabella text;
  v_sequenza text;
  v_ruolo text;
  v_membro text;
  v_privilegio text;
  v_col_priv text;
  v_fn_sig text;
  v_rel oid;
  v_seq oid;
  v_fn oid;
  v_owner oid;
  v_owner_name text;
  v_acl aclitem[];
  v_effective_acl aclitem[];
  v_secdef boolean;
  v_config text[];
  v_rettype oid;
  v_retset boolean;
  v_prokind "char";
  v_col record;
  v_fn_def record;

  v_tabelle constant text[] := array[
    'radiscan_operatori',
    'radiscan_motori',
    'radiscan_denominazioni',
    'radiscan_alias',
    'radiscan_documenti_disciplinari',
    'radiscan_documenti_vigenza_eventi',
    'radiscan_documenti_estratti',
    'radiscan_sessioni',
    'radiscan_prove',
    'radiscan_sessione_documenti',
    'radiscan_esiti_verifica',
    'radiscan_pulizie_sessioni',
    'radiscan_registro_chiamate'
  ];

  v_sequenze constant text[] := array[
    'radiscan_documenti_vigenza_eventi_id_seq',
    'radiscan_pulizie_sessioni_id_seq',
    'radiscan_registro_chiamate_id_seq'
  ];

  v_helper_invoker constant text[] := array[
    'public.radiscan_normalizza_chiave(text)',
    'public.radiscan_chiave_valida(text)',
    'public.estratto_contiene_denominazione(text,text)',
    'public.radiscan_livello_massimo_m1a()',
    'public.radiscan_richiesta_valida(text)'
  ];

  v_helper_definer constant text[] := array[
    'public.radiscan_operatore_autorizzato(uuid,text[])',
    'public.radiscan_documento_vigente(uuid)',
    'public.radiscan_documento_e_vigente(uuid)',
    'public.radiscan_motore_attivo(uuid)',
    'public.radiscan_prova_attiva(uuid)',
    'public.radiscan_sessioni_scadute(interval)',
    'public.radiscan_estratto_coerente(uuid)'
  ];

  v_trigger constant text[] := array[
    'public.radiscan_operatori_normalizza()',
    'public.radiscan_motori_normalizza()',
    'public.radiscan_denominazioni_chiave()',
    'public.radiscan_alias_chiave()',
    'public.radiscan_documenti_valida()',
    'public.radiscan_documenti_transizione()',
    'public.radiscan_eventi_append_only()',
    'public.radiscan_estratti_valida()',
    'public.radiscan_sessioni_token()',
    'public.radiscan_sessioni_chiusura()',
    'public.radiscan_prove_valida()',
    'public.radiscan_prove_immutabile()',
    'public.radiscan_sessione_documenti_valida()',
    'public.radiscan_esiti_verifica_valida()',
    'public.radiscan_pulizie_valida()'
  ];

  v_privilegi_tabella constant text[] := array[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE',
    'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
  ];

  v_privilegi_colonna constant text[] := array[
    'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
  ];

  v_privilegi_sequenza constant text[] := array[
    'USAGE', 'SELECT', 'UPDATE'
  ];

  v_ruoli_app constant text[] := array['anon', 'authenticated'];
begin
  if to_regrole('service_role') is null
     or to_regrole('anon') is null
     or to_regrole('authenticated') is null
     or to_regrole('postgres') is null then
    raise exception 'ACL complete M1a: ruoli attesi assenti (service_role, anon, authenticated, postgres)';
  end if;

  if exists (
    select 1
      from pg_roles
     where rolname = 'service_role'
       and rolsuper
  ) then
    raise exception 'ACL complete M1a: service_role è superuser; la revoca non sarebbe efficace';
  end if;

  -- ── 5.1 Tabelle, colonne e ACL PUBLIC ────────────────────────────────
  foreach v_tabella in array v_tabelle loop
    v_rel := null;
    v_owner := null;
    v_owner_name := null;
    v_acl := null;

    select c.oid, c.relowner, pg_get_userbyid(c.relowner), c.relacl
      into v_rel, v_owner, v_owner_name, v_acl
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = v_tabella
       and c.relkind in ('r', 'p');

    if v_rel is null then
      raise exception 'ACL complete M1a: tabella public.% assente', v_tabella;
    end if;

    if v_owner_name <> 'postgres' then
      raise exception 'ACL complete M1a: proprietario inatteso per public.%: % (atteso postgres)',
        v_tabella, v_owner_name;
    end if;

    v_effective_acl := coalesce(v_acl, acldefault('r', v_owner));

    foreach v_privilegio in array v_privilegi_tabella loop
      if has_table_privilege('service_role', v_rel, v_privilegio) then
        raise exception 'ACL complete M1a: service_role conserva % su public.% (diretto o ereditato)',
          v_privilegio, v_tabella;
      end if;

      foreach v_ruolo in array v_ruoli_app loop
        if has_table_privilege(v_ruolo::name, v_rel, v_privilegio) then
          raise exception 'ACL complete M1a: % conserva % su public.% (diretto o ereditato)',
            v_ruolo, v_privilegio, v_tabella;
        end if;
      end loop;

      if not has_table_privilege('postgres', v_rel, v_privilegio) then
        raise exception 'ACL complete M1a: postgres ha perso % su public.%',
          v_privilegio, v_tabella;
      end if;
    end loop;

    if exists (
      select 1
        from aclexplode(v_effective_acl) x
       where x.grantee = 0
         and x.privilege_type = any (v_privilegi_tabella)
    ) then
      raise exception 'ACL complete M1a: PUBLIC conserva privilegi di tabella su public.%', v_tabella;
    end if;

    for v_col in
      select a.attname, a.attacl, a.attnum
        from pg_attribute a
       where a.attrelid = v_rel
         and a.attnum > 0
         and not a.attisdropped
       order by a.attnum
    loop
      foreach v_privilegio in array v_privilegi_colonna loop
        if has_column_privilege('service_role', v_rel, v_col.attname::text, v_privilegio) then
          raise exception 'ACL complete M1a: service_role conserva % su public.%.% (diretto o ereditato)',
            v_privilegio, v_tabella, v_col.attname;
        end if;

        foreach v_ruolo in array v_ruoli_app loop
          if has_column_privilege(v_ruolo::name, v_rel, v_col.attname::text, v_privilegio) then
            raise exception 'ACL complete M1a: % conserva % su public.%.% (diretto o ereditato)',
              v_ruolo, v_privilegio, v_tabella, v_col.attname;
          end if;
        end loop;

        if exists (
          select 1
            from aclexplode(v_effective_acl) x
           where x.grantee = 0
             and x.privilege_type = v_privilegio
        ) then
          raise exception 'ACL complete M1a: PUBLIC conserva % di tabella su public.%.%',
            v_privilegio, v_tabella, v_col.attname;
        end if;

        if v_col.attacl is not null and exists (
          select 1
            from aclexplode(v_col.attacl) x
           where x.grantee = 0
             and x.privilege_type = v_privilegio
        ) then
          raise exception 'ACL complete M1a: PUBLIC conserva ACL di colonna % su public.%.%',
            v_privilegio, v_tabella, v_col.attname;
        end if;
      end loop;

      if v_col.attacl is not null and exists (
        select 1
          from aclexplode(v_col.attacl) x
         where x.privilege_type = any (v_privilegi_colonna)
           and (
             x.grantee = 'service_role'::regrole
             or x.grantee = 'anon'::regrole
             or x.grantee = 'authenticated'::regrole
           )
      ) then
        raise exception 'ACL complete M1a: ACL di colonna residua su public.%.%',
          v_tabella, v_col.attname;
      end if;
    end loop;
  end loop;

  -- ── 5.2 Sequenze identity ─────────────────────────────────────────────
  foreach v_sequenza in array v_sequenze loop
    v_seq := null;
    v_owner := null;
    v_owner_name := null;
    v_acl := null;

    select c.oid, c.relowner, pg_get_userbyid(c.relowner), c.relacl
      into v_seq, v_owner, v_owner_name, v_acl
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = v_sequenza
       and c.relkind = 'S';

    if v_seq is null then
      raise exception 'ACL complete M1a: sequenza public.% assente', v_sequenza;
    end if;

    if v_owner_name <> 'postgres' then
      raise exception 'ACL complete M1a: proprietario inatteso per public.%: % (atteso postgres)',
        v_sequenza, v_owner_name;
    end if;

    v_effective_acl := coalesce(v_acl, acldefault('s', v_owner));

    foreach v_privilegio in array v_privilegi_sequenza loop
      if has_sequence_privilege('service_role', v_seq, v_privilegio) then
        raise exception 'ACL complete M1a: service_role conserva % su public.% (diretto o ereditato)',
          v_privilegio, v_sequenza;
      end if;

      foreach v_ruolo in array v_ruoli_app loop
        if has_sequence_privilege(v_ruolo::name, v_seq, v_privilegio) then
          raise exception 'ACL complete M1a: % conserva % su public.% (diretto o ereditato)',
            v_ruolo, v_privilegio, v_sequenza;
        end if;
      end loop;

      if not has_sequence_privilege('postgres', v_seq, v_privilegio) then
        raise exception 'ACL complete M1a: postgres ha perso % su public.%',
          v_privilegio, v_sequenza;
      end if;
    end loop;

    if exists (
      select 1
        from aclexplode(v_effective_acl) x
       where x.grantee = 0
         and x.privilege_type = any (v_privilegi_sequenza)
    ) then
      raise exception 'ACL complete M1a: PUBLIC conserva privilegi di sequenza su public.%', v_sequenza;
    end if;
  end loop;

  if to_regclass(pg_get_serial_sequence('public.radiscan_documenti_vigenza_eventi', 'id'))
       is distinct from to_regclass('public.radiscan_documenti_vigenza_eventi_id_seq') then
    raise exception 'ACL complete M1a: sequenza identity inattesa per radiscan_documenti_vigenza_eventi.id';
  end if;

  if to_regclass(pg_get_serial_sequence('public.radiscan_pulizie_sessioni', 'id'))
       is distinct from to_regclass('public.radiscan_pulizie_sessioni_id_seq') then
    raise exception 'ACL complete M1a: sequenza identity inattesa per radiscan_pulizie_sessioni.id';
  end if;

  if to_regclass(pg_get_serial_sequence('public.radiscan_registro_chiamate', 'id'))
       is distinct from to_regclass('public.radiscan_registro_chiamate_id_seq') then
    raise exception 'ACL complete M1a: sequenza identity inattesa per radiscan_registro_chiamate.id';
  end if;

  -- ── 5.3 Le 40 funzioni: metadati, ACL e tipo di ritorno ──────────────
  for v_fn_def in
    select *
      from (values
        ('public.radiscan_normalizza_chiave(text)', 'text', false, 'helper_invoker'),
        ('public.radiscan_chiave_valida(text)', 'boolean', false, 'helper_invoker'),
        ('public.estratto_contiene_denominazione(text,text)', 'boolean', false, 'helper_invoker'),
        ('public.radiscan_livello_massimo_m1a()', 'text', false, 'helper_invoker'),
        ('public.radiscan_richiesta_valida(text)', 'boolean', false, 'helper_invoker'),

        ('public.radiscan_operatore_autorizzato(uuid,text[])', 'boolean', false, 'helper_definer'),
        ('public.radiscan_documento_vigente(uuid)', 'uuid', false, 'helper_definer'),
        ('public.radiscan_documento_e_vigente(uuid)', 'boolean', false, 'helper_definer'),
        ('public.radiscan_motore_attivo(uuid)', 'boolean', false, 'helper_definer'),
        ('public.radiscan_prova_attiva(uuid)', 'boolean', false, 'helper_definer'),
        ('public.radiscan_sessioni_scadute(interval)', 'uuid', true, 'helper_definer'),
        ('public.radiscan_estratto_coerente(uuid)', 'boolean', false, 'helper_definer'),

        ('public.radiscan_operatori_normalizza()', 'trigger', false, 'trigger'),
        ('public.radiscan_motori_normalizza()', 'trigger', false, 'trigger'),
        ('public.radiscan_denominazioni_chiave()', 'trigger', false, 'trigger'),
        ('public.radiscan_alias_chiave()', 'trigger', false, 'trigger'),
        ('public.radiscan_documenti_valida()', 'trigger', false, 'trigger'),
        ('public.radiscan_documenti_transizione()', 'trigger', false, 'trigger'),
        ('public.radiscan_eventi_append_only()', 'trigger', false, 'trigger'),
        ('public.radiscan_estratti_valida()', 'trigger', false, 'trigger'),
        ('public.radiscan_sessioni_token()', 'trigger', false, 'trigger'),
        ('public.radiscan_sessioni_chiusura()', 'trigger', false, 'trigger'),
        ('public.radiscan_prove_valida()', 'trigger', false, 'trigger'),
        ('public.radiscan_prove_immutabile()', 'trigger', false, 'trigger'),
        ('public.radiscan_sessione_documenti_valida()', 'trigger', false, 'trigger'),
        ('public.radiscan_esiti_verifica_valida()', 'trigger', false, 'trigger'),
        ('public.radiscan_pulizie_valida()', 'trigger', false, 'trigger'),

        ('public.radiscan_apri_sessione(uuid,uuid,text)', 'record', true, 'rpc'),
        ('public.radiscan_chiudi_sessione(uuid,uuid,text)', 'boolean', false, 'rpc'),
        ('public.radiscan_registra_prova(uuid,uuid,text,text,jsonb,text)', 'uuid', false, 'rpc'),
        ('public.radiscan_revoca_prova(uuid,uuid,text,text)', 'boolean', false, 'rpc'),
        ('public.radiscan_associa_documento(uuid,uuid,uuid,text,text)', 'boolean', false, 'rpc'),
        ('public.radiscan_registra_documento(uuid,uuid,uuid,text,text,text,date,text,text)', 'uuid', false, 'rpc'),
        ('public.radiscan_dichiara_vigenza(uuid,uuid,date,date,text,text)', 'uuid', false, 'rpc'),
        ('public.radiscan_supera_documento(uuid,uuid,uuid,text)', 'boolean', false, 'rpc'),
        ('public.radiscan_registra_estratto(uuid,uuid,text,text)', 'uuid', false, 'rpc'),
        ('public.radiscan_normalizza_denominazione(uuid,text,text,text,text)', 'uuid', false, 'rpc'),
        ('public.radiscan_registra_alias(uuid,uuid,text,text)', 'uuid', false, 'rpc'),
        ('public.radiscan_valuta_sessione(uuid,uuid,text)', 'record', true, 'rpc'),
        ('public.radiscan_pulisci_sessioni(uuid,interval,text)', 'record', true, 'rpc')
      ) as t(signature, rettype, retset, classe)
  loop
    v_fn := to_regprocedure(v_fn_def.signature)::oid;
    v_owner := null;
    v_owner_name := null;
    v_acl := null;
    v_secdef := null;
    v_config := null;
    v_rettype := null;

    if v_fn is null then
      raise exception 'ACL complete M1a: funzione % assente', v_fn_def.signature;
    end if;

    select p.proowner,
           pg_get_userbyid(p.proowner),
           p.proacl,
           p.prosecdef,
           p.proconfig,
           p.prorettype,
           p.proretset,
           p.prokind
      into v_owner, v_owner_name, v_acl, v_secdef, v_config, v_rettype, v_retset, v_prokind
      from pg_proc p
     where p.oid = v_fn;

    if v_prokind::text is distinct from 'f' then
      raise exception 'ACL complete M1a: % non è una funzione', v_fn_def.signature;
    end if;

    if v_retset is distinct from v_fn_def.retset then
      raise exception 'ACL complete M1a: set di ritorno inatteso per %', v_fn_def.signature;
    end if;

    if v_owner_name <> 'postgres' then
      raise exception 'ACL complete M1a: proprietario inatteso per %: % (atteso postgres)',
        v_fn_def.signature, v_owner_name;
    end if;

    if v_fn_def.classe = 'helper_invoker' then
      if v_secdef then
        raise exception 'ACL complete M1a: % è SECURITY DEFINER inatteso', v_fn_def.signature;
      end if;
    else
      if not v_secdef then
        raise exception 'ACL complete M1a: % non è SECURITY DEFINER', v_fn_def.signature;
      end if;
    end if;

    if not (coalesce(v_config, '{}'::text[]) @> array['search_path=pg_catalog, public']) then
      raise exception 'ACL complete M1a: search_path inatteso per %', v_fn_def.signature;
    end if;

    if v_rettype is distinct from to_regtype(v_fn_def.rettype) then
      raise exception 'ACL complete M1a: tipo di ritorno inatteso per %: atteso %, trovato %',
        v_fn_def.signature, v_fn_def.rettype, format_type(v_rettype, null);
    end if;

    if v_fn_def.classe = 'trigger' and not exists (
      select 1
        from pg_trigger t
       where t.tgfoid = v_fn
         and not t.tgisinternal
    ) then
      raise exception 'ACL complete M1a: trigger function % non collegata ad alcun trigger',
        v_fn_def.signature;
    end if;

    if v_acl is null then
      raise exception 'ACL complete M1a: % ha proacl NULL (EXECUTE di default a PUBLIC)',
        v_fn_def.signature;
    end if;

    v_effective_acl := coalesce(v_acl, acldefault('f', v_owner));

    if exists (
      select 1
        from aclexplode(v_effective_acl) x
       where x.grantee = 0
         and x.privilege_type = 'EXECUTE'
    ) then
      raise exception 'ACL complete M1a: PUBLIC conserva EXECUTE su %', v_fn_def.signature;
    end if;

    if v_fn_def.classe = 'rpc' then
      if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
        raise exception 'ACL complete M1a: service_role non ha EXECUTE su %', v_fn_def.signature;
      end if;
    else
      if has_function_privilege('service_role', v_fn, 'EXECUTE') then
        raise exception 'ACL complete M1a: service_role conserva EXECUTE su % (diretto o ereditato)',
          v_fn_def.signature;
      end if;
    end if;

    foreach v_ruolo in array v_ruoli_app loop
      if has_function_privilege(v_ruolo::name, v_fn, 'EXECUTE') then
        raise exception 'ACL complete M1a: % conserva EXECUTE su % (diretto o ereditato)',
          v_ruolo, v_fn_def.signature;
      end if;
    end loop;

    if not has_function_privilege('postgres', v_fn, 'EXECUTE') then
      raise exception 'ACL complete M1a: postgres ha perso EXECUTE su %', v_fn_def.signature;
    end if;
  end loop;

  -- ── 5.4 Membership di service_role ───────────────────────────────────
  -- Non vengono revocate membership. Se un ruolo ereditato concede un
  -- privilegio vietato, la migration abortisce indicando il ruolo.
  for v_membro in
    select r.rolname
      from pg_auth_members m
      join pg_roles r on r.oid = m.roleid
     where m.member = 'service_role'::regrole
  loop
    foreach v_tabella in array v_tabelle loop
      v_rel := null;
      select c.oid
        into v_rel
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = v_tabella
         and c.relkind in ('r', 'p');

      if v_rel is null then
        raise exception 'ACL complete M1a: tabella public.% assente durante il controllo membership',
          v_tabella;
      end if;

      foreach v_privilegio in array v_privilegi_tabella loop
        if has_table_privilege(v_membro::name, v_rel, v_privilegio) then
          raise exception 'ACL complete M1a: la membership % concede % su public.% a service_role',
            v_membro, v_privilegio, v_tabella;
        end if;
      end loop;

      foreach v_col_priv in array v_privilegi_colonna loop
        if has_any_column_privilege(v_membro::name, v_rel, v_col_priv) then
          raise exception 'ACL complete M1a: la membership % concede % su colonne di public.% a service_role',
            v_membro, v_col_priv, v_tabella;
        end if;
      end loop;
    end loop;

    foreach v_sequenza in array v_sequenze loop
      v_seq := null;
      select c.oid
        into v_seq
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = v_sequenza
         and c.relkind = 'S';

      if v_seq is null then
        raise exception 'ACL complete M1a: sequenza public.% assente durante il controllo membership',
          v_sequenza;
      end if;

      foreach v_privilegio in array v_privilegi_sequenza loop
        if has_sequence_privilege(v_membro::name, v_seq, v_privilegio) then
          raise exception 'ACL complete M1a: la membership % concede % su public.% a service_role',
            v_membro, v_privilegio, v_sequenza;
        end if;
      end loop;
    end loop;

    foreach v_fn_sig in array v_helper_invoker loop
      v_fn := to_regprocedure(v_fn_sig)::oid;
      if has_function_privilege(v_membro::name, v_fn, 'EXECUTE') then
        raise exception 'ACL complete M1a: la membership % concede EXECUTE su % a service_role',
          v_membro, v_fn_sig;
      end if;
    end loop;

    foreach v_fn_sig in array v_helper_definer loop
      v_fn := to_regprocedure(v_fn_sig)::oid;
      if has_function_privilege(v_membro::name, v_fn, 'EXECUTE') then
        raise exception 'ACL complete M1a: la membership % concede EXECUTE su % a service_role',
          v_membro, v_fn_sig;
      end if;
    end loop;

    foreach v_fn_sig in array v_trigger loop
      v_fn := to_regprocedure(v_fn_sig)::oid;
      if has_function_privilege(v_membro::name, v_fn, 'EXECUTE') then
        raise exception 'ACL complete M1a: la membership % concede EXECUTE su % a service_role',
          v_membro, v_fn_sig;
      end if;
    end loop;
  end loop;

  raise notice 'ACL complete M1a: 13 tabelle, 3 sequenze e 40 funzioni verificate';
end
$acl_completo$;

-- Le modifiche ACL sono visibili a PostgREST; il reload non altera lo schema.
notify pgrst, 'reload schema';

commit;
