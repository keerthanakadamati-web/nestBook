DO $do$ DECLARE d text; BEGIN
 d := pg_get_functiondef('public.decide_change(uuid,boolean,text,uuid)'::regprocedure);
 d := replace(d, $x$IF NOT public.has_role(auth.uid(),'president') THEN RAISE EXCEPTION 'Only the President can decide proposals'$x$, $x$IF current_setting('app.decision_ok',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use the approval decision function'$x$);
 d := replace(d, 'FUNCTION public.decide_change(', 'FUNCTION public.decide_change_core(');
 EXECUTE d;
END $do$;
REVOKE ALL ON FUNCTION public.decide_change_core(uuid,boolean,text,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_decide_module(_module text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE
  WHEN _module='payments' THEN public.has_role(auth.uid(),'treasurer') OR public.has_role(auth.uid(),'admin')
  WHEN _module IN ('expenses','recurring_entries','recurring_expenses') THEN public.has_role(auth.uid(),'president') OR (_module='expenses' AND public.has_role(auth.uid(),'secretary'))
  ELSE public.has_role(auth.uid(),'president') END $$;

CREATE OR REPLACE FUNCTION public.decide_change(_id uuid, _approve boolean, _comment text DEFAULT '', _resolved_user uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m text;
BEGIN
 SELECT module INTO m FROM public.change_proposals WHERE id=_id;
 IF m IS NULL THEN RAISE EXCEPTION 'Proposal not found'; END IF;
 IF NOT public.can_decide_module(m) THEN RAISE EXCEPTION 'You are not allowed to decide this request' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.decision_ok','on',true);
 PERFORM public.decide_change_core(_id,_approve,_comment,_resolved_user);
 PERFORM set_config('app.decision_ok','off',true);
END $$;

CREATE OR REPLACE FUNCTION public.decide_payment(_id uuid, _confirm boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_decide_module('payments') THEN RAISE EXCEPTION 'Only the Treasurer can confirm payments' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.decision_ok','on',true);
 UPDATE public.payments SET status=CASE WHEN _confirm THEN 'confirmed' ELSE 'rejected' END WHERE id=_id AND status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'This payment is no longer waiting for confirmation'; END IF;
 PERFORM set_config('app.decision_ok','off',true);
END $$;
GRANT EXECUTE ON FUNCTION public.decide_payment(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_change(uuid,boolean,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_committee_live_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF current_setting('app.decision_ok',true)='on' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 IF TG_TABLE_NAME='payments' AND TG_OP='UPDATE' AND OLD.status='pending' AND NEW.status IS DISTINCT FROM OLD.status AND auth.uid() IS NOT NULL THEN
  RAISE EXCEPTION 'Only the Treasurer can confirm payments' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='secretary')
 AND NOT public.has_role(auth.uid(),'president') AND NOT public.has_role(auth.uid(),'admin') THEN
 RAISE EXCEPTION 'President approval is required before changing live records' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NOT NULL AND NOT public.has_permission('admin.write') AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='treasurer') THEN
 RAISE EXCEPTION 'President approval is required before changing live records' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;

CREATE POLICY "Deciders read their proposals" ON public.change_proposals FOR SELECT TO authenticated USING (public.can_decide_module(module));