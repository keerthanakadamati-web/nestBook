CREATE TABLE public.society_board (
  society_id uuid PRIMARY KEY REFERENCES public.societies(id) ON DELETE CASCADE,
  association_name text NOT NULL DEFAULT '',
  registration_details text NOT NULL DEFAULT '',
  office_address text NOT NULL DEFAULT '',
  meeting_date date,
  term text NOT NULL DEFAULT '',
  members jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(members) = 'array' AND jsonb_array_length(members) <= 60),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.society_board TO authenticated;
GRANT ALL ON public.society_board TO service_role;
ALTER TABLE public.society_board ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS mandatory_committee_approval ON public.society_board;
CREATE POLICY "Members read their board" ON public.society_board FOR SELECT TO authenticated USING (society_id = public.current_society());
CREATE POLICY "President inserts board" ON public.society_board FOR INSERT TO authenticated
  WITH CHECK (society_id = public.current_society() AND (public.has_role(auth.uid(),'president') OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "President updates board" ON public.society_board FOR UPDATE TO authenticated
  USING (society_id = public.current_society() AND (public.has_role(auth.uid(),'president') OR public.has_role(auth.uid(),'admin')))
  WITH CHECK (society_id = public.current_society());

CREATE TABLE public.flat_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  flat_number text NOT NULL CHECK (length(btrim(flat_number)) BETWEEN 1 AND 20),
  floor text CHECK (length(floor) <= 20),
  owner_name text NOT NULL CHECK (length(btrim(owner_name)) BETWEEN 1 AND 100),
  mobile text NOT NULL CHECK (mobile ~ '^[6-9][0-9]{9}$'),
  occupancy text NOT NULL CHECK (occupancy IN ('owner','rented')),
  tenant_name text CHECK (length(tenant_name) <= 100),
  tenant_phone text CHECK (tenant_phone IS NULL OR tenant_phone ~ '^[6-9][0-9]{9}$'),
  parking_slot text CHECK (length(parking_slot) <= 30),
  vehicle_type text CHECK (vehicle_type IS NULL OR vehicle_type IN ('none','2-wheeler','4-wheeler','both')),
  vehicle_numbers text CHECK (length(vehicle_numbers) <= 120),
  house_tax_number text CHECK (length(house_tax_number) <= 40),
  aadhaar_number text NOT NULL CHECK (aadhaar_number ~ '^[0-9]{12}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','imported','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.flat_registrations TO authenticated;
GRANT ALL ON public.flat_registrations TO service_role;
ALTER TABLE public.flat_registrations ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS mandatory_committee_approval ON public.flat_registrations;
CREATE POLICY "Committee reads registrations" ON public.flat_registrations FOR SELECT TO authenticated
  USING (society_id = public.current_society() AND (public.has_role(auth.uid(),'president') OR public.has_role(auth.uid(),'secretary') OR public.has_role(auth.uid(),'admin')));

CREATE OR REPLACE FUNCTION public.submit_flat_registration(_slug text, _v jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid; recent int;
BEGIN
  SELECT id INTO sid FROM public.societies WHERE lower(slug) = lower(btrim(_slug)) AND status <> 'inactive';
  IF sid IS NULL THEN RAISE EXCEPTION 'Apartment not found.'; END IF;
  SELECT count(*) INTO recent FROM public.flat_registrations WHERE society_id = sid AND created_at > now() - interval '1 hour';
  IF recent >= 200 THEN RAISE EXCEPTION 'Too many submissions. Please try later.'; END IF;
  INSERT INTO public.flat_registrations (society_id, flat_number, floor, owner_name, mobile, occupancy, tenant_name, tenant_phone, parking_slot, vehicle_type, vehicle_numbers, house_tax_number, aadhaar_number)
  VALUES (sid, btrim(_v->>'flat_number'), nullif(btrim(_v->>'floor'),''), btrim(_v->>'owner_name'), btrim(_v->>'mobile'),
    CASE WHEN _v->>'occupancy' = 'rented' THEN 'rented' ELSE 'owner' END,
    CASE WHEN _v->>'occupancy' = 'rented' THEN nullif(btrim(_v->>'tenant_name'),'') END,
    CASE WHEN _v->>'occupancy' = 'rented' THEN nullif(btrim(_v->>'tenant_phone'),'') END,
    nullif(btrim(_v->>'parking_slot'),''), nullif(_v->>'vehicle_type',''), nullif(btrim(_v->>'vehicle_numbers'),''),
    nullif(btrim(_v->>'house_tax_number'),''), regexp_replace(coalesce(_v->>'aadhaar_number',''), '\s', '', 'g'));
END $$;
REVOKE ALL ON FUNCTION public.submit_flat_registration(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_flat_registration(text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.decide_flat_registration(_id uuid, _import boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.flat_registrations; fid uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'president') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Only the President can add submitted flats.'; END IF;
  SELECT * INTO r FROM public.flat_registrations WHERE id = _id AND society_id = public.current_society() AND status = 'pending' FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Submission not found or already handled.'; END IF;
  IF _import THEN
    SELECT id INTO fid FROM public.flats WHERE society_id = r.society_id AND lower(btrim(flat_number)) = lower(btrim(r.flat_number));
    IF fid IS NULL THEN
      INSERT INTO public.flats (society_id, flat_number, resident_name, mobile, occupancy, tenant_name, tenant_phone, floor, parking_slot, vehicle_type, vehicle_numbers, house_tax_number, aadhaar_number)
      VALUES (r.society_id, r.flat_number, r.owner_name, r.mobile, r.occupancy, r.tenant_name, r.tenant_phone, r.floor, r.parking_slot, r.vehicle_type, r.vehicle_numbers, r.house_tax_number, r.aadhaar_number);
    ELSE
      UPDATE public.flats SET resident_name = r.owner_name, mobile = r.mobile, occupancy = r.occupancy, tenant_name = r.tenant_name, tenant_phone = r.tenant_phone, floor = r.floor, parking_slot = r.parking_slot, vehicle_type = r.vehicle_type, vehicle_numbers = r.vehicle_numbers, house_tax_number = r.house_tax_number, aadhaar_number = r.aadhaar_number WHERE id = fid;
    END IF;
  END IF;
  UPDATE public.flat_registrations SET status = CASE WHEN _import THEN 'imported' ELSE 'rejected' END WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.decide_flat_registration(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.decide_flat_registration(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.society_public_name(_slug text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT name FROM public.societies WHERE lower(slug) = lower(btrim(_slug)) AND status <> 'inactive' LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.society_public_name(text) TO anon, authenticated;