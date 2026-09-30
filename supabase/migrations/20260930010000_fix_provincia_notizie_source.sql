-- The Provincia di Cosenza RSS endpoint is no longer available.
-- Use the institutional homepage, which still exposes the news links consumed by parseProvinciaNotizie.
update public.notizie_fonti
set url_feed = null,
    url_lista = 'https://www.provincia.cs.it/portale/'
where id = 'a0000000-0000-4000-8000-000000000002';
