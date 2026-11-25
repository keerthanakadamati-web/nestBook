CREATE TABLE public.user_terms_acceptance (
 user_id uuid NOT NULL,
 terms_version text NOT NULL,
 terms_text text NOT NULL,
 terms_hash text NOT NULL,
 email text NOT NULL,
 society_id uuid REFERENCES public.societies(id),
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (user_id, terms_version)
);
GRANT SELECT ON public.user_terms_acceptance TO authenticated;
GRANT ALL ON public.user_terms_acceptance TO service_role;
ALTER TABLE public.user_terms_acceptance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own acknowledgment or Admin read" ON public.user_terms_acceptance FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
-- Personal acknowledgment is an operational RPC-only write, not a committee metadata edit.
DROP TRIGGER IF EXISTS mandatory_committee_approval ON public.user_terms_acceptance;
CREATE FUNCTION public.pilot_terms_document() RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $fn$
 SELECT jsonb_build_object('version', 'v1.0-pilot', 'title', 'Pilot Evaluation Agreement & Privacy Acknowledgment', 'text', $terms$1. Pilot testing
NestInLedger is in pilot mode. You acknowledge that you are using this application for testing and evaluation. Features may change, and errors or interruptions may occur.

2. Privacy and society records
Platform operators and developers commit not to access, inspect, extract or share your society's private records. The application processes and stores information to provide its services. Authorized society users can access records according to their assigned roles. This commitment is not a claim that technical access is impossible.

3. Authorized use
You confirm that you are authorized to use your society's account. Keep your login details private and notify your society if you suspect unauthorized access. Enter only information you are authorized to provide.

4. Evaluation and financial responsibility
The application is provided on an as-is pilot evaluation basis. Verify calculations and payment records against bank statements. Your society remains responsible for official accounts, audits, statutory filings and maintaining appropriate backups. Nothing in these terms limits rights or responsibilities that cannot lawfully be excluded.

5. Acknowledgment record
By selecting the checkbox and choosing Accept & Continue, you confirm that you have read, understood and accepted these terms. We record your account identity, society where available, the terms version and exact wording, and acceptance time. Only the platform Admin can download the acknowledgment register. Updated terms require a new acceptance.$terms$)
$fn$;
REVOKE ALL ON FUNCTION public.pilot_terms_document() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pilot_terms_document() TO authenticated;
CREATE FUNCTION public.pilot_terms_status() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE doc jsonb; accepted timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 doc := public.pilot_terms_document();
 SELECT accepted_at INTO accepted FROM public.user_terms_acceptance WHERE user_id = auth.uid() AND terms_version = doc->>'version';
 RETURN doc || jsonb_build_object('accepted_at', accepted);
END $fn$;
REVOKE ALL ON FUNCTION public.pilot_terms_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pilot_terms_status() TO authenticated;
CREATE FUNCTION public.accept_pilot_terms(_version text, _acknowledged boolean) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $fn$
DECLARE doc jsonb; accepted timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF _acknowledged IS DISTINCT FROM true THEN RAISE EXCEPTION 'Please acknowledge the terms'; END IF;
 doc := public.pilot_terms_document();
 IF _version IS DISTINCT FROM doc->>'version' THEN RAISE EXCEPTION 'Terms have changed. Please reload and review them.'; END IF;
 INSERT INTO public.user_terms_acceptance(user_id, terms_version, terms_text, terms_hash, email, society_id)
 VALUES(auth.uid(), doc->>'version', doc->>'text', encode(extensions.digest(doc->>'text','sha256'),'hex'), coalesce(auth.jwt()->>'email',''), public.current_society())
 ON CONFLICT (user_id, terms_version) DO NOTHING;
 SELECT accepted_at INTO accepted FROM public.user_terms_acceptance WHERE user_id = auth.uid() AND terms_version = doc->>'version';
 RETURN accepted;
END $fn$;
REVOKE ALL ON FUNCTION public.accept_pilot_terms(text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_pilot_terms(text,boolean) TO authenticated;
CREATE FUNCTION public.export_pilot_acknowledgments() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only Admin can download acknowledgments'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.accepted_at DESC) FROM (SELECT a.*, s.code AS society_code, s.name AS society_name FROM public.user_terms_acceptance a LEFT JOIN public.societies s ON s.id = a.society_id) r), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.export_pilot_acknowledgments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_pilot_acknowledgments() TO authenticated;