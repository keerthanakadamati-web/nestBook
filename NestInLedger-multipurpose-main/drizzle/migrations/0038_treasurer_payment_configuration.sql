CREATE OR REPLACE FUNCTION public.set_payment_configuration(_upi_id text, _payee_name text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (public.has_role(auth.uid(),'treasurer') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Only the Treasurer can change payment configuration' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.decision_ok','on',true);
 UPDATE public.society_settings SET upi_id=trim(_upi_id), payee_name=trim(_payee_name) WHERE id=true;
 PERFORM set_config('app.decision_ok','off',true);
END $$;
REVOKE ALL ON FUNCTION public.set_payment_configuration(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_payment_configuration(text,text) TO authenticated;