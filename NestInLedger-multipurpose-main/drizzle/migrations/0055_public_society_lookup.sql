CREATE OR REPLACE FUNCTION public.society_public_info(_slug text)
RETURNS TABLE(slug text, code text, name text, city text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.slug, s.code, s.name, s.city FROM public.societies s
  WHERE s.status = 'active' AND (lower(s.slug) = lower(btrim(_slug)) OR lower(s.code) = lower(btrim(_slug)))
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.society_public_info(text) FROM public;
GRANT EXECUTE ON FUNCTION public.society_public_info(text) TO anon, authenticated;