CREATE TABLE public.societies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name text NOT NULL,
  city text,
  total_flats integer NOT NULL DEFAULT 0 CHECK (total_flats >= 0 AND total_flats <= 5000),
  president_name text,
  president_email text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.societies TO authenticated;
GRANT ALL ON public.societies TO service_role;
ALTER TABLE public.societies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads societies" ON public.societies FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin adds societies" ON public.societies FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin edits societies" ON public.societies FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.societies (code, slug, name, city, total_flats)
SELECT 's1', 'labanya', coalesce((SELECT society_name FROM public.society_settings WHERE id = true), 'Labanya Enclave'), NULL, (SELECT count(*) FROM public.flats)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.flats
  ADD COLUMN IF NOT EXISTS society_id uuid REFERENCES public.societies(id),
  ADD COLUMN IF NOT EXISTS floor text,
  ADD COLUMN IF NOT EXISTS parking_slot text,
  ADD COLUMN IF NOT EXISTS vehicle_type text CHECK (vehicle_type IS NULL OR vehicle_type IN ('none','2-wheeler','4-wheeler','both')),
  ADD COLUMN IF NOT EXISTS vehicle_numbers text,
  ADD COLUMN IF NOT EXISTS house_tax_number text,
  ADD COLUMN IF NOT EXISTS aadhaar_number text CHECK (aadhaar_number IS NULL OR aadhaar_number ~ '^[0-9]{12}$');

UPDATE public.flats SET society_id = (SELECT id FROM public.societies WHERE code = 's1') WHERE society_id IS NULL;
ALTER TABLE public.flats ALTER COLUMN society_id SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;
ALTER TABLE public.flats ALTER COLUMN society_id DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.default_flat_society() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF new.society_id IS NULL THEN
    SELECT id INTO new.society_id FROM public.societies WHERE code = 's1';
  END IF;
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS default_flat_society ON public.flats;
CREATE TRIGGER default_flat_society BEFORE INSERT ON public.flats FOR EACH ROW EXECUTE FUNCTION public.default_flat_society();

CREATE OR REPLACE FUNCTION public.society_flat_counts() RETURNS TABLE(society_id uuid, flats bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT f.society_id, count(*) FROM public.flats f WHERE public.has_role(auth.uid(), 'admin') GROUP BY f.society_id
$$;
GRANT EXECUTE ON FUNCTION public.society_flat_counts() TO authenticated;