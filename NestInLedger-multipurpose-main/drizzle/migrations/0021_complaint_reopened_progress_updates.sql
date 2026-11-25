CREATE OR REPLACE FUNCTION public.validate_complaint_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='UPDATE' THEN
 IF NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.flat_id<>OLD.flat_id OR NEW.request_id<>OLD.request_id OR NEW.title<>OLD.title OR NEW.description<>OLD.description OR NEW.submitted_at<>OLD.submitted_at THEN RAISE EXCEPTION 'Complaint identity and submission cannot be changed'; END IF;
 IF NEW.status='Resolved' AND trim(coalesce(NEW.resolution_details,''))='' THEN RAISE EXCEPTION 'Enter resolution details before closing'; END IF;
 IF NEW.status='Assigned' AND trim(coalesce(NEW.assigned_to,''))='' THEN RAISE EXCEPTION 'Enter the assigned person'; END IF;
 IF NEW.status='Reopened' AND NEW.status IS DISTINCT FROM OLD.status THEN
 IF OLD.status<>'Resolved' AND NOT OLD.reopen_requested THEN RAISE EXCEPTION 'Only a resolved issue or requested reopening can be reopened'; END IF;
 NEW.reopen_requested:=false;
 END IF;
 NEW.updated_at:=clock_timestamp();
 END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.audit_live_complaint() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW.reopen_requested IS DISTINCT FROM OLD.reopen_requested AND NEW.status=OLD.status AND NEW.category=OLD.category AND NEW.priority=OLD.priority AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to AND NEW.due_on IS NOT DISTINCT FROM OLD.due_on AND NEW.progress_update IS NOT DISTINCT FROM OLD.progress_update AND NEW.resolution_details IS NOT DISTINCT FROM OLD.resolution_details THEN RETURN NEW; END IF;
 INSERT INTO public.complaint_events(complaint_id,actor_id,event,comment,previous_values,proposed_values) VALUES(NEW.id,coalesce(auth.uid(),NEW.owner_id),CASE WHEN TG_OP='INSERT' THEN 'submitted' ELSE 'committee update' END,CASE WHEN TG_OP='UPDATE' THEN NEW.progress_update END,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END,to_jsonb(NEW)); RETURN NEW; END $$;