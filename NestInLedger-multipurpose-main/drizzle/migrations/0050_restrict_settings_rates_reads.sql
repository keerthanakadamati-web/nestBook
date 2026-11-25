DROP POLICY IF EXISTS "Everyone signed in can read settings" ON public.society_settings;
CREATE POLICY "Society members can read settings" ON public.society_settings FOR SELECT TO authenticated USING (public.is_society_member());
DROP POLICY IF EXISTS "Signed in read approved maintenance rates" ON public.maintenance_rates;
CREATE POLICY "Society members read approved maintenance rates" ON public.maintenance_rates FOR SELECT TO authenticated USING (public.is_society_member());