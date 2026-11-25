REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.user_terms_acceptance FROM authenticated;
REVOKE ALL ON public.user_terms_acceptance FROM anon;
GRANT SELECT ON public.user_terms_acceptance TO authenticated;