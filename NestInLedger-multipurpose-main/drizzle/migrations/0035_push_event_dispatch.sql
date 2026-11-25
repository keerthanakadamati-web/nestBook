CREATE OR REPLACE FUNCTION public.queue_push_event(_kind text, _id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://project--0fd07ec0-305c-47b1-a041-c1113df57b56.lovable.app/api/public/hooks/push-event',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(SELECT token FROM public.internal_tokens WHERE name='email_hook')),
    body := jsonb_build_object('kind', _kind, 'id', _id));
EXCEPTION WHEN OTHERS THEN NULL; -- a notification problem must never block the real change
END $$;
REVOKE ALL ON FUNCTION public.queue_push_event(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.push_on_proposal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN PERFORM public.queue_push_event('proposal_pending', NEW.id::text);
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status <> 'pending' THEN PERFORM public.queue_push_event('proposal_decided', NEW.id::text);
  END IF; RETURN NEW;
END $$;
CREATE TRIGGER push_proposal_alerts AFTER INSERT OR UPDATE OF status ON public.change_proposals FOR EACH ROW EXECUTE FUNCTION public.push_on_proposal();

CREATE OR REPLACE FUNCTION public.push_on_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pending' AND TG_OP = 'INSERT' THEN PERFORM public.queue_push_event('payment_pending', NEW.id::text);
  ELSIF NEW.status IN ('confirmed','rejected') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN PERFORM public.queue_push_event('payment_'||NEW.status, NEW.id::text);
  END IF; RETURN NEW;
END $$;
CREATE TRIGGER push_payment_alerts AFTER INSERT OR UPDATE OF status ON public.payments FOR EACH ROW EXECUTE FUNCTION public.push_on_payment();

CREATE OR REPLACE FUNCTION public.push_on_announcement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.published AND (TG_OP = 'INSERT' OR NOT OLD.published) THEN PERFORM public.queue_push_event('announcement', NEW.id::text); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER push_announcement_alerts AFTER INSERT OR UPDATE OF published ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.push_on_announcement();

CREATE OR REPLACE FUNCTION public.push_on_complaint_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.queue_push_event('complaint', NEW.id::text); RETURN NEW; END $$;
CREATE TRIGGER push_complaint_alerts AFTER INSERT ON public.complaint_notifications FOR EACH ROW EXECUTE FUNCTION public.push_on_complaint_notification();

CREATE OR REPLACE FUNCTION public.push_on_reminder_run() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(NEW.recorded,0) > 0 AND coalesce(OLD.recorded,0) = 0 THEN PERFORM public.queue_push_event('reminders', NEW.id::text); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER push_reminder_alerts AFTER UPDATE OF recorded ON public.reminder_runs FOR EACH ROW EXECUTE FUNCTION public.push_on_reminder_run();