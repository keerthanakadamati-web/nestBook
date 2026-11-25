CREATE OR REPLACE FUNCTION public.record_and_email_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  n := public.record_maintenance_reminders();
  PERFORM net.http_post(
    url := 'https://project--0fd07ec0-305c-47b1-a041-c1113df57b56.lovable.app/api/public/hooks/reminder-emails',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT token FROM public.internal_tokens WHERE name='email_hook')),
    body := '{}'::jsonb
  );
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.record_and_email_reminders() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('record-maintenance-reminders', '30 4 * * *', 'SELECT public.record_and_email_reminders();');