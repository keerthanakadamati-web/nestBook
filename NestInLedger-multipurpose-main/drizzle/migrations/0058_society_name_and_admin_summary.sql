CREATE OR REPLACE FUNCTION public.my_society() RETURNS TABLE(id uuid, code text, slug text, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.id, s.code, s.slug, s.name FROM public.societies s WHERE s.id = public.current_society()
$$;
GRANT EXECUTE ON FUNCTION public.my_society() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_platform_summary() RETURNS TABLE(societies bigint, open_tickets bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT (SELECT count(*) FROM public.societies), (SELECT count(*) FROM public.support_tickets WHERE status <> 'resolved');
END $$;
GRANT EXECUTE ON FUNCTION public.admin_platform_summary() TO authenticated;