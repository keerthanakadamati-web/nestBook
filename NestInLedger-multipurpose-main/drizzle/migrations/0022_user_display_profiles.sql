CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own or committee profiles" ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission('admin.read'));
CREATE POLICY "Create own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Update own or committee profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_permission('admin.write'))
  WITH CHECK (user_id = auth.uid() OR public.has_permission('admin.write'));
INSERT INTO public.profiles (user_id, full_name)
SELECT DISTINCT resident_user_id, resident_name FROM public.flats
WHERE resident_user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;