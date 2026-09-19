-- Rimuove il bonifico bancario ordinario dal catalogo operativo di InCittà.
-- Le righe storiche in public.ordini restano intatte: sono dati contabili/storici.
-- Vengono rimossi solo configurazioni ancora attive/configurabili del metodo
-- ordinario e le relative credenziali provider legacy.
delete from public.negozio_metodi_pagamento
where metodo = 'bonifico';

delete from public.negozio_pagamenti
where provider = 'bonifico';
