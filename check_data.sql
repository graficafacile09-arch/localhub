SELECT jsonb_typeof(orari), orari FROM public.negozi WHERE orari IS NOT NULL LIMIT 5;
