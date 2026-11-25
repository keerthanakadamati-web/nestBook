CREATE TABLE public.society_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  category text NOT NULL CHECK (category IN ('emergency','technician','utility','committee','other')),
  phone text NOT NULL CHECK (phone ~ '^[0-9+ -]{3,20}$'),
  role_note text CHECK (role_note IS NULL OR length(role_note) <= 200),
  availability text NOT NULL DEFAULT 'daytime' CHECK (availability IN ('24x7','daytime')),
  contract_no text CHECK (contract_no IS NULL OR length(contract_no) <= 80),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.society_directory TO authenticated;
GRANT ALL ON public.society_directory TO service_role;
ALTER TABLE public.society_directory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read directory" ON public.society_directory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Committee manages directory" ON public.society_directory FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'president') OR public.has_role(auth.uid(),'secretary'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'president') OR public.has_role(auth.uid(),'secretary'));
DROP TRIGGER IF EXISTS mandatory_committee_approval ON public.society_directory;