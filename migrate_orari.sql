ALTER TABLE public.negozi ALTER COLUMN orari TYPE jsonb USING CASE WHEN orari IS NULL OR trim(orari) = '' THEN NULL ELSE orari::jsonb END;
