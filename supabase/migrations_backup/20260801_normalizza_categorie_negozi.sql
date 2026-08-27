-- ═══════════════════════════════════════════════════════════════════════
-- 20260801_normalizza_categorie_negozi.sql
--
-- Normalizzazione delle categorie dei NEGOZI DEMO verso il catalogo
-- ufficiale (tabella `categorie`).
--
-- PRINCIPIO (approvato): la categoria assegnata dipende dal NEGOZIO REALE
-- (attività effettiva: nome, descrizione, prodotti), NON dal valore
-- testuale della colonna categoria. NON esistono regole generiche del tipo
-- 'alimentari → panificio': ogni negozio viene associato alla categoria
-- del catalogo che rappresenta davvero la sua attività.
--
-- Negozi demo da normalizzare (13), con la prova dell'attività reale:
--   Panificio Rossi  → Panificio          (desc: "Pane, pizza e prodotti
--                                           da forno artigianali e farina";
--                                           11 prodotti: Pane, Pizza, …)
--   Tech Store 2     → Tech & Elettronica (desc: "Smartphone, computer e
--                                           assistenza tecnica"; 1 prodotto)
--   Test Store Vision ×10 → Tech & Elettronica (negozi di test tecnologia)
--   Fashion Style    → Abbigliamento      (desc: "Boutique di abbigliamento
--                                           e accessori")
--
-- Tutti gli altri negozi (Bar, Altro, Beauty, Abbigliamento già canonici)
-- NON vengono toccati.
--
-- ⚠️  DA APPLICARE SOLO DOPO APPROVAZIONE MANUALE.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 0) GARANZIA: le categorie di destinazione devono esistere nel catalogo ──
DO $$
DECLARE
  mancanti TEXT[];
BEGIN
  SELECT array_agg(t)
    INTO mancanti
    FROM unnest(ARRAY['Tech & Elettronica', 'Abbigliamento', 'Panificio']) AS t
    WHERE NOT EXISTS (SELECT 1 FROM categorie WHERE nome = t);
  IF mancanti IS NOT NULL THEN
    RAISE EXCEPTION 'Categorie di destinazione mancanti nel catalogo: %', mancanti;
  END IF;
END $$;

-- ─── 1) ASSEGNAZIONE PER-STORE (per id, basata sull'attività reale) ─────────
-- La tabella VALUES associa ogni negozio demo (id) alla categoria del
-- catalogo che rappresenta la sua attività effettiva. Nessuna regola
-- generica sul valore testuale della categoria.
DO $$
DECLARE
  n_assegnati int := 0;
BEGIN
  UPDATE negozi n
     SET categoria = m.categoria_ufficiale
    FROM (VALUES
      -- Panificio Rossi → Panificio (attività reale: panetteria)
      ('f3a82af7-dd47-482f-8a49-ea58e692238c', 'Panificio'),
      -- Tech Store 2 → Tech & Elettronica (attività reale: elettronica)
      ('e92a474a-b5bf-4ffe-bda2-d4b9bdf650fa', 'Tech & Elettronica'),
      -- Test Store Vision ×10 → Tech & Elettronica (negozi di test tecnologia)
      ('032618a4-a977-4dc3-a82d-c464ab6b43fe', 'Tech & Elettronica'),
      ('7cdd907d-dbb1-4182-8c35-e42c1e3350dc', 'Tech & Elettronica'),
      ('dbfdd114-619a-49e3-bdbe-ce3894af7e77', 'Tech & Elettronica'),
      ('437b811e-92ac-4f7c-85d5-b1380172c8f1', 'Tech & Elettronica'),
      ('8b1dae3d-75df-421d-b51d-8c4fcbc4000f', 'Tech & Elettronica'),
      ('af93a779-3d88-4cd8-b038-7dabf2731203', 'Tech & Elettronica'),
      ('31ecff8c-b353-461f-b606-ebebbd871ed3', 'Tech & Elettronica'),
      ('f9f8d7a1-1bae-4614-806a-5bb26f45e906', 'Tech & Elettronica'),
      ('04194bcd-72fe-4dd9-9a85-04fc25cc13ce', 'Tech & Elettronica'),
      ('f2809c8a-ef43-458f-b349-fef3eae038cc', 'Tech & Elettronica'),
      -- Fashion Style → Abbigliamento (attività reale: boutique)
      ('1f90b145-3acd-4cc1-b365-dfaac944da6d', 'Abbigliamento')
    ) AS m(negozio_id, categoria_ufficiale)
   WHERE n.id = m.negozio_id;
  GET DIAGNOSTICS n_assegnati = ROW_COUNT;

  RAISE NOTICE 'Normalizzazione: % negozi demo aggiornati', n_assegnati;
END $$;

-- ─── 2) VERIFICA A: nessun negozio orfano (attese 0 righe) ────────────────
-- Ogni negozio deve avere una categoria che corrisponde (uguaglianza esatta
-- case-insensitive) al nome o a un sinonimo di una categoria ufficiale.
SELECT n.categoria AS valore_residuo,
       count(*)    AS num_negozi,
       string_agg(n.nome, ', ' ORDER BY n.nome) AS negozi
  FROM negozi n
 WHERE n.categoria IS NOT NULL
   AND NOT EXISTS (
         SELECT 1
           FROM categorie c
          WHERE lower(trim(n.categoria)) IN (
                  SELECT lower(trim(x))
                    FROM unnest(array_cat(ARRAY[c.nome], coalesce(c.sinonimi, ARRAY[]::text[]))) AS x
                )
       )
 GROUP BY n.categoria
 ORDER BY count(*) DESC;

-- ─── 3) VERIFICA B: per OGNI categoria del catalogo mostra categoria,
--        numero di negozi (totale e VISIBILI = attivi e non nel Cestino)
--        ed elenco dei negozi visibili ──────────────────────────────────────
SELECT c.slug AS categoria,
       count(n.id)                                    AS num_negozi_totali,
       count(n.id) FILTER (WHERE n.attivo AND n.deleted_at IS NULL)
                                                      AS num_visibili,
       coalesce(string_agg(n.nome, ', ' ORDER BY n.nome)
                  FILTER (WHERE n.attivo AND n.deleted_at IS NULL), '') AS elenco_visibili
  FROM categorie c
  LEFT JOIN negozi n
    ON lower(trim(n.categoria)) = lower(trim(c.nome))
 GROUP BY c.slug, c.ordine
 ORDER BY c.ordine;

COMMIT;
