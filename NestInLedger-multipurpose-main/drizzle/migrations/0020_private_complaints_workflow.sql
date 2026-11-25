CREATE TABLE public.complaints (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, flat_id uuid NOT NULL REFERENCES public.flats(id), request_id uuid NOT NULL,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200), description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 10000),
 category text NOT NULL DEFAULT 'Other' CHECK(category IN ('Maintenance & Repairs','Water','Electricity','Cleanliness','Security','Other')),
 status text NOT NULL DEFAULT 'Submitted' CHECK(status IN ('Submitted','Under Review','Assigned','In Progress','Awaiting Approval','Resolved','Reopened')),
 priority text NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Normal','High','Urgent')), assigned_to text, due_on date, progress_update text, resolution_details text,
 reopen_requested boolean NOT NULL DEFAULT false, submitted_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,request_id)
);
GRANT SELECT, UPDATE ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Private complaint reads" ON public.complaints FOR SELECT TO authenticated USING(public.has_permission('admin.read') OR (owner_id=auth.uid() AND NOT public.has_role(auth.uid(),'treasurer')));
CREATE POLICY "Live complaint managers" ON public.complaints FOR UPDATE TO authenticated USING(public.has_permission('admin.write')) WITH CHECK(public.has_permission('admin.write'));
CREATE TABLE public.complaint_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), complaint_id uuid NOT NULL REFERENCES public.complaints(id), actor_id uuid NOT NULL, event text NOT NULL, comment text,
 previous_values jsonb, proposed_values jsonb, proposal_id uuid REFERENCES public.change_proposals(id), occurred_at timestamptz NOT NULL DEFAULT now(), request_id uuid, UNIQUE(complaint_id,actor_id,request_id)
);
GRANT SELECT ON public.complaint_events TO authenticated;
GRANT ALL ON public.complaint_events TO service_role;
ALTER TABLE public.complaint_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Complaint history reads" ON public.complaint_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.complaints c WHERE c.id=complaint_id) AND (proposal_id IS NULL OR public.has_permission('admin.read')));
DROP TRIGGER mandatory_committee_approval ON public.complaint_events;
CREATE TABLE public.complaint_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES public.complaint_events(id), recipient_id uuid NOT NULL,
 message text NOT NULL, read_at timestamptz, email_status text NOT NULL DEFAULT 'queued' CHECK(email_status IN ('queued','sending','accepted','failed')), email_error text, email_accepted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(event_id,recipient_id)
);
GRANT SELECT ON public.complaint_notifications TO authenticated;
GRANT ALL ON public.complaint_notifications TO service_role;
ALTER TABLE public.complaint_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Recipient complaint alerts" ON public.complaint_notifications FOR SELECT TO authenticated USING(recipient_id=auth.uid() AND NOT public.has_role(auth.uid(),'treasurer'));
DROP TRIGGER mandatory_committee_approval ON public.complaint_notifications;
CREATE INDEX complaint_owner_history ON public.complaints(owner_id,submitted_at DESC);
CREATE INDEX complaint_event_history ON public.complaint_events(complaint_id,occurred_at);
CREATE OR REPLACE FUNCTION public.approval_fields(_module text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT CASE _module
 WHEN 'flats' THEN ARRAY['flat_number','resident_name','mobile','resident_user_id','billing_start','occupancy','tenant_name','tenant_phone','tenant_email','tenant_start','tenant_end']
 WHEN 'payments' THEN ARRAY['flat_id','amount','method','status','paid_on','month_covered','reference','notes']
 WHEN 'expenses' THEN ARRAY['expense_date','expense_month','category','description','amount','paid_by','method','notes']
 WHEN 'announcements' THEN ARRAY['title','category','description','event_date','event_time','location','expires_on','published']
 WHEN 'fund_years' THEN ARRAY['opening_balance']
 WHEN 'society_settings' THEN ARRAY['society_name','monthly_amount','upi_id','payee_name','effective_month','due_day','fy_start_month','reminders_enabled','reminder_start_day','reminder_time','reminder_timezone','reminder_frequency','reminder_method','payment_notifications']
 WHEN 'complaints' THEN ARRAY['category','status','priority','assigned_to','due_on','progress_update','resolution_details','reopen_requested'] ELSE NULL END $$;
CREATE FUNCTION public.validate_complaint_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='UPDATE' THEN
 IF NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.flat_id<>OLD.flat_id OR NEW.request_id<>OLD.request_id OR NEW.title<>OLD.title OR NEW.description<>OLD.description OR NEW.submitted_at<>OLD.submitted_at THEN RAISE EXCEPTION 'Complaint identity and submission cannot be changed'; END IF;
 IF NEW.status='Resolved' AND trim(coalesce(NEW.resolution_details,''))='' THEN RAISE EXCEPTION 'Enter resolution details before closing'; END IF;
 IF NEW.status='Assigned' AND trim(coalesce(NEW.assigned_to,''))='' THEN RAISE EXCEPTION 'Enter the assigned person'; END IF;
 IF NEW.status='Reopened' AND OLD.status<>'Resolved' AND NOT OLD.reopen_requested THEN RAISE EXCEPTION 'Only a resolved issue or requested reopening can be reopened'; END IF;
 IF NEW.status='Reopened' THEN NEW.reopen_requested:=false; END IF;
 NEW.updated_at:=clock_timestamp();
 END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.validate_complaint_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER complaint_validation BEFORE UPDATE ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.validate_complaint_change();
CREATE FUNCTION public.validate_complaint_proposal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v jsonb; BEGIN
 IF NEW.module<>'complaints' THEN RETURN NEW; END IF;
 IF NEW.action<>'update' THEN RAISE EXCEPTION 'Complaint proposals only update existing complaints'; END IF;
 v:=NEW.previous_values||NEW.proposed_values;
 IF coalesce(v->>'status','') NOT IN ('Submitted','Under Review','Assigned','In Progress','Awaiting Approval','Resolved','Reopened') OR coalesce(v->>'priority','') NOT IN ('Normal','High','Urgent') OR coalesce(v->>'category','') NOT IN ('Maintenance & Repairs','Water','Electricity','Cleanliness','Security','Other') THEN RAISE EXCEPTION 'Invalid complaint status, priority or category'; END IF;
 IF v->>'status'='Resolved' AND trim(coalesce(v->>'resolution_details',''))='' THEN RAISE EXCEPTION 'Enter resolution details before closing'; END IF;
 IF v->>'status'='Assigned' AND trim(coalesce(v->>'assigned_to',''))='' THEN RAISE EXCEPTION 'Enter the assigned person'; END IF;
 RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.validate_complaint_proposal() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER complaint_proposal_validation BEFORE INSERT ON public.change_proposals FOR EACH ROW EXECUTE FUNCTION public.validate_complaint_proposal();
CREATE FUNCTION public.queue_complaint_notification(_event uuid,_recipient uuid,_message text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE n uuid; BEGIN
 INSERT INTO public.complaint_notifications(event_id,recipient_id,message) VALUES(_event,_recipient,_message) ON CONFLICT(event_id,recipient_id) DO NOTHING RETURNING id INTO n;
 IF n IS NOT NULL THEN
 PERFORM net.http_post(url:='https://project--0fd07ec0-305c-47b1-a041-c1113df57b56.lovable.app/api/public/hooks/complaint-email',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(SELECT token FROM public.internal_tokens WHERE name='email_hook')),body:=jsonb_build_object('notification_id',n));
 END IF; END $$;
REVOKE ALL ON FUNCTION public.queue_complaint_notification(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.complaint_event_notifications() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r record; c public.complaints; p public.change_proposals; BEGIN
 SELECT * INTO c FROM public.complaints WHERE id=NEW.complaint_id;
 IF NEW.event IN ('submitted','owner comment','reopening requested') THEN
 FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('admin','president','secretary') LOOP PERFORM public.queue_complaint_notification(NEW.id,r.user_id,'Complaint: '||c.title||' — '||NEW.event); END LOOP;
 ELSIF NEW.event='proposal submitted' THEN
 FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role='president' LOOP PERFORM public.queue_complaint_notification(NEW.id,r.user_id,'Complaint change needs approval: '||c.title); END LOOP;
 ELSIF NEW.event IN ('proposal approved','proposal rejected') THEN
 SELECT * INTO p FROM public.change_proposals WHERE id=NEW.proposal_id;
 PERFORM public.queue_complaint_notification(NEW.id,p.submitted_by,'Complaint proposal '||p.status||': '||c.title);
 ELSE PERFORM public.queue_complaint_notification(NEW.id,c.owner_id,'Complaint update: '||c.title||' — '||c.status); END IF;
 RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.complaint_event_notifications() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER complaint_alerts AFTER INSERT ON public.complaint_events FOR EACH ROW EXECUTE FUNCTION public.complaint_event_notifications();
CREATE FUNCTION public.audit_live_complaint() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 INSERT INTO public.complaint_events(complaint_id,actor_id,event,comment,previous_values,proposed_values) VALUES(NEW.id,coalesce(auth.uid(),NEW.owner_id),CASE WHEN TG_OP='INSERT' THEN 'submitted' ELSE 'committee update' END,CASE WHEN TG_OP='UPDATE' THEN NEW.progress_update END,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END,to_jsonb(NEW)); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.audit_live_complaint() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER complaint_live_audit AFTER INSERT OR UPDATE ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.audit_live_complaint();
CREATE FUNCTION public.audit_complaint_proposal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.module='complaints' AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
 INSERT INTO public.complaint_events(complaint_id,actor_id,event,comment,previous_values,proposed_values,proposal_id) VALUES(NEW.record_key::uuid,coalesce(NEW.reviewed_by,NEW.submitted_by),CASE WHEN TG_OP='INSERT' THEN 'proposal submitted' ELSE 'proposal '||NEW.status END,NEW.review_comment,NEW.previous_values,NEW.proposed_values,NEW.id);
 END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.audit_complaint_proposal() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER complaint_proposal_audit AFTER INSERT OR UPDATE ON public.change_proposals FOR EACH ROW EXECUTE FUNCTION public.audit_complaint_proposal();
CREATE FUNCTION public.submit_complaint(_flat uuid,_title text,_description text,_category text,_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE result uuid; BEGIN
 IF auth.uid() IS NULL OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role<>'resident') OR NOT EXISTS(SELECT 1 FROM public.flats WHERE id=_flat AND resident_user_id=auth.uid()) THEN RAISE EXCEPTION 'Choose a flat linked to your owner account' USING ERRCODE='42501'; END IF;
 INSERT INTO public.complaints(owner_id,flat_id,title,description,category,request_id) VALUES(auth.uid(),_flat,trim(_title),trim(_description),_category,_request) ON CONFLICT(owner_id,request_id) DO NOTHING RETURNING id INTO result;
 IF result IS NULL THEN SELECT id INTO result FROM public.complaints WHERE owner_id=auth.uid() AND request_id=_request; END IF;
 RETURN result; END $$;
REVOKE ALL ON FUNCTION public.submit_complaint(uuid,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_complaint(uuid,text,text,text,uuid) TO authenticated;
CREATE FUNCTION public.comment_on_complaint(_id uuid,_comment text,_reopen boolean,_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c public.complaints; result uuid; BEGIN
 SELECT * INTO c FROM public.complaints WHERE id=_id FOR UPDATE;
 IF auth.uid() IS NULL OR c.owner_id IS DISTINCT FROM auth.uid() OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role<>'resident') THEN RAISE EXCEPTION 'You may comment only on your own complaint' USING ERRCODE='42501'; END IF;
 IF trim(coalesce(_comment,''))='' OR length(_comment)>10000 THEN RAISE EXCEPTION 'Enter a comment'; END IF;
 INSERT INTO public.complaint_events(complaint_id,actor_id,event,comment,request_id) VALUES(_id,auth.uid(),CASE WHEN _reopen THEN 'reopening requested' ELSE 'owner comment' END,trim(_comment),_request) ON CONFLICT(complaint_id,actor_id,request_id) DO NOTHING RETURNING id INTO result;
 IF result IS NOT NULL AND _reopen AND NOT c.reopen_requested THEN UPDATE public.complaints SET reopen_requested=true WHERE id=_id; END IF;
 IF result IS NULL THEN SELECT id INTO result FROM public.complaint_events WHERE complaint_id=_id AND actor_id=auth.uid() AND request_id=_request; END IF;
 RETURN result; END $$;
REVOKE ALL ON FUNCTION public.comment_on_complaint(uuid,text,boolean,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.comment_on_complaint(uuid,text,boolean,uuid) TO authenticated;
CREATE FUNCTION public.read_complaint_notifications() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN UPDATE public.complaint_notifications SET read_at=now() WHERE recipient_id=auth.uid() AND read_at IS NULL; END $$;
REVOKE ALL ON FUNCTION public.read_complaint_notifications() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_complaint_notifications() TO authenticated;
CREATE POLICY "Private complaint photos read" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='complaint-photos' AND EXISTS(SELECT 1 FROM public.complaints c WHERE c.id::text=(storage.foldername(name))[1]));
CREATE POLICY "Owner complaint photos upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='complaint-photos' AND (storage.foldername(name))[2]=auth.uid()::text AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp') AND EXISTS(SELECT 1 FROM public.complaints c WHERE c.id::text=(storage.foldername(name))[1] AND c.owner_id=auth.uid()) AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role<>'resident'));
COMMENT ON TABLE public.complaint_events IS 'Append-only complaint history through bounded authenticated RPCs and trusted audit triggers; no client mutation grants.';