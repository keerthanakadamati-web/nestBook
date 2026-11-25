DROP INDEX IF EXISTS public.flats_canonical_number;
ALTER TABLE public.flats DROP CONSTRAINT IF EXISTS flats_flat_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS flats_society_canonical_number ON public.flats (society_id, lower(btrim(flat_number)));

CREATE OR REPLACE FUNCTION public.enforce_flat_capacity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s1 uuid; lim integer; n integer;
BEGIN
  SELECT id INTO s1 FROM public.societies WHERE code = 's1';
  IF TG_OP = 'INSERT' THEN
    IF NEW.society_id IS NULL OR NEW.society_id = s1 THEN
      UPDATE public.flat_capacity SET used = used + 1 WHERE id AND used < 15;
      IF NOT FOUND THEN RAISE EXCEPTION 'All 15 authorized flats are already registered. A 16th flat is not allowed.' USING ERRCODE = '23514'; END IF;
    ELSE
      SELECT total_flats INTO lim FROM public.societies WHERE id = NEW.society_id FOR UPDATE;
      SELECT count(*) INTO n FROM public.flats WHERE society_id = NEW.society_id;
      IF n >= coalesce(lim, 0) THEN RAISE EXCEPTION 'This society already has all % flats added.', lim USING ERRCODE = '23514'; END IF;
    END IF;
    RETURN NEW;
  ELSE
    IF OLD.society_id IS NULL OR OLD.society_id = s1 THEN UPDATE public.flat_capacity SET used = used - 1 WHERE id; END IF;
    RETURN OLD;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.import_society_flats(_society uuid, _rows jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb; added int := 0; updated int := 0; fid uuid; occ text; vt text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only the Admin can upload flats.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.societies WHERE id = _society) THEN RAISE EXCEPTION 'Society not found.'; END IF;
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) > 5000 THEN RAISE EXCEPTION 'Invalid file.'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    occ := CASE WHEN lower(r->>'occupancy') = 'tenant' THEN 'rented' ELSE 'owner' END;
    vt := nullif(r->>'vehicle_type', '');
    fid := NULL;
    SELECT id INTO fid FROM public.flats WHERE society_id = _society AND lower(btrim(flat_number)) = lower(btrim(r->>'flat_number'));
    IF fid IS NULL THEN
      INSERT INTO public.flats (society_id, flat_number, resident_name, mobile, occupancy, tenant_name, floor, parking_slot, vehicle_type, vehicle_numbers, house_tax_number, aadhaar_number)
      VALUES (_society, btrim(r->>'flat_number'), r->>'owner_name', coalesce(r->>'mobile', ''), occ, nullif(r->>'tenant_name', ''), nullif(r->>'floor', ''), nullif(r->>'parking_slot', ''), vt, nullif(r->>'vehicle_numbers', ''), nullif(r->>'house_tax_number', ''), r->>'aadhaar_number');
      added := added + 1;
    ELSE
      UPDATE public.flats SET resident_name = r->>'owner_name', mobile = coalesce(nullif(r->>'mobile', ''), mobile), occupancy = occ, tenant_name = nullif(r->>'tenant_name', ''), floor = nullif(r->>'floor', ''), parking_slot = nullif(r->>'parking_slot', ''), vehicle_type = vt, vehicle_numbers = nullif(r->>'vehicle_numbers', ''), house_tax_number = nullif(r->>'house_tax_number', ''), aadhaar_number = r->>'aadhaar_number' WHERE id = fid;
      updated := updated + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('added', added, 'updated', updated);
END $$;
REVOKE ALL ON FUNCTION public.import_society_flats(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.import_society_flats(uuid, jsonb) TO authenticated;