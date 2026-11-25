CREATE TABLE public.maintenance_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flat_id uuid NOT NULL REFERENCES public.flats(id) ON DELETE CASCADE,
  reminder_date date NOT NULL,
  amount_due numeric NOT NULL,
  status text NOT NULL DEFAULT 'recorded',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flat_id, reminder_date)
);
COMMENT ON TABLE public.maintenance_reminders IS 'Reminder records only; no message is sent. status: recorded (not sent).';
GRANT SELECT ON public.maintenance_reminders TO authenticated;
GRANT ALL ON public.maintenance_reminders TO service_role;
ALTER TABLE public.maintenance_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read reminders" ON public.maintenance_reminders
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.record_maintenance_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  n integer;
BEGIN
  IF extract(day FROM today) < 4 THEN RETURN 0; END IF;
  INSERT INTO public.maintenance_reminders (flat_id, reminder_date, amount_due)
  SELECT fa.id, today, fa.outstanding
  FROM public.flat_accounts fa
  WHERE fa.id IS NOT NULL AND coalesce(fa.outstanding, 0) > 0
  ON CONFLICT (flat_id, reminder_date) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.record_maintenance_reminders() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;