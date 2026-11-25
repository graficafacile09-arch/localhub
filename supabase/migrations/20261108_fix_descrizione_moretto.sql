begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIX — scheda del Moretto del Pollino
--
-- Il moretto NON è un formaggio: è un fungo di sottobosco della macchia
-- mediterranea. La scheda del prodotto riportava la descrizione lunga di un
-- formaggio da taglio e la sottocategoria «Formaggi» del seed: qui viene
-- riallineata a fungo. Anche la descrizione delle confetture lo elencava tra i
-- formaggi stagionati («come il pecorino e il moretto»): la citazione erronea
-- viene rimossa. Idempotente: nessun DELETE, solo UPDATE.
-- ═══════════════════════════════════════════════════════════════════════════

update public.prodotti
set descrizione = $$Fungo di sottobosco della macchia mediterranea, da contorno e da condimento. Al kg.$$,
    descrizione_completa = $$Il moretto è un fungo di sottobosco che cresce nella macchia mediterranea e nei boschi radi del Pollino, dove si raccoglie in autunno. Ha cappello bruno e carne soda, con profumo di terra e un sapore pieno che regge la cottura: si cucina trifolato in padella con aglio e prezzemolo, si aggiunge al ragù o si conserva sott'olio. Si serve come contorno o per condire la pasta. Prezzo indicativo al chilogrammo.$$,
    sottocategoria = $$Funghi$$,
    updated_at = now()
-- Il matching per slug da solo non bastava: la scheda può essere stata
-- aggiornata da un percorso che non scrive lo slug, lasciando la colonna a NULL
-- (e con essa il prodotto invisibile alla ricerca per categoria «funghi»).
where slug = 'moretto-del-pollino'
   or lower(nome) like $$%moretto%$$;

update public.prodotti
set descrizione_completa = replace(
      descrizione_completa,
      $$come il pecorino e il moretto$$,
      $$come il pecorino$$
    ),
    updated_at = now()
where slug = 'confetture-del-pollino'
  and descrizione_completa like $$%come il pecorino e il moretto%$$;

commit;
