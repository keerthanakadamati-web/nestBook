CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_email text,
  category text NOT NULL,
  description text NOT NULL,
  image_path text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "support read" ON public.support_tickets FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "support create" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (public.has_role(auth.uid(), 'president') OR public.has_role(auth.uid(), 'secretary')));
CREATE POLICY "support resolve" ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "support shots upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'support-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text AND (public.has_role(auth.uid(), 'president') OR public.has_role(auth.uid(), 'secretary')));
CREATE POLICY "support shots read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'support-screenshots' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));