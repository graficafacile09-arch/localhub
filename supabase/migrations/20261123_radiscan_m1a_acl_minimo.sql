-- ═══════════════════════════════════════════════════════════════════════
-- RADICISCAN — M1a · ACL MINIME PER service_role (FASE 2Z.34)
-- ═══════════════════════════════════════════════════════════════════════
-- Migration separata, transazionale, additiva.
--
-- Perimetro tassativo:
--   - 13 tabelle M1a;
--   - 3 sequenze identity create da M1a;
--   - 13 RPC M1a, solo verifica ACL: nessuna ridefinizione.
--
-- Esclusione 2A:
--   nessun oggetto della migration 20261118_radiscan_core.sql viene
--   revocato, concesso, alterato o verificato qui. Non compaiono tabelle,
--   sequenze o funzioni della 2A, né la sua sequenza identity.
--
-- Base dell'audit statico:
--   - il backend RadiciScan usa direttamente solo oggetti 2A
--     (lib/radiscan/repository.ts e lib/radiscan/quote.ts);
--   - non esistono accessi diretti con nomi letterali alle 13 tabelle M1a
--     fuori dalle migration;
--   - tutte le operazioni M1a sono dentro funzioni SQL SECURITY DEFINER
--     di proprietà postgres (RPC, helper e trigger);
--   - le RPC inseriscono nei registri e usano le identity come proprietario
--     postgres, non come service_role.
--
-- Conseguenza:
--   service_role non riceve alcun privilegio diretto su tabelle o sequenze.
--   Conserva soltanto EXECUTE sulle 13 RPC, già concesso da M1a. Le RPC
--   continuano a funzionare perché sono SECURITY DEFINER e il loro
--   proprietario postgres possiede tabelle e sequenze.
--
-- Non vengono modificati:
--   - proprietari di tabelle, sequenze o funzioni;
--   - definizioni, firme, SECURITY DEFINER o search_path delle RPC;
--   - RLS, policy, trigger o vincoli;
--   - default privileges globali;
--   - migration M1a o 2A.
--
-- Se un controllo fallisce, l'intera transazione abortisce: nessuna revoca
-- parziale viene confermata.
-- ═══════════════════════════════════════════════════════════════════════

begin;

set local search_path = pg_catalog, public;

-- ───────────────────────────────────────────────────────────────────────
-- 1. Tabelle M1a: nessun privilegio diretto a service_role
-- ───────────────────────────────────────────────────────────────────────
-- Il REVOKE coinvolge anche PUBLIC, anon e authenticated: nessuno di questi
-- ruoli deve conservare privilegi per effetto di ACL preesistenti o default
-- privileges. Non viene concesso nulla: ogni accesso M1a passa dalle RPC.
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
-- 2. Le tre sequenze identity M1a: nessun privilegio diretto
-- ───────────────────────────────────────────────────────────────────────
-- Le RPC usano le identity come postgres. service_role non deve poter
-- chiamare nextval/currval né leggere o modificare le sequenze.
revoke all privileges on sequence
  public.radiscan_documenti_vigenza_eventi_id_seq,
  public.radiscan_pulizie_sessioni_id_seq,
  public.radiscan_registro_chiamate_id_seq
  from service_role, public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────
-- 3. Controlli transazionali
-- ───────────────────────────────────────────────────────────────────────
-- I controlli usano has_table_privilege/has_sequence_privilege/
-- has_function_privilege: includono privilegi diretti, grant a PUBLIC e
-- privilegi ereditati tramite membership. Non basta l'assenza di un grant
-- diretto: si verifica il privilegio effettivo.
do $acl_minimo$
declare
  v_tabella text;
  v_sequenza text;
  v_rpc text;
  v_privilegio text;
  v_ruolo text;
  v_rel oid;
  v_seq oid;
  v_fn oid;
  v_owner text;
  v_acl aclitem[];
  v_secdef boolean;

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

  v_rpc constant text[] := array[
    'public.radiscan_apri_sessione(uuid,uuid,text)',
    'public.radiscan_chiudi_sessione(uuid,uuid,text)',
    'public.radiscan_registra_prova(uuid,uuid,text,text,jsonb,text)',
    'public.radiscan_revoca_prova(uuid,uuid,text,text)',
    'public.radiscan_associa_documento(uuid,uuid,uuid,text,text)',
    'public.radiscan_registra_documento(uuid,uuid,uuid,text,text,text,date,text,text)',
    'public.radiscan_dichiara_vigenza(uuid,uuid,date,date,text,text)',
    'public.radiscan_supera_documento(uuid,uuid,uuid,text)',
    'public.radiscan_registra_estratto(uuid,uuid,text,text)',
    'public.radiscan_normalizza_denominazione(uuid,text,text,text,text)',
    'public.radiscan_registra_alias(uuid,uuid,text,text)',
    'public.radiscan_valuta_sessione(uuid,uuid,text)',
    'public.radiscan_pulisci_sessioni(uuid,interval,text)'
  ];

  v_privilegi_tabella constant text[] := array[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE',
    'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
  ];

  v_privilegi_sequenza constant text[] := array['USAGE', 'SELECT', 'UPDATE'];
  v_ruoli_app constant text[] := array['anon', 'authenticated'];
begin
  if to_regrole('service_role') is null
     or to_regrole('anon') is null
     or to_regrole('authenticated') is null
     or to_regrole('postgres') is null then
    raise exception 'ACL minime M1a: ruoli attesi assenti (service_role, anon, authenticated, postgres)';
  end if;

  if exists (
    select 1 from pg_roles
     where rolname = 'service_role' and rolsuper
  ) then
    raise exception 'ACL minime M1a: service_role è superuser; la revoca non sarebbe efficace';
  end if;

  -- ── 3.1 Tabelle: esistenza, proprietario, privilegi effettivi ─────────
  foreach v_tabella in array v_tabelle loop
    v_rel := null;
    v_owner := null;
    v_acl := null;

    select c.oid, pg_get_userbyid(c.relowner), c.relacl
      into v_rel, v_owner, v_acl
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = v_tabella
       and c.relkind in ('r', 'p');

    if v_rel is null then
      raise exception 'ACL minime M1a: tabella public.% assente', v_tabella;
    end if;

    if v_owner <> 'postgres' then
      raise exception 'ACL minime M1a: proprietario inatteso per public.%: % (atteso postgres)',
        v_tabella, v_owner;
    end if;

    foreach v_privilegio in array v_privilegi_tabella loop
      if has_table_privilege('service_role', v_rel, v_privilegio) then
        raise exception 'ACL minime M1a: service_role conserva % su public.%',
          v_privilegio, v_tabella;
      end if;

      foreach v_ruolo in array v_ruoli_app loop
        if has_table_privilege(v_ruolo, v_rel, v_privilegio) then
          raise exception 'ACL minime M1a: % conserva % su public.%',
            v_ruolo, v_privilegio, v_tabella;
        end if;
      end loop;

      if not has_table_privilege('postgres', v_rel, v_privilegio) then
        raise exception 'ACL minime M1a: postgres ha perso % su public.%',
          v_privilegio, v_tabella;
      end if;
    end loop;

    if v_acl is not null and exists (
      select 1
        from aclexplode(v_acl) a
       where a.grantee = 0
         and a.privilege_type = any (v_privilegi_tabella)
    ) then
      raise exception 'ACL minime M1a: PUBLIC conserva privilegi su public.%', v_tabella;
    end if;
  end loop;

  -- ── 3.2 Sequenze: esistenza, proprietario, identità, privilegi ────────
  foreach v_sequenza in array v_sequenze loop
    v_seq := null;
    v_owner := null;
    v_acl := null;

    select c.oid, pg_get_userbyid(c.relowner), c.relacl
      into v_seq, v_owner, v_acl
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = v_sequenza
       and c.relkind = 'S';

    if v_seq is null then
      raise exception 'ACL minime M1a: sequenza public.% assente', v_sequenza;
    end if;

    if v_owner <> 'postgres' then
      raise exception 'ACL minime M1a: proprietario inatteso per public.%: % (atteso postgres)',
        v_sequenza, v_owner;
    end if;

    foreach v_privilegio in array v_privilegi_sequenza loop
      if has_sequence_privilege('service_role', v_seq, v_privilegio) then
        raise exception 'ACL minime M1a: service_role conserva % su public.%',
          v_privilegio, v_sequenza;
      end if;

      foreach v_ruolo in array v_ruoli_app loop
        if has_sequence_privilege(v_ruolo, v_seq, v_privilegio) then
          raise exception 'ACL minime M1a: % conserva % su public.%',
            v_ruolo, v_privilegio, v_sequenza;
        end if;
      end loop;

      if not has_sequence_privilege('postgres', v_seq, v_privilegio) then
        raise exception 'ACL minime M1a: postgres ha perso % su public.%',
          v_privilegio, v_sequenza;
      end if;
    end loop;

    if v_acl is not null and exists (
      select 1
        from aclexplode(v_acl) a
       where a.grantee = 0
         and a.privilege_type = any (v_privilegi_sequenza)
    ) then
      raise exception 'ACL minime M1a: PUBLIC conserva privilegi su public.%', v_sequenza;
    end if;
  end loop;

  -- Le tre sequenze devono essere davvero identity delle colonne id.
  if to_regclass(pg_get_serial_sequence('public.radiscan_documenti_vigenza_eventi', 'id'))
       is distinct from to_regclass('public.radiscan_documenti_vigenza_eventi_id_seq') then
    raise exception 'ACL minime M1a: sequenza identity inattesa per radiscan_documenti_vigenza_eventi.id';
  end if;

  if to_regclass(pg_get_serial_sequence('public.radiscan_pulizie_sessioni', 'id'))
       is distinct from to_regclass('public.radiscan_pulizie_sessioni_id_seq') then
    raise exception 'ACL minime M1a: sequenza identity inattesa per radiscan_pulizie_sessioni.id';
  end if;

  if to_regclass(pg_get_serial_sequence('public.radiscan_registro_chiamate', 'id'))
       is distinct from to_regclass('public.radiscan_registro_chiamate_id_seq') then
    raise exception 'ACL minime M1a: sequenza identity inattesa per radiscan_registro_chiamate.id';
  end if;

  -- ── 3.3 RPC: proprietario, SECURITY DEFINER, EXECUTE ─────────────────
  -- Nessuna modifica alle funzioni: solo verifica dell'ACL esistente.
  foreach v_rpc in array v_rpc loop
    v_fn := to_regprocedure(v_rpc)::oid;
    v_owner := null;
    v_acl := null;
    v_secdef := null;

    if v_fn is null then
      raise exception 'ACL minime M1a: RPC % assente', v_rpc;
    end if;

    select pg_get_userbyid(p.proowner), p.proacl, p.prosecdef
      into v_owner, v_acl, v_secdef
      from pg_proc p
     where p.oid = v_fn;

    if v_owner <> 'postgres' then
      raise exception 'ACL minime M1a: proprietario inatteso per %: % (atteso postgres)',
        v_rpc, v_owner;
    end if;

    if not v_secdef then
      raise exception 'ACL minime M1a: % non è SECURITY DEFINER', v_rpc;
    end if;

    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception 'ACL minime M1a: service_role non ha EXECUTE su %', v_rpc;
    end if;

    foreach v_ruolo in array v_ruoli_app loop
      if has_function_privilege(v_ruolo, v_fn, 'EXECUTE') then
        raise exception 'ACL minime M1a: % conserva EXECUTE su %', v_ruolo, v_rpc;
      end if;
    end loop;

    if v_acl is null then
      raise exception 'ACL minime M1a: % ha proacl NULL (EXECUTE di default a PUBLIC)', v_rpc;
    end if;

    if exists (
      select 1
        from aclexplode(v_acl) a
       where a.grantee = 0
         and a.privilege_type = 'EXECUTE'
    ) then
      raise exception 'ACL minime M1a: PUBLIC conserva EXECUTE su %', v_rpc;
    end if;

    if not has_function_privilege('postgres', v_fn, 'EXECUTE') then
      raise exception 'ACL minime M1a: postgres ha perso EXECUTE su %', v_rpc;
    end if;
  end loop;

  raise notice 'ACL minime M1a: 13 tabelle, 3 sequenze e 13 RPC verificati';
end
$acl_minimo$;

-- Le modifiche ACL sono visibili a PostgREST; il reload non altera lo schema.
notify pgrst, 'reload schema';

commit;
