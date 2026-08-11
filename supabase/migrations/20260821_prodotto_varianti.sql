-- ═══════════════════════════════════════════════════════════════════════
-- InCittà — FASE E1 VARIANTI PRODOTTO: infrastruttura
--
-- Obiettivo: predisporre l'architettura per prodotti con varianti (prezzo,
-- stock e attributi propri, es. taglia/colore/materiale) in modo ADDITIVO
-- e backward-compatible: nessun prodotto esistente viene toccato.
--
-- Scelte progettuali:
--   1. Tabella figlia prodotto_varianti (una riga per combinazione di
--      attributi): stock/prezzo per riga, aggiornabili atomicamente,
--      indipendenti dal prodotto padre (modello A dell'audit Fase E).
--   2. prodotti.ha_varianti = false per tutti i prodotti esistenti: il
--      trigger di aggregazione NON tocca i prodotti legacy.
--   3. ordini_righe.variante_id (FK ON DELETE SET NULL) + variante_nome
--      (snapshot, come nome_prodotto/prezzo_unitario già esistenti): gli
--      ordini storici restano integri. crea_ordine NON viene modificato
--      in questa fase (sarà E5).
--   4. RLS coerente col modello merchant reale (negozi.owner_user_id via
--      is_merchant_for_store, migration 20260723): lettura pubblica solo
--      per varianti di prodotti ATTIVI di negozi attivi/non soft-deleted;
--      scrittura esclusivamente al merchant proprietario del negozio.
--   5. Trigger atomico di aggregazione per i prodotti ha_varianti=true:
--        prodotti.prezzo              = MIN(prezzo) varianti attive
--                                        (se tutte NULL → resta il prezzo padre)
--        prodotti.quantita_disponibile = SUM(quantita_disponibile) varianti attive
--        prodotti.quantita_riservata   = SUM(quantita_riservata) varianti attive
--      In questo modo ricerca/filtri (Fase C) e badge Esaurito (Fase D)
--      continuano a lavorare sulla stessa colonna, senza doppio conteggio
--      (l'aggregato SOSTITUISCE il valore del prodotto, non si somma).
--   6. UNIQUE (prodotto_id, attributi): jsonb non ha opclass btree di
--      default in PostgreSQL, quindi il vincolo è espresso come indice
--      UNIQUE sull'espressione deterministica attributi::text (jsonb
--      normalizza l'ordine delle chiavi → testo identico per valori uguali).
--   7. NOTA OPERATIVA per E2/E3: il trigger di aggregazione scatta SOLO su
--      modifiche a prodotto_varianti. Quando il merchant attiva le varianti
--      (prodotti.ha_varianti = true) su un prodotto che ha GIÀ varianti
--      (o le crea prima di attivare il flag), la riga prodotti non viene
--      ricalcolata finché non avviene la SUCCESSIVA modifica di una
--      variante. E2/E3 devono attivare il flag PRIMA di inserire varianti
--      oppure invocare direttamente public.aggiorna_prodotto_da_varianti()
--      dopo l'attivazione (la funzione è già invocabile in modo autonomo).
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Tabella prodotto_varianti ─────────────────────────────────────────
create table if not exists public.prodotto_varianti (
  id                    uuid primary key default gen_random_uuid(),
  -- prodotti.id è bigint (verificato sullo schema reale)
  prodotto_id           bigint not null references public.prodotti (id) on delete cascade,
  -- Nome leggibile della variante (es. "Maglia M / Blu"); snapshot per righe ordine
  nome                  text,
  -- Attributi della combinazione (es. {"taglia":"M","colore":"Blu"})
  attributi             jsonb not null default '{}'::jsonb,
  -- Prezzo proprio: NULL → eredita prodotti.prezzo
  prezzo                numeric(10, 2),
  quantita_disponibile  integer not null default 0,
  quantita_riservata    integer not null default 0,
  -- Immagine propria: NULL → eredita prodotti.immagine_principale
  immagine_principale   text,
  attivo                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint prodotto_varianti_quantita_non_negativa
    check (quantita_disponibile >= 0),
  constraint prodotto_varianti_riserva_non_negativa
    check (quantita_riservata >= 0)
);

-- Indici di lettura (aggregazione per prodotto + filtro attivo)
create index if not exists prodotto_varianti_prodotto_id_idx
  on public.prodotto_varianti (prodotto_id);
create index if not exists prodotto_varianti_prodotto_attivo_idx
  on public.prodotto_varianti (prodotto_id, attivo);

-- UNIQUE (prodotto_id, attributi) via espressione deterministica:
-- jsonb non ha opclass btree di default → indice su attributi::text
-- (jsonb normalizza l'ordine delle chiavi: valori uguali → testo identico).
create unique index if not exists prodotto_varianti_prodotto_attributi_unq
  on public.prodotto_varianti (prodotto_id, (attributi::text));

-- Trigger updated_at (funzione già esistente nel progetto)
drop trigger if exists prodotto_varianti_set_updated_at on public.prodotto_varianti;
create trigger prodotto_varianti_set_updated_at
  before update on public.prodotto_varianti
  for each row execute function public.set_updated_at();

-- ── 2. Colonne additive su tabelle esistenti ─────────────────────────────
-- Flag: il prodotto usa varianti (default false: i prodotti esistenti non
-- vengono né modificati né ricalcolati finché il merchant non le attiva).
alter table public.prodotti
  add column if not exists ha_varianti boolean not null default false;

-- Riga ordine: riferimento opzionale alla variante acquistata + snapshot.
-- ON DELETE SET NULL: se una variante viene eliminata, l'ordine resta
-- integro (variante_nome conserva il testo storico).
alter table public.ordini_righe
  add column if not exists variante_id uuid
    references public.prodotto_varianti (id) on delete set null,
  add column if not exists variante_nome text;

create index if not exists ordini_righe_variante_id_idx
  on public.ordini_righe (variante_id);

-- ── 3. RLS ───────────────────────────────────────────────────────────────
alter table public.prodotto_varianti enable row level security;

-- Lettura pubblica: SOLO varianti di prodotti attivi appartenenti a negozi
-- attivi e non soft-deleted (più restrittiva della policy "public active
-- products read" sui prodotti, come richiesto per le varianti).
drop policy if exists "varianti pubbliche read" on public.prodotto_varianti;
create policy "varianti pubbliche read"
  on public.prodotto_varianti for select
  using (
    exists (
      select 1
      from public.prodotti p
      join public.negozi n on n.id = p.negozio_id
      where p.id = prodotto_varianti.prodotto_id
        and p.attivo = true
        and n.attivo = true
        and n.deleted_at is null
    )
  );

-- Scrittura: SOLO il merchant proprietario del negozio del prodotto
-- (is_merchant_for_store = negozi.owner_user_id = auth.uid(), 20260723).
-- La creazione avviene sempre passando dal prodotto: il check risolve il
-- negozio dal prodotto, MAI da un valore inviato dal client.
drop policy if exists "varianti merchant write" on public.prodotto_varianti;
create policy "varianti merchant write"
  on public.prodotto_varianti for all
  using (
    exists (
      select 1
      from public.prodotti p
      where p.id = prodotto_varianti.prodotto_id
        and public.is_merchant_for_store(p.negozio_id::text)
    )
  )
  with check (
    exists (
      select 1
      from public.prodotti p
      where p.id = prodotto_varianti.prodotto_id
        and public.is_merchant_for_store(p.negozio_id::text)
    )
  );

-- ── 4. Trigger atomico di aggregazione ────────────────────────────────────
-- Per i prodotti con ha_varianti = true, mantiene su prodotti:
--   prezzo              = MIN(prezzo) delle varianti attive (se tutte NULL
--                         → resta il prezzo padre, mai NULL);
--   quantita_disponibile = SUM(qta) varianti attive;
--   quantita_riservata   = SUM(riserva) varianti attive.
-- I prodotti con ha_varianti = false NON vengono mai toccati.
-- La funzione è SECURITY DEFINER con search_path fisso (pattern crea_ordine):
-- l'aggiornamento del prodotto funziona anche quando il chiamante ha RLS
-- limitata alla sola riga variante.
create or replace function public.aggiorna_prodotto_da_varianti()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prodotto_id bigint;
  v_ha_varianti boolean;
  v_min_prezzo  numeric;
  v_somma_qta   integer;
  v_somma_ris   integer;
begin
  -- Prodotto interessato (NEW per insert/update, OLD per delete)
  v_prodotto_id := coalesce(new.prodotto_id, old.prodotto_id);

  select p.ha_varianti
  into v_ha_varianti
  from public.prodotti p
  where p.id = v_prodotto_id;

  -- Mai toccare i prodotti legacy / non-varianti
  if v_ha_varianti is null or not v_ha_varianti then
    return null;
  end if;

  -- Aggregazione SOLO delle varianti attive
  select min(v.prezzo),
         coalesce(sum(v.quantita_disponibile), 0),
         coalesce(sum(v.quantita_riservata), 0)
  into v_min_prezzo, v_somma_qta, v_somma_ris
  from public.prodotto_varianti v
  where v.prodotto_id = v_prodotto_id
    and v.attivo = true;

  update public.prodotti
  set prezzo              = coalesce(v_min_prezzo, prezzo),
      quantita_disponibile = v_somma_qta,
      quantita_riservata   = v_somma_ris
  where id = v_prodotto_id;

  return null;
end;
$$;

drop trigger if exists prodotto_varianti_aggiorna_prodotto on public.prodotto_varianti;
create trigger prodotto_varianti_aggiorna_prodotto
  after insert or update or delete on public.prodotto_varianti
  for each row execute function public.aggiorna_prodotto_da_varianti();

notify pgrst, 'reload schema';

commit;
