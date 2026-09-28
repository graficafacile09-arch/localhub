-- InCittà — DIRITTO DI RECESSO V1
-- FASE 1: modello dati + snapshot della regola al momento dell'ordine.
-- Migration additiva: nessuna struttura esistente viene rimossa.

begin;

alter table public.prodotti
  add column if not exists recesso_applicabile boolean not null default true,
  add column if not exists recesso_esclusione_codice text,
  add column if not exists recesso_esclusione_dettaglio text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='prodotti_recesso_esclusione_codice_check') then
    alter table public.prodotti add constraint prodotti_recesso_esclusione_codice_check
      check (
        recesso_esclusione_codice is null or
        recesso_esclusione_codice in (
          'prodotto_personalizzato','prodotto_deperibile',
          'bene_sigillato_igiene_salute','servizio_tempo_libero_data_specifica',
          'contenuto_digitale_avviato','servizio_urgente_su_richiesta',
          'altra_esclusione_prevista'
        )
      );
  end if;
  if not exists (select 1 from pg_constraint where conname='prodotti_recesso_regola_coerente_check') then
    alter table public.prodotti add constraint prodotti_recesso_regola_coerente_check
      check (
        (recesso_applicabile = true and recesso_esclusione_codice is null) or
        (recesso_applicabile = false and recesso_esclusione_codice is not null)
      );
  end if;
end $$;

alter table public.ordini_righe
  add column if not exists recesso_applicabile boolean,
  add column if not exists recesso_esclusione_codice text,
  add column if not exists recesso_esclusione_dettaglio text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='ordini_righe_recesso_esclusione_codice_check') then
    alter table public.ordini_righe add constraint ordini_righe_recesso_esclusione_codice_check
      check (
        recesso_esclusione_codice is null or
        recesso_esclusione_codice in (
          'prodotto_personalizzato','prodotto_deperibile',
          'bene_sigillato_igiene_salute','servizio_tempo_libero_data_specifica',
          'contenuto_digitale_avviato','servizio_urgente_su_richiesta',
          'altra_esclusione_prevista'
        )
      );
  end if;
end $$;

create or replace function public.snapshot_recesso_riga_ordine()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
declare v_prodotto record;
begin
  select recesso_applicabile,recesso_esclusione_codice,recesso_esclusione_dettaglio
    into v_prodotto
    from public.prodotti
   where id=new.prodotto_id;
  if found then
    new.recesso_applicabile:=v_prodotto.recesso_applicabile;
    new.recesso_esclusione_codice:=v_prodotto.recesso_esclusione_codice;
    new.recesso_esclusione_dettaglio:=v_prodotto.recesso_esclusione_dettaglio;
  end if;
  return new;
end;
$$;

drop trigger if exists ordini_righe_snapshot_recesso on public.ordini_righe;
create trigger ordini_righe_snapshot_recesso
before insert on public.ordini_righe
for each row execute function public.snapshot_recesso_riga_ordine();

create or replace function public.set_consegnata_at_on_order_completion()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
begin
  if new.stato='consegnato' and old.stato is distinct from new.stato and new.consegnata_at is null then
    new.consegnata_at:=now();
  end if;
  return new;
end;
$$;

drop trigger if exists ordini_set_consegnata_at_on_completion on public.ordini;
create trigger ordini_set_consegnata_at_on_completion
before update of stato on public.ordini
for each row execute function public.set_consegnata_at_on_order_completion();

create sequence if not exists public.richieste_recesso_numero_seq;

create table if not exists public.richieste_recesso (
  id uuid primary key default gen_random_uuid(),
  numero text not null default ('RC-'||lpad(nextval('public.richieste_recesso_numero_seq')::text,6,'0')),
  ordine_id uuid not null references public.ordini(id) on delete restrict,
  negozio_id uuid not null references public.negozi(id) on delete restrict,
  cliente_user_id uuid references auth.users(id) on delete set null,

  cliente_nome text not null,
  cliente_cognome text not null,
  cliente_email text,
  cliente_telefono text,

  venditore_identity_id uuid references public.identita_venditore(id) on delete set null,
  venditore_denominazione_legale text,
  venditore_nome_commerciale text,
  venditore_partita_iva text,
  venditore_codice_fiscale text,
  venditore_pec text,
  venditore_sede_legale text,
  venditore_email text,
  venditore_telefono text,

  metodo_richiesta text not null default 'funzione_online' check(metodo_richiesta='funzione_online'),
  decorrenza_tipo text not null default 'consegna'
    check(decorrenza_tipo in ('consegna','ritiro','conclusione_servizio')),
  decorrenza_at timestamptz not null,
  termine_recesso_at timestamptz not null,
  dichiarazione_testo text not null,
  richiesta_at timestamptz not null default now(),
  ricevuta_at timestamptz not null default now(),

  stato text not null default 'richiesta'
    check(stato in (
      'richiesta','presa_in_carico','istruzioni_reso','reso_ricevuto',
      'rimborso_in_elaborazione','rimborsata','rifiutata','annullata','chiusa'
    )),

  motivo_cliente text,
  note_cliente text,
  rifiuto_codice text
    check(rifiuto_codice is null or rifiuto_codice in (
      'fuori_termine','esclusione_legale','ordine_non_ammissibile',
      'pagamento_non_rimborsabile','altro_documentato'
    )),
  rifiuto_nota text,

  importo_previsto numeric(10,2),
  importo_rimborsato numeric(10,2),
  rimborso_operazione_id uuid references public.pagamenti_rimborso_operazioni(id) on delete set null,

  conferma_inviata_at timestamptz,
  conferma_email text,
  conferma_message_id text,
  conferma_esito text check(conferma_esito is null or conferma_esito in ('inviata','fallita')),

  presa_in_carico_at timestamptz,
  istruzioni_reso_at timestamptz,
  reso_ricevuto_at timestamptz,
  rimborso_avviato_at timestamptz,
  rimborsata_at timestamptz,
  chiusa_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint richieste_recesso_numero_unq unique(numero),
  constraint richieste_recesso_importo_previsto_ck check(importo_previsto is null or importo_previsto>=0),
  constraint richieste_recesso_importo_rimborsato_ck check(importo_rimborsato is null or importo_rimborsato>=0),
  constraint richieste_recesso_termine_coerente_ck check(termine_recesso_at>=decorrenza_at)
);

create index if not exists richieste_recesso_ordine_id_idx on public.richieste_recesso(ordine_id,created_at desc);
create index if not exists richieste_recesso_negozio_id_idx on public.richieste_recesso(negozio_id,created_at desc);
create index if not exists richieste_recesso_cliente_user_id_idx on public.richieste_recesso(cliente_user_id,created_at desc);
create index if not exists richieste_recesso_stato_idx on public.richieste_recesso(stato,created_at desc);
create unique index if not exists richieste_recesso_ordine_attiva_unq
  on public.richieste_recesso(ordine_id)
  where stato not in ('rimborsata','rifiutata','annullata','chiusa');

drop trigger if exists richieste_recesso_set_updated_at on public.richieste_recesso;
create trigger richieste_recesso_set_updated_at
before update on public.richieste_recesso
for each row execute function public.set_updated_at();

create table if not exists public.richieste_recesso_righe (
  id uuid primary key default gen_random_uuid(),
  richiesta_id uuid not null references public.richieste_recesso(id) on delete cascade,
  ordine_riga_id uuid not null references public.ordini_righe(id) on delete restrict,
  prodotto_id bigint not null references public.prodotti(id) on delete restrict,
  nome_prodotto text not null,
  prezzo_unitario numeric(10,2) not null,
  quantita_ordine integer not null check(quantita_ordine>0),
  quantita_richiesta integer not null check(quantita_richiesta>0),
  recesso_applicabile boolean,
  recesso_esclusione_codice text,
  recesso_esclusione_dettaglio text,
  created_at timestamptz not null default now(),
  constraint richieste_recesso_righe_quantita_ck check(quantita_richiesta<=quantita_ordine),
  constraint richieste_recesso_righe_unq unique(richiesta_id,ordine_riga_id)
);

create index if not exists richieste_recesso_righe_richiesta_idx
  on public.richieste_recesso_righe(richiesta_id);

create table if not exists public.richieste_recesso_eventi (
  id uuid primary key default gen_random_uuid(),
  richiesta_id uuid not null references public.richieste_recesso(id) on delete cascade,
  tipo text not null check(tipo in (
    'creato','stato','nota','ricevuta','istruzioni_reso','reso','rimborso','chiusura'
  )),
  autore_user_id uuid references auth.users(id) on delete set null,
  stato_precedente text,
  stato_nuovo text,
  messaggio text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists richieste_recesso_eventi_richiesta_idx
  on public.richieste_recesso_eventi(richiesta_id,created_at asc);

create or replace function public.registra_evento_recesso_stato()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
begin
  if tg_op='INSERT' then
    insert into public.richieste_recesso_eventi(richiesta_id,tipo,autore_user_id,stato_nuovo,messaggio)
    values(new.id,'creato',new.cliente_user_id,new.stato,'Richiesta di recesso trasmessa tramite la funzione online.');
  elsif new.stato is distinct from old.stato then
    insert into public.richieste_recesso_eventi(richiesta_id,tipo,stato_precedente,stato_nuovo,messaggio)
    values(new.id,'stato',old.stato,new.stato,'Aggiornamento dello stato della pratica.');
  end if;
  return new;
end;
$$;

drop trigger if exists richieste_recesso_registra_evento on public.richieste_recesso;
create trigger richieste_recesso_registra_evento
after insert or update of stato on public.richieste_recesso
for each row execute function public.registra_evento_recesso_stato();

alter table public.richieste_recesso enable row level security;
alter table public.richieste_recesso_righe enable row level security;
alter table public.richieste_recesso_eventi enable row level security;

drop policy if exists "recesso self select" on public.richieste_recesso;
create policy "recesso self select" on public.richieste_recesso for select to authenticated
using((select auth.uid())=cliente_user_id);

drop policy if exists "recesso merchant select" on public.richieste_recesso;
create policy "recesso merchant select" on public.richieste_recesso for select to authenticated
using(exists(select 1 from public.negozi n where n.id=richieste_recesso.negozio_id and n.owner_user_id=(select auth.uid())));

drop policy if exists "recesso admin select all" on public.richieste_recesso;
create policy "recesso admin select all" on public.richieste_recesso for select to authenticated
using(exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='admin'));

drop policy if exists "recesso righe self select" on public.richieste_recesso_righe;
create policy "recesso righe self select" on public.richieste_recesso_righe for select to authenticated
using(exists(select 1 from public.richieste_recesso rr where rr.id=richieste_recesso_righe.richiesta_id and rr.cliente_user_id=(select auth.uid())));

drop policy if exists "recesso righe merchant select" on public.richieste_recesso_righe;
create policy "recesso righe merchant select" on public.richieste_recesso_righe for select to authenticated
using(exists(select 1 from public.richieste_recesso rr join public.negozi n on n.id=rr.negozio_id where rr.id=richieste_recesso_righe.richiesta_id and n.owner_user_id=(select auth.uid())));

drop policy if exists "recesso righe admin select all" on public.richieste_recesso_righe;
create policy "recesso righe admin select all" on public.richieste_recesso_righe for select to authenticated
using(exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='admin'));

drop policy if exists "recesso eventi self select" on public.richieste_recesso_eventi;
create policy "recesso eventi self select" on public.richieste_recesso_eventi for select to authenticated
using(exists(select 1 from public.richieste_recesso rr where rr.id=richieste_recesso_eventi.richiesta_id and rr.cliente_user_id=(select auth.uid())));

drop policy if exists "recesso eventi merchant select" on public.richieste_recesso_eventi;
create policy "recesso eventi merchant select" on public.richieste_recesso_eventi for select to authenticated
using(exists(select 1 from public.richieste_recesso rr join public.negozi n on n.id=rr.negozio_id where rr.id=richieste_recesso_eventi.richiesta_id and n.owner_user_id=(select auth.uid())));

drop policy if exists "recesso eventi admin select all" on public.richieste_recesso_eventi;
create policy "recesso eventi admin select all" on public.richieste_recesso_eventi for select to authenticated
using(exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='admin'));

notify pgrst,'reload schema';

commit;
