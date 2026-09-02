begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED — Prodotti in Offerta (4) — vetrina /offerte
--
-- Idempotente e non distruttiva. Upsert per slug (indici parziali
-- negozi_slug_unique_idx / prodotti_slug_unique_idx presenti sul remoto).
-- I 4 prodotti sono associati ESCLUSIVAMENTE a negozi demo GIÀ ESISTENTI:
--
--   1. Nutella 400 g        → demo-sapori-castrovillari (nuovo)
--   2. Caffè in grani 250 g → demo-terre-pollino (nuovo)
--   3. Coca-Cola            → panificio-rossi (ESISTENTE: solo prezzo/flag)
--   4. Latte Polenghi 1 L   → demo-bottega-pollino (nuovo)
--
-- Ogni prodotto resta un normalissimo prodotto del catalogo: pagina
-- /prodotto/[slug], prezzo, stock, carrello, checkout e ordini invariati.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Nutella 400 g → Sapori di Castrovillari (demo) ─────────────────────
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, marca, prezzo, attivo, quantita_disponibile, immagine_principale, origine_pubblicazione, prodotto_offerta, created_at, updated_at)
select 'nutella-400-g', n.id, 'Nutella Vasetto 400 g', 'Il classico barattolo di Nutella da 400 g: crema spalmabile di nocciole e cacao, amata in tutto il mondo.', 'Dolciumi', 'Nutella', 3.49, true, 30, 'https://images.pexels.com/photos/10510055/pexels-photo-10510055.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600', 'manuale', true, now(), now()
from public.negozi n where n.slug = 'demo-sapori-castrovillari'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  marca = excluded.marca, prezzo = excluded.prezzo, attivo = true,
  quantita_disponibile = excluded.quantita_disponibile,
  immagine_principale = excluded.immagine_principale, prodotto_offerta = true;

-- ── 2) Caffè in grani 250 g → Terre del Pollino (demo) ────────────────────
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, marca, prezzo, attivo, quantita_disponibile, immagine_principale, origine_pubblicazione, prodotto_offerta, created_at, updated_at)
select 'caffe-in-grani-250-g', n.id, 'Caffè in grani 250 g', 'Caffè in grani premium da 250 g, tostatura media e aroma intenso. Macinato al momento per un espresso perfetto.', 'Caffè', 'Caffè', 4.99, true, 25, 'https://images.pexels.com/photos/28495599/pexels-photo-28495599.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600', 'manuale', true, now(), now()
from public.negozi n where n.slug = 'demo-terre-pollino'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  marca = excluded.marca, prezzo = excluded.prezzo, attivo = true,
  quantita_disponibile = excluded.quantita_disponibile,
  immagine_principale = excluded.immagine_principale, prodotto_offerta = true;

-- ── 3) Coca-Cola Original Taste → Panificio Rossi (demo, prodotto ESISTENTE) ─
-- Il prodotto esiste già (id 1395): solo prezzo reale + stock + flag offerta.
update public.prodotti
set prezzo = 1.10, quantita_disponibile = 30, prodotto_offerta = true
where slug = 'coca-cola-original-taste';

-- ── 4) Latte Fresco Polenghi 1 L → Bottega del Pollino (demo) ─────────────
insert into public.prodotti (slug, negozio_id, nome, descrizione, categoria, marca, prezzo, attivo, quantita_disponibile, immagine_principale, origine_pubblicazione, prodotto_offerta, created_at, updated_at)
select 'latte-fresco-polenghi-1l', n.id, 'Latte Fresco Polenghi 1 L', 'Latte fresco intero Polenghi da 1 litro, alta qualità e gusto delicato. Prodotto italiano.', 'Latticini', 'Polenghi', 1.59, true, 20, 'https://images.pexels.com/photos/5652184/pexels-photo-5652184.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=600&h=600', 'manuale', true, now(), now()
from public.negozi n where n.slug = 'demo-bottega-pollino'
on conflict (slug) where slug is not null do update set
  nome = excluded.nome, descrizione = excluded.descrizione, categoria = excluded.categoria,
  marca = excluded.marca, prezzo = excluded.prezzo, attivo = true,
  quantita_disponibile = excluded.quantita_disponibile,
  immagine_principale = excluded.immagine_principale, prodotto_offerta = true;

notify pgrst, 'reload schema';

commit;