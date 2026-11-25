CREATE TABLE public.society_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  category text NOT NULL DEFAULT 'General',
  vendor text,
  valid_until date,
  notes text,
  file_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.society_files TO authenticated;
GRANT ALL ON public.society_files TO service_role;
ALTER TABLE public.society_files ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS mandatory_committee_approval ON public.society_files;

CREATE OR REPLACE FUNCTION public.can_manage_society_files() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'president')
      OR public.has_role(auth.uid(),'secretary') OR public.has_role(auth.uid(),'treasurer')
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_society_files() TO authenticated;

CREATE POLICY "Signed-in users read society files" ON public.society_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Committee uploads society files" ON public.society_files FOR INSERT TO authenticated WITH CHECK (public.can_manage_society_files() AND uploaded_by = auth.uid());
CREATE POLICY "Committee deletes society files" ON public.society_files FOR DELETE TO authenticated USING (public.can_manage_society_files());

CREATE POLICY "Signed-in read society-documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'society-documents');
CREATE POLICY "Committee upload society-documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'society-documents' AND public.can_manage_society_files());
CREATE POLICY "Committee delete society-documents" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'society-documents' AND public.can_manage_society_files());