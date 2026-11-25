CREATE FUNCTION public.sync_existing_reminder_timing() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE local_now timestamp; next_local timestamp; utc_run timestamp; BEGIN
local_now:=now() AT TIME ZONE NEW.reminder_timezone;
next_local:=local_now::date+NEW.reminder_time;
IF next_local<=local_now THEN next_local:=next_local+interval '1 day'; END IF;
utc_run:=(next_local AT TIME ZONE NEW.reminder_timezone) AT TIME ZONE 'UTC';
PERFORM cron.alter_job(1,schedule:=extract(minute FROM utc_run)::int||' '||extract(hour FROM utc_run)::int||' * * *');
RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.sync_existing_reminder_timing() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_existing_reminder_timing AFTER UPDATE OF reminder_time,reminder_timezone ON public.society_settings FOR EACH ROW EXECUTE FUNCTION public.sync_existing_reminder_timing();