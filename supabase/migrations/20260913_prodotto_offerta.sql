begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- Prodotti in Offerta — vetrina promozioni (/offerte)
--
-- Aggiunge un flag booleano alla tabella pubblica `prodotti`, nello stesso
-- concetto architetturale di `prodotto_tipico`. Un prodotto con
-- prodotto_offerta = true resta un normalissimo prodotto del catalogo del
-- negozio (prezzo, immagini, varianti, disponibilità, preferiti, carrello,
-- ordini, URL /prodotto/[slug]) ma viene anche mostrato nella vetrina
-- "Offerte" della pagina dedicata /offerte.
--
-- Design: NESSUNA tabella parallela, NESSUNA duplicazione. Solo un flag,
-- coerente con l'esistente `prodotto_tipico` e `negozi.in_evidenza`.
--
-- NON distruttiva: default false, i prodotti esistenti continuano a
-- funzionare esattamente come prima. NON tocca RLS, ownership, relazioni,
-- ordini, carrello o preferiti.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.prodotti
  add column if not exists prodotto_offerta boolean not null default false;

-- Indice parziale per la query pubblica della vetrina (attivo + offerta).
create index if not exists prodotti_offerta_attivi_idx
  on public.prodotti (negozio_id)
  where prodotto_offerta = true and attivo = true;

commit;