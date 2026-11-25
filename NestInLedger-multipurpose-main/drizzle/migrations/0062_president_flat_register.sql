CREATE OR REPLACE FUNCTION public.president_flat_register()
RETURNS TABLE(id uuid, flat_number text, floor text, resident_name text, mobile text, owner_email text, occupancy text, tenant_name text, tenant_phone text, tenant_email text, parking_slot text, vehicle_type text, vehicle_numbers text, house_tax_number text, aadhaar_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'president') THEN RAISE EXCEPTION 'Only the President can view the full flat register.'; END IF;
  RETURN QUERY SELECT f.id, f.flat_number, f.floor, f.resident_name, f.mobile, u.email::text, f.occupancy, f.tenant_name, f.tenant_phone, f.tenant_email, f.parking_slot, f.vehicle_type, f.vehicle_numbers, f.house_tax_number, f.aadhaar_number
    FROM public.flats f LEFT JOIN auth.users u ON u.id = f.resident_user_id
    WHERE f.society_id = public.current_society() ORDER BY f.flat_number;
END $$;
REVOKE ALL ON FUNCTION public.president_flat_register() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.president_flat_register() TO authenticated;