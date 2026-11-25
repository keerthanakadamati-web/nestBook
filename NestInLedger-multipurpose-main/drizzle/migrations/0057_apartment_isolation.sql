CREATE TABLE public.admin_active_society (
  user_id uuid PRIMARY KEY,
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_active_society TO authenticated;
GRANT ALL ON public.admin_active_society TO service_role;
ALTER TABLE public.admin_active_society ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own active society" ON public.admin_active_society FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.current_society() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    CASE WHEN public.has_role(auth.uid(),'admin') THEN
      COALESCE((SELECT society_id FROM public.admin_active_society WHERE user_id = auth.uid()),
               (SELECT id FROM public.societies WHERE code='s1')) END,
    (SELECT society_id FROM public.society_committee WHERE user_id = auth.uid() ORDER BY created_at LIMIT 1),
    (SELECT society_id FROM public.flats WHERE resident_user_id = auth.uid() ORDER BY created_at LIMIT 1),
    CASE WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('president','secretary','treasurer'))
      THEN (SELECT id FROM public.societies WHERE code='s1') END
  )
$$;
GRANT EXECUTE ON FUNCTION public.current_society() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_active_society(_society uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only Admin can switch apartments' USING ERRCODE='42501'; END IF;
  INSERT INTO public.admin_active_society(user_id, society_id) VALUES (auth.uid(), _society)
  ON CONFLICT (user_id) DO UPDATE SET society_id = EXCLUDED.society_id, updated_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.set_active_society(uuid) TO authenticated;

DO $$
DECLARE t text; s1 uuid := (SELECT id FROM public.societies WHERE code='s1');
BEGIN
  FOREACH t IN ARRAY ARRAY['announcements','expenses','society_polls','society_directory','society_equipment','society_files','gallery_albums','recurring_expenses','change_proposals','financial_reports','support_tickets'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS society_id uuid REFERENCES public.societies(id)', t);
    EXECUTE format('UPDATE public.%I SET society_id = %L WHERE society_id IS NULL', t, s1);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN society_id SET DEFAULT public.current_society()', t);
    EXECUTE format('CREATE POLICY "Same apartment only" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (society_id = public.current_society()) WITH CHECK (society_id = public.current_society())', t);
  END LOOP;
END $$;

CREATE POLICY "Same apartment only" ON public.flats AS RESTRICTIVE FOR ALL TO authenticated
  USING (society_id = public.current_society()) WITH CHECK (society_id = public.current_society());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payments','maintenance_bills','maintenance_reminders','complaints','society_poll_votes'] LOOP
    EXECUTE format('CREATE POLICY "Same apartment only" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.flats f WHERE f.id = flat_id AND f.society_id = public.current_society())) WITH CHECK (EXISTS (SELECT 1 FROM public.flats f WHERE f.id = flat_id AND f.society_id = public.current_society()))', t);
  END LOOP;
END $$;

CREATE POLICY "Labanya settings only" ON public.society_settings AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.current_society() = (SELECT id FROM public.societies WHERE code='s1'))
  WITH CHECK (public.current_society() = (SELECT id FROM public.societies WHERE code='s1'));
CREATE POLICY "Labanya fund only" ON public.fund_years AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.current_society() = (SELECT id FROM public.societies WHERE code='s1'))
  WITH CHECK (public.current_society() = (SELECT id FROM public.societies WHERE code='s1'));

CREATE OR REPLACE VIEW public.finance_accounts WITH (security_barrier=true) AS
 SELECT f.id, f.flat_number, f.resident_name, f.billing_start,
    (s.previous_due + s.current_due) AS outstanding,
    s.billed AS current_month_amount, s.account_status AS status,
    s.current_due AS current_outstanding, s.credit AS advance_credit
   FROM flats f
   CROSS JOIN LATERAL flat_bill_position(f.id, ((now() AT TIME ZONE 'Asia/Kolkata'))::date) s(charged, paid, billed, previous_due, current_due, credit, account_status)
  WHERE has_permission('finance.read') AND f.society_id = public.current_society();

INSERT INTO public.user_roles(user_id, role)
SELECT sc.user_id, sc.role::app_role FROM public.society_committee sc
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = sc.user_id AND r.role = sc.role::app_role);