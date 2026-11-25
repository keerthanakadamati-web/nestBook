ALTER POLICY "Residents read own flat" ON public.flats USING (
 resident_user_id=auth.uid() AND NOT EXISTS (
 SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='treasurer'
 ));