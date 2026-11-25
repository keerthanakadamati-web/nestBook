CREATE OR REPLACE FUNCTION public.transition_financial_report(_id uuid, _action text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r public.financial_reports;
BEGIN
 SELECT * INTO r FROM public.financial_reports WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Report not available'; END IF;
 IF _action='submit' AND public.has_role(auth.uid(),'treasurer') AND r.prepared_by=auth.uid() AND r.status='prepared' THEN
 UPDATE public.financial_reports SET status='submitted',submitted_at=now() WHERE id=_id;
 ELSIF _action='review' AND r.status IN ('submitted','reviewed') AND (public.has_role(auth.uid(),'president') OR public.has_role(auth.uid(),'secretary')) THEN
 IF public.has_role(auth.uid(),'president') THEN
 IF r.president_reviewed_at IS NOT NULL THEN RAISE EXCEPTION 'Already reviewed'; END IF;
 UPDATE public.financial_reports SET status='reviewed',president_reviewed_at=now(),president_reviewed_by=auth.uid() WHERE id=_id;
 ELSE
 IF r.secretary_reviewed_at IS NOT NULL THEN RAISE EXCEPTION 'Already reviewed'; END IF;
 UPDATE public.financial_reports SET status='reviewed',secretary_reviewed_at=now(),secretary_reviewed_by=auth.uid() WHERE id=_id;
 END IF;
 ELSIF _action='approve' AND public.has_role(auth.uid(),'president') AND r.status='reviewed' AND r.prepared_by<>auth.uid() AND r.president_reviewed_at IS NOT NULL THEN
 UPDATE public.financial_reports SET status='approved',approved_at=now(),approved_by=auth.uid() WHERE id=_id;
 ELSIF _action='reject' AND public.has_role(auth.uid(),'president') AND r.status IN ('submitted','reviewed') THEN
 DELETE FROM public.financial_reports WHERE id=_id;
 ELSIF _action='withdraw' AND public.has_role(auth.uid(),'treasurer') AND r.prepared_by=auth.uid() AND r.status<>'approved' THEN
 DELETE FROM public.financial_reports WHERE id=_id;
 ELSE RAISE EXCEPTION 'This report action is not allowed' USING ERRCODE='42501'; END IF;
END $function$;