-- ═══════════════════════════════════════════════════════════════════════
-- RADICISCAN — M1a · HARDENING ACL DI service_role (FASE 2Z.33)
-- ═══════════════════════════════════════════════════════════════════════
-- Migration separata, additiva e transazionale.
--
-- Perimetro:
--   - 13 tabelle M1a;
--   - 4 sequenze identity del perimetro RadiciScan;
--   - 13 RPC M1a: solo verifica ACL, nessuna ridefinizione.
--
-- Nota sul conteggio delle sequenze:
--   M1a crea 3 sequenze identity:
--     radiscan_documenti_vigenza_eventi_id_seq
--     radiscan_pulizie_sessioni_id_seq
--     radiscan_registro_chiamate_id_seq
--   La quarta, radiscan_usage_id_seq, appartiene alla migration 2A
--   (20261118_radiscan_core.sql). Il presente file la include per coprire
--   le quattro sequenze richieste, senza modificare alcuna tabella 2A.
--
-- Scelte di minimo privilegio:
--   - SELECT e INSERT su tutte le 13 tabelle;
--   - UPDATE solo sulle 5 tabelle in cui M1a lo prevede già:
--       radiscan_operatori, radiscan_motori,
--       radiscan_documenti_disciplinari, radiscan_sessioni,
--       radiscan_prove;
--   - nessun UPDATE sulle 8 tabelle append-only o sola-lettura;
--   - USAGE e SELECT sulle 4 sequenze; nessun UPDATE.
--
-- Non vengono modificati:
--   - proprietari di tabelle, sequenze o funzioni;
--   - definizioni, firme, SECURITY DEFINER o search_path delle RPC;
--   - tabelle 2A;
--   - default privileges globali;
--   - migration M1a o 2A.
--
-- La migration è idempotente rispetto alle ACL: REVOKE e GRANT possono
-- essere rieseguiti. Se un controllo fallisce, l'intera transazione abortisce
-- e nessuna modifica ACL viene confermata.
-- ═══════════════════════════════════════════════════════════════════════

begin;

set local search_path = pg_catalog, public;

-- ───────────────────────────────────────────────────────────────────────
-- 1. Tabelle M1a: revoca completa e ripristino del minimo necessario
-- ───────────────────────────────────────────────────────────────────────
-- Il REVOKE coinvolge anche PUBLIC, anon e authenticated: non devono
-- ricevere privilegi per effetto di ACL preesistenti o default privileges.
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

grant select, insert on table
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
  to service_role;

grant update on table
  public.radiscan_operatori,
  public.radiscan_motori,
  public.radiscan_documenti_disciplinari,
  public.radiscan_sessioni,
  public.radiscan_prove
  to service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 2. Sequenze identity: USAGE e SELECT, mai UPDATE
-- ───────────────────────────────────────────────────────────────────────
revoke all privileges on sequence
  public.radiscan_documenti_vigenza_eventi_id_seq,
  public.radiscan_pulizie_sessioni_id_seq,
  public.radiscan_registro_chiamate_id_seq,
  public.radiscan_usage_id_seq
  from service_role, public, anon, authenticated;

grant usage, select on sequence
  public.radiscan_documenti_vigenza_eventi_id_seq,
  public.radiscan_pulizie_sessioni_id_seq,
  public.radiscan_registro_chiamate_id_seq,
  public.radiscan_usage_id_seq
  to service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 3. Controlli transazionali
-- ───────────────────────────────────────────────────────────────────────
-- I controlli usano has_table_privilege/has_sequence_privilege/
-- has_function_privilege: includono quindi privilegi diretti, grant a
-- PUBLIC e privilegi ereditati tramite membership. Un privilegio residuo
-- dovuto a membership o a un ruolo proprietario fa fallire la migration.
do $acl_hardening$
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
  v_update_atteso boolean;

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

  v_tabelle_update constant text[] := array[
    'radiscan_operatori',
    'radiscan_motori',
    'radiscan_documenti_disciplinari',
    'radiscan_sessioni',
    'radiscan_prove'
  ];

  v_sequenze constant text[] := array[
    'radiscan_documenti_vigenza_eventi_id_seq',
    'radiscan_pulizie_sessioni_id_seq',
    'radiscan_registro_chiamate_id_seq',
    'radiscan_usage_id_seq'
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

  v_privilegi_vietati constant text[] := array[
    'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
  ];

  v_privilegi_sequenza constant text[] := array['USAGE', 'SELECT', 'UPDATE'];
  v_ruoli_app constant text[] := array['anon', 'authenticated'];
begin
  if to_regrole('service_role') is null
     or to_regrole('anon') is null
     or to_regrole('authenticated') is null
     or to_regrole('postgres') is null then
    raise exception 'ACL hardening: ruoli attesi assenti (service_role, anon, authenticated, postgres)';
  end if;

  if exists (
    select 1 from pg_roles
     where rolname = 'service_role' and rolsuper
  ) then
    raise exception 'ACL hardening: service_role è superuser; la revoca non sarebbe efficace';
  end if;

  -- ── 3.1 Tabelle: esistenza, proprietario, ACL di service_role ────────
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
      raise exception 'ACL hardening: tabella public.% assente', v_tabella;
    end if;

    if v_owner <> 'postgres' then
      raise exception 'ACL hardening: proprietario inatteso per public.%: % (atteso postgres)',
        v_tabella, v_owner;
    end if;

    if not has_table_privilege('service_role', v_rel, 'SELECT') then
      raise exception 'ACL hardening: service_role non ha SELECT su public.%', v_tabella;
    end if;

    if not has_table_privilege('service_role', v_rel, 'INSERT') then
      raise exception 'ACL hardening: service_role non ha INSERT su public.%', v_tabella;
    end if;

    v_update_atteso := v_tabella = any (v_tabelle_update);
    if has_table_privilege('service_role', v_rel, 'UPDATE') <> v_update_atteso then
      raise exception 'ACL hardening: UPDATE di service_role su public.% = %, atteso %',
        v_tabella,
        has_table_privilege('service_role', v_rel, 'UPDATE'),
        v_update_atteso;
    end if;

    foreach v_privilegio in array v_privilegi_vietati loop
      if has_table_privilege('service_role', v_rel, v_privilegio) then
        raise exception 'ACL hardening: service_role conserva % su public.%',
          v_privilegio, v_tabella;
      end if;
    end loop;

    foreach v_ruolo in array v_ruoli_app loop
      foreach v_privilegio in array v_privilegi_tabella loop
        if has_table_privilege(v_ruolo, v_rel, v_privilegio) then
          raise exception 'ACL hardening: % conserva % su public.%',
            v_ruolo, v_privilegio, v_tabella;
        end if;
      end loop;
    end loop;

    if v_acl is not null and exists (
      select 1
        from aclexplode(v_acl) a
       where a.grantee = 0
         and a.privilege_type = any (v_privilegi_tabella)
    ) then
      raise exception 'ACL hardening: PUBLIC conserva privilegi su public.%', v_tabella;
    end if;

    foreach v_privilegio in array v_privilegi_tabella loop
      if not has_table_privilege('postgres', v_rel, v_privilegio) then
        raise exception 'ACL hardening: postgres ha perso % su public.%',
          v_privilegio, v_tabella;
      end if;
    end loop;
  end loop;

  -- ── 3.2 Sequenze: esistenza, proprietario, identità, ACL ─────────────
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
      raise exception 'ACL hardening: sequenza public.% assente', v_sequenza;
    end if;

    if v_owner <> 'postgres' then
      raise exception 'ACL hardening: proprietario inatteso per public.%: % (atteso postgres)',
        v_sequenza, v_owner;
    end if;

    if not has_sequence_privilege('service_role', v_seq, 'USAGE') then
      raise exception 'ACL hardening: service_role non ha USAGE su public.%', v_sequenza;
    end if;

    if not has_sequence_privilege('service_role', v_seq, 'SELECT') then
      raise exception 'ACL hardening: service_role non ha SELECT su public.%', v_sequenza;
    end if;

    if has_sequence_privilege('service_role', v_seq, 'UPDATE') then
      raise exception 'ACL hardening: service_role conserva UPDATE su public.%', v_sequenza;
    end if;

    foreach v_ruolo in array v_ruoli_app loop
      foreach v_privilegio in array v_privilegi_sequenza loop
        if has_sequence_privilege(v_ruolo, v_seq, v_privilegio) then
          raise exception 'ACL hardening: % conserva % su public.%',
            v_ruolo, v_privilegio, v_sequenza;
        end if;
      end loop;
    end loop;

    if v_acl is not null and exists (
      select 1
        from aclexplode(v_acl) a
       where a.grantee = 0
         and a.privilege_type = any (v_privilegi_sequenza)
    ) then
      raise exception 'ACL hardening: PUBLIC conserva privilegi su public.%', v_sequenza;
    end if;

    foreach v_privilegio in array v_privilegi_sequenza loop
      if not has_sequence_privilege('postgres', v_seq, v_privilegio) then
        raise exception 'ACL hardening: postgres ha perso % su public.%',
          v_privilegio, v_sequenza;
      end if;
    end loop;
  end loop;

  -- Le quattro sequenze devono essere davvero identity delle colonne id.
  if to_regclass(pg_get_serial_sequence('public.radiscan_documenti_vigenza_eventi', 'id'))
       is distinct from to_regclass('public.radiscan_documenti_vigenza_eventi_id_seq') then
    raise exception 'ACL hardening: sequenza identity inattesa per radiscan_documenti_vigenza_eventi.id';
  end if;

  if to_regclass(pg_get_serial_sequence('public.radiscan_pulizie_sessioni', 'id'))
       is distinct from to_regclass('public.radiscan_pulizie_sessioni_id_seq') then
    raise exception 'ACL hardening: sequenza identity inattesa per radiscan_pulizie_sessioni.id';
  end if;

  if to_regclass(pg_get_serial_sequence('public.radiscan_registro_chiamate', 'id'))
       is distinct from to_regclass('public.radiscan_registro_chiamate_id_seq') then
    raise exception 'ACL hardening: sequenza identity inattesa per radiscan_registro_chiamate.id';
  end if;

  if to_regclass(pg_get_serial_sequence('public.radiscan_usage', 'id'))
       is distinct from to_regclass('public.radiscan_usage_id_seq') then
    raise exception 'ACL hardening: sequenza identity inattesa per radiscan_usage.id';
  end if;

  -- ── 3.3 RPC: proprietario, SECURITY DEFINER, EXECUTE ─────────────────
  -- Nessuna modifica alle funzioni: solo verifica dell'ACL esistente.
  foreach v_rpc in array v_rpc loop
    v_fn := to_regprocedure(v_rpc);
    v_owner := null;
    v_acl := null;
    v_secdef := null;

    if v_fn is null then
      raise exception 'ACL hardening: RPC % assente', v_rpc;
    end if;

    select pg_get_userbyid(p.proowner), p.proacl, p.prosecdef
      into v_owner, v_acl, v_secdef
      from pg_proc p
     where p.oid = v_fn;

    if v_owner <> 'postgres' then
      raise exception 'ACL hardening: proprietario inatteso per %: % (atteso postgres)',
        v_rpc, v_owner;
    end if;

    if not v_secdef then
      raise exception 'ACL hardening: % non è SECURITY DEFINER', v_rpc;
    end if;

    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception 'ACL hardening: service_role non ha EXECUTE su %', v_rpc;
    end if;

    foreach v_ruolo in array v_ruoli_app loop
      if has_function_privilege(v_ruolo, v_fn, 'EXECUTE') then
        raise exception 'ACL hardening: % conserva EXECUTE su %', v_ruolo, v_rpc;
      end if;
    end loop;

    if v_acl is null then
      raise exception 'ACL hardening: % ha proacl NULL (EXECUTE di default a PUBLIC)', v_rpc;
    end if;

    if exists (
      select 1
        from aclexplode(v_acl) a
       where a.grantee = 0
         and a.privilege_type = 'EXECUTE'
    ) then
      raise exception 'ACL hardening: PUBLIC conserva EXECUTE su %', v_rpc;
    end if;

    if not has_function_privilege('postgres', v_fn, 'EXECUTE') then
      raise exception 'ACL hardening: postgres ha perso EXECUTE su %', v_rpc;
    end if;
  end loop;

  raise notice 'ACL hardening M1a: 13 tabelle, 4 sequenze e 13 RPC verificati';
end
$acl_hardening$;

-- Le modifiche ACL sono visibili a PostgREST; il reload non altera lo schema.
notify pgrst, 'reload schema';

commit;
