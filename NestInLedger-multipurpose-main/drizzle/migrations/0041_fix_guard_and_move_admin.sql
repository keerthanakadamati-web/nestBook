CREATE OR REPLACE FUNCTION public.guard_committee_live_changes()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF current_setting('app.decision_ok',true)='on' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 IF TG_TABLE_NAME='payments' AND TG_OP='UPDATE' AND auth.uid() IS NOT NULL THEN
  IF OLD.status='pending' AND NEW.status IS DISTINCT FROM OLD.status THEN
   RAISE EXCEPTION 'Only the Treasurer can confirm payments' USING ERRCODE='42501'; END IF;
 END IF;
 IF auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='secretary')
 AND NOT public.has_role(auth.uid(),'president') AND NOT public.has_role(auth.uid(),'admin') THEN
 RAISE EXCEPTION 'President approval is required before changing live records' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NOT NULL AND NOT public.has_permission('admin.write') AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='treasurer') THEN
 RAISE EXCEPTION 'President approval is required before changing live records' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $function$;

INSERT INTO public.user_roles (user_id, role) VALUES ('9200d970-af69-405c-9a73-d55960918033','admin') ON CONFLICT DO NOTHING;
DELETE FROM public.user_roles WHERE user_id='d4c409ea-af6e-44f4-9b7e-47a69606b391' AND role='admin';