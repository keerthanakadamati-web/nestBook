CREATE OR REPLACE FUNCTION public.update_my_tenant(_occupancy text, _tenant_name text, _tenant_phone text, _tenant_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in'; END IF;
  IF _occupancy NOT IN ('owner','rented') THEN RAISE EXCEPTION 'Invalid occupancy'; END IF;
  IF _occupancy = 'rented' AND (coalesce(trim(_tenant_name),'') = '' OR coalesce(trim(_tenant_phone),'') = '') THEN
    RAISE EXCEPTION 'Please enter tenant name and mobile number';
  END IF;
  UPDATE public.flats SET
    occupancy = _occupancy,
    tenant_name = CASE WHEN _occupancy='rented' THEN nullif(trim(_tenant_name),'') END,
    tenant_phone = CASE WHEN _occupancy='rented' THEN nullif(trim(_tenant_phone),'') END,
    tenant_email = CASE WHEN _occupancy='rented' THEN nullif(trim(_tenant_email),'') END
  WHERE resident_user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'No flat linked to your account'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.update_my_tenant(text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_my_tenant(text,text,text,text) TO authenticated;