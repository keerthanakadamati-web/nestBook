CREATE TABLE public.society_license (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  expires_on date NOT NULL DEFAULT (current_date + interval '1 year')::date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.license_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_expires_on date NOT NULL,
  new_expires_on date NOT NULL,
  note text,
  renewed_by uuid NOT NULL,
  renewed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.society_license TO authenticated;
GRANT SELECT ON public.license_renewals TO authenticated;
GRANT ALL ON public.society_license, public.license_renewals TO service_role;
ALTER TABLE public.society_license ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_renewals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in can read license" ON public.society_license FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin reads renewals" ON public.license_renewals FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.society_license (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.renew_license(_new_date date, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only the Admin can renew the website.'; END IF;
  IF _new_date IS NULL OR _new_date < current_date THEN RAISE EXCEPTION 'Choose a future date.'; END IF;
  SELECT expires_on INTO _old FROM public.society_license WHERE id FOR UPDATE;
  UPDATE public.society_license SET expires_on = _new_date, updated_at = now() WHERE id;
  INSERT INTO public.license_renewals (old_expires_on, new_expires_on, note, renewed_by) VALUES (_old, _new_date, nullif(trim(_note), ''), auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.renew_license(date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.renew_license(date, text) TO authenticated;