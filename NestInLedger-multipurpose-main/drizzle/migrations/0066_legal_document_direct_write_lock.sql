REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.legal_documents FROM authenticated, anon;
REVOKE SELECT ON public.legal_documents FROM anon;
GRANT SELECT ON public.legal_documents TO authenticated;