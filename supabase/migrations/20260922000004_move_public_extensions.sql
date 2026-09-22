-- Keep extension objects out of the exposed public schema.
-- The semantic search function explicitly includes extensions in its search_path.
create schema if not exists extensions;

alter extension pg_trgm set schema extensions;
alter extension unaccent set schema extensions;

alter function public.cerca_negozi_semantico(
  text[], text, text, text, integer, integer
)
set search_path = public, extensions;
