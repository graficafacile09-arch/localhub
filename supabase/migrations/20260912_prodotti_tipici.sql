begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- Prodotti Tipici — vetrina territoriale (Castrovillari / Pollino)
--
-- Aggiunge un flag booleano alla tabella pubblica `prodotti`. Un prodotto
-- con prodotto_tipico = true resta un normalissimo prodotto del catalogo del
-- negozio (prezzo, immagini, varianti, disponibilità, preferiti, carrello,
-- ordini, URL /prodotto/[slug]) ma viene anche mostrato nella vetrina
-- "Prodotti tipici" della homepage e nella pagina dedicata.
--
-- Design: NESSUNA tabella parallela, NESSUNA duplicazione. Solo un flag,
-- coerente con l'esistente `negozi.in_evidenza`.
--
-- NON distruttiva: default false, i prodotti esistenti continuano a
-- funzionare esattamente come prima. NON tocca RLS, ownership, relazioni,
-- ordini, carrello o preferiti.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.prodotti
  add column if not exists prodotto_tipico boolean not null default false;

-- Indice parziale per la query pubblica della vetrina (attivo + tipico).
-- Serve solo a velocizzare il filtro: resto del database invariato.
create index if not exists prodotti_tipici_attivi_idx
  on public.prodotti (negozio_id)
  where prodotto_tipico = true and attivo = true;

commit;