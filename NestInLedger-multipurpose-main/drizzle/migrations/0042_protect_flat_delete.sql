CREATE OR REPLACE FUNCTION public.protect_flat_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payments WHERE flat_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.maintenance_bills WHERE flat_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.complaints WHERE flat_id = OLD.id) THEN
    RAISE EXCEPTION 'This flat has payments, bills or complaints, so it cannot be deleted. Use Edit to change the owner details instead.' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS protect_flat_delete ON public.flats;
CREATE TRIGGER protect_flat_delete BEFORE DELETE ON public.flats FOR EACH ROW EXECUTE FUNCTION public.protect_flat_delete();