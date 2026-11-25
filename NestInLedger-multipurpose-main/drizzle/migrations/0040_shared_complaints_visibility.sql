CREATE OR REPLACE FUNCTION public.can_decide_module(_module text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE
  WHEN _module='payments' THEN public.has_role(auth.uid(),'treasurer') OR public.has_role(auth.uid(),'admin')
  WHEN _module IN ('expenses','recurring_entries','recurring_expenses','complaints') THEN public.has_role(auth.uid(),'president') OR (_module IN ('expenses','complaints') AND public.has_role(auth.uid(),'secretary'))
  ELSE public.has_role(auth.uid(),'president') END $$;

DROP POLICY "Private complaint reads" ON public.complaints;
CREATE POLICY "Shared complaint reads" ON public.complaints FOR SELECT TO authenticated USING(public.has_permission('admin.read') OR public.has_role(auth.uid(),'resident') OR owner_id=auth.uid() OR EXISTS(SELECT 1 FROM public.flats f WHERE f.resident_user_id=auth.uid()));

CREATE OR REPLACE FUNCTION public.complaint_event_notifications() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r record; c public.complaints; p public.change_proposals; fl text; BEGIN
 SELECT * INTO c FROM public.complaints WHERE id=NEW.complaint_id;
 SELECT flat_number INTO fl FROM public.flats WHERE id=c.flat_id;
 IF NEW.event IN ('submitted','owner comment','reopening requested') THEN
 FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('admin','president','secretary') LOOP PERFORM public.queue_complaint_notification(NEW.id,r.user_id,'Complaint: '||c.title||' — '||NEW.event); END LOOP;
 IF NEW.event='submitted' THEN
 FOR r IN SELECT DISTINCT resident_user_id AS user_id FROM public.flats WHERE resident_user_id IS NOT NULL AND resident_user_id<>c.owner_id AND NOT EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=flats.resident_user_id AND ur.role IN ('admin','president','secretary','treasurer')) LOOP PERFORM public.queue_complaint_notification(NEW.id,r.user_id,'New complaint from Flat '||coalesce(fl,'')||': '||c.title); END LOOP;
 END IF;
 ELSIF NEW.event='proposal submitted' THEN
 FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('president','secretary') AND user_id<>NEW.actor_id LOOP PERFORM public.queue_complaint_notification(NEW.id,r.user_id,'Complaint change needs approval: '||c.title); END LOOP;
 ELSIF NEW.event IN ('proposal approved','proposal rejected') THEN
 SELECT * INTO p FROM public.change_proposals WHERE id=NEW.proposal_id;
 PERFORM public.queue_complaint_notification(NEW.id,p.submitted_by,'Complaint proposal '||p.status||': '||c.title);
 ELSE PERFORM public.queue_complaint_notification(NEW.id,c.owner_id,'Complaint update: '||c.title||' — '||c.status); END IF;
 RETURN NEW; END $$;