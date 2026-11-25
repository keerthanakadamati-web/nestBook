CREATE OR REPLACE FUNCTION public.update_my_flat_details(_flat_id uuid, _mobile text, _floor text, _parking_slot text, _vehicle_type text, _vehicle_numbers text, _house_tax_number text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in'; END IF;
  IF coalesce(btrim(_mobile),'') !~ '^[6-9][0-9]{9}$' THEN RAISE EXCEPTION 'Mobile must be 10 digits'; END IF;
  IF _vehicle_type IS NOT NULL AND _vehicle_type <> '' AND _vehicle_type NOT IN ('none','2-wheeler','4-wheeler','both') THEN RAISE EXCEPTION 'Invalid vehicle type'; END IF;
  IF length(coalesce(_floor,'')) > 20 OR length(coalesce(_parking_slot,'')) > 30 OR length(coalesce(_vehicle_numbers,'')) > 120 OR length(coalesce(_house_tax_number,'')) > 40 THEN RAISE EXCEPTION 'Value too long'; END IF;
  PERFORM set_config('app.approved_change', 'on', true);
  UPDATE public.flats SET mobile = btrim(_mobile), floor = nullif(btrim(_floor),''), parking_slot = nullif(btrim(_parking_slot),''),
    vehicle_type = nullif(_vehicle_type,''), vehicle_numbers = nullif(upper(btrim(_vehicle_numbers)),''), house_tax_number = nullif(btrim(_house_tax_number),'')
  WHERE id = _flat_id AND resident_user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'This flat is not linked to your account'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.update_my_flat_details(uuid,text,text,text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_my_flat_details(uuid,text,text,text,text,text,text) TO authenticated;