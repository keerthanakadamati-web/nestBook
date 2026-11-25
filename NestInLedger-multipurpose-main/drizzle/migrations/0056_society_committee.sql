CREATE TABLE public.society_committee (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('president','secretary','treasurer')),
  full_name text,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (society_id, role)
);
GRANT SELECT ON public.society_committee TO authenticated;
GRANT ALL ON public.society_committee TO service_role;
ALTER TABLE public.society_committee ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads society committee" ON public.society_committee FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));