ALTER TABLE public.flat_registrations ADD COLUMN IF NOT EXISTS owner_email text CHECK (owner_email IS NULL OR (length(owner_email) <= 200 AND owner_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'));

CREATE OR REPLACE FUNCTION public.submit_flat_registration(_slug text, _v jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid; recent int;
BEGIN
  SELECT id INTO sid FROM public.societies WHERE lower(slug) = lower(btrim(_slug)) AND status <> 'inactive';
  IF sid IS NULL THEN RAISE EXCEPTION 'Apartment not found.'; END IF;
  SELECT count(*) INTO recent FROM public.flat_registrations WHERE society_id = sid AND created_at > now() - interval '1 hour';
  IF recent >= 200 THEN RAISE EXCEPTION 'Too many submissions. Please try later.'; END IF;
  INSERT INTO public.flat_registrations (society_id, flat_number, floor, owner_name, mobile, owner_email, occupancy, tenant_name, tenant_phone, parking_slot, vehicle_type, vehicle_numbers, house_tax_number, aadhaar_number)
  VALUES (sid, btrim(_v->>'flat_number'), nullif(btrim(_v->>'floor'),''), btrim(_v->>'owner_name'), btrim(_v->>'mobile'),
    nullif(lower(btrim(_v->>'owner_email')),''),
    CASE WHEN _v->>'occupancy' = 'rented' THEN 'rented' ELSE 'owner' END,
    CASE WHEN _v->>'occupancy' = 'rented' THEN nullif(btrim(_v->>'tenant_name'),'') END,
    CASE WHEN _v->>'occupancy' = 'rented' THEN nullif(btrim(_v->>'tenant_phone'),'') END,
    nullif(btrim(_v->>'parking_slot'),''), nullif(_v->>'vehicle_type',''), nullif(btrim(_v->>'vehicle_numbers'),''),
    nullif(btrim(_v->>'house_tax_number'),''), regexp_replace(coalesce(_v->>'aadhaar_number',''), '\s', '', 'g'));
END $$;
REVOKE ALL ON FUNCTION public.submit_flat_registration(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_flat_registration(text, jsonb) TO anon, authenticated;