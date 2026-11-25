CREATE TABLE public.change_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), module text NOT NULL, action text NOT NULL CHECK(action IN ('create','update','delete','create_login','set_role')),
 record_key text NOT NULL, previous_values jsonb, proposed_values jsonb NOT NULL DEFAULT '{}',
 submitted_by uuid NOT NULL, submitted_email text NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reviewed_by uuid, reviewed_at timestamptz, review_comment text, applied_values jsonb
);
GRANT SELECT ON public.change_proposals TO authenticated;
GRANT ALL ON public.change_proposals TO service_role;
ALTER TABLE public.change_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "President and submitting Secretary read proposals" ON public.change_proposals FOR SELECT TO authenticated
 USING (public.has_role(auth.uid(),'president') OR (submitted_by=auth.uid() AND public.has_role(auth.uid(),'secretary')));
CREATE UNIQUE INDEX one_pending_change_per_record ON public.change_proposals(module,record_key) WHERE status='pending';
CREATE INDEX proposals_history_search ON public.change_proposals USING gin(to_tsvector('simple',submitted_email || ' ' || module || ' ' || record_key || ' ' || proposed_values::text));
CREATE TABLE public.change_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES public.change_proposals(id),
 event text NOT NULL CHECK(event IN ('submitted','approved','rejected','applied')), actor_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(), comment text, previous_values jsonb, proposed_values jsonb
);
GRANT SELECT ON public.change_audit TO authenticated;
GRANT ALL ON public.change_audit TO service_role;
ALTER TABLE public.change_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own proposal audit or President audit" ON public.change_audit FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.change_proposals p WHERE p.id=proposal_id));
CREATE FUNCTION public.approval_fields(_module text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE _module
 WHEN 'flats' THEN ARRAY['flat_number','resident_name','mobile','resident_user_id','billing_start','occupancy','tenant_name','tenant_phone','tenant_email','tenant_start','tenant_end']
 WHEN 'payments' THEN ARRAY['flat_id','amount','method','status','paid_on','month_covered','reference','notes']
 WHEN 'expenses' THEN ARRAY['expense_date','expense_month','category','description','amount','paid_by','method','notes']
 WHEN 'announcements' THEN ARRAY['title','category','description','event_date','event_time','location','expires_on','published']
 WHEN 'fund_years' THEN ARRAY['opening_balance']
 WHEN 'society_settings' THEN ARRAY['society_name','monthly_amount','upi_id','payee_name']
 ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.approval_fields(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.proposal_snapshot(_module text,_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF _module='user_roles' THEN
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.role),'[]') INTO result FROM public.user_roles r WHERE user_id=_key::uuid;
 RETURN result;
 END IF;
 IF public.approval_fields(_module) IS NULL THEN RAISE EXCEPTION 'Unsupported administrative module'; END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE %I::text=$1 FOR UPDATE',_module,CASE WHEN _module='fund_years' THEN 'fy_start' ELSE 'id' END) INTO result USING _key;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.proposal_snapshot(text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.submit_change(_module text,_action text,_key text,_values jsonb DEFAULT '{}') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prev jsonb; proposal uuid; email text; k text; cols text[]; keyvalue text;
BEGIN
 IF NOT public.has_role(auth.uid(),'secretary') OR public.has_role(auth.uid(),'president') OR public.has_role(auth.uid(),'admin') THEN
 RAISE EXCEPTION 'Only the Secretary can submit proposals' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_values)<>'object' THEN RAISE EXCEPTION 'Invalid proposed values'; END IF;
 IF _action='create_login' AND _module='flats' THEN
 IF _values - 'email' <> '{}' OR coalesce(_values->>'email','') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'Enter a valid owner email'; END IF;
 ELSIF _action='set_role' AND _module='user_roles' THEN
 IF _values - 'role' <> '{}' OR coalesce(_values->>'role','') NOT IN ('resident','secretary','treasurer','president') THEN RAISE EXCEPTION 'Invalid role'; END IF;
 IF _key=auth.uid()::text THEN RAISE EXCEPTION 'You cannot request a change to your own role'; END IF;
 ELSE
 cols:=public.approval_fields(_module);
 IF cols IS NULL OR _action NOT IN ('create','update','delete') THEN RAISE EXCEPTION 'Unsupported administrative change'; END IF;
 FOR k IN SELECT jsonb_object_keys(_values) LOOP IF NOT k=ANY(cols) THEN RAISE EXCEPTION 'Field is not permitted: %',k; END IF; END LOOP;
 IF _action='delete' AND _values<>'{}' THEN RAISE EXCEPTION 'Deletion must not include replacement values'; END IF;
 IF _action<>'delete' AND _values='{}' THEN RAISE EXCEPTION 'Enter proposed values'; END IF;
 END IF;
 keyvalue:=CASE WHEN _action='create' AND _module NOT IN ('fund_years','society_settings') THEN gen_random_uuid()::text ELSE _key END;
 IF keyvalue IS NULL OR keyvalue='' THEN RAISE EXCEPTION 'Record is required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_module||':'||keyvalue,0));
 prev:=public.proposal_snapshot(_module,keyvalue);
 IF _action='create' THEN IF prev IS NOT NULL THEN RAISE EXCEPTION 'Record already exists'; END IF;
 ELSIF prev IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
 IF _action='set_role' AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=keyvalue::uuid) THEN RAISE EXCEPTION 'Account not found'; END IF;
 IF _action='create_login' AND prev->>'resident_user_id' IS NOT NULL THEN RAISE EXCEPTION 'Flat already has a linked owner'; END IF;
 SELECT u.email INTO email FROM auth.users u WHERE u.id=auth.uid();
 INSERT INTO public.change_proposals(module,action,record_key,previous_values,proposed_values,submitted_by,submitted_email)
 VALUES(_module,_action,keyvalue,prev,_values,auth.uid(),coalesce(email,auth.uid()::text)) RETURNING id INTO proposal;
 INSERT INTO public.change_audit(proposal_id,event,actor_id,previous_values,proposed_values) VALUES(proposal,'submitted',auth.uid(),prev,_values);
 RETURN proposal;
END $$;
REVOKE ALL ON FUNCTION public.submit_change(text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_change(text,text,text,jsonb) TO authenticated;
CREATE FUNCTION public.decide_change(_id uuid,_approve boolean,_comment text DEFAULT '',_resolved_user uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.change_proposals; current_values jsonb; merged jsonb; applied jsonb; columns_sql text; select_sql text; assignments text; col text;
BEGIN
 IF NOT public.has_role(auth.uid(),'president') THEN RAISE EXCEPTION 'Only the President can decide proposals' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.change_proposals WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;
 IF p.submitted_by=auth.uid() THEN RAISE EXCEPTION 'You cannot approve your own proposal' USING ERRCODE='42501'; END IF;
 IF p.status<>'pending' THEN RAISE EXCEPTION 'This proposal has already been decided'; END IF;
 IF NOT _approve THEN
 IF trim(coalesce(_comment,''))='' THEN RAISE EXCEPTION 'Give a reason for rejection'; END IF;
 UPDATE public.change_proposals SET status='rejected',reviewed_by=auth.uid(),reviewed_at=now(),review_comment=_comment WHERE id=_id;
 INSERT INTO public.change_audit(proposal_id,event,actor_id,comment) VALUES(_id,'rejected',auth.uid(),_comment);
 RETURN;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p.module||':'||p.record_key,0));
 current_values:=public.proposal_snapshot(p.module,p.record_key);
 IF current_values IS DISTINCT FROM p.previous_values THEN RAISE EXCEPTION 'Record changed since submission. Reject and request a fresh proposal.' USING ERRCODE='40001'; END IF;
 IF p.action='set_role' THEN
 IF p.record_key=auth.uid()::text OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p.record_key::uuid AND role='admin') THEN RAISE EXCEPTION 'Cannot change your own role or a legacy admin'; END IF;
 PERFORM public.set_committee_role(p.record_key::uuid,(p.proposed_values->>'role')::public.app_role);
 applied:=public.proposal_snapshot('user_roles',p.record_key);
 ELSIF p.action='create_login' THEN
 IF _resolved_user IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_resolved_user AND lower(email)=lower(p.proposed_values->>'email')) THEN RAISE EXCEPTION 'Owner account must match the requested email'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_resolved_user AND role<>'resident') THEN RAISE EXCEPTION 'Cannot link a committee account as an owner'; END IF;
 INSERT INTO public.user_roles(user_id,role) VALUES(_resolved_user,'resident') ON CONFLICT(user_id,role) DO NOTHING;
 UPDATE public.flats SET resident_user_id=_resolved_user WHERE id=p.record_key::uuid;
 applied:=public.proposal_snapshot('flats',p.record_key);
 ELSE
 col:=CASE WHEN p.module='fund_years' THEN 'fy_start' ELSE 'id' END;
 IF p.action='delete' THEN
 IF p.module='flats' AND (EXISTS(SELECT 1 FROM public.payments WHERE flat_id=p.record_key::uuid) OR EXISTS(SELECT 1 FROM public.maintenance_reminders WHERE flat_id=p.record_key::uuid)) THEN RAISE EXCEPTION 'Flat has financial or reminder records and cannot be deleted'; END IF;
 EXECUTE format('DELETE FROM public.%I WHERE %I::text=$1',p.module,col) USING p.record_key;
 applied:=NULL;
 ELSE
 merged:=coalesce(current_values,'{}')||p.proposed_values;
 IF p.action='create' THEN
 merged:=merged||jsonb_build_object(col,p.record_key);
 IF p.module='payments' OR p.module='expenses' THEN merged:=merged||jsonb_build_object('recorded_by',p.submitted_by); END IF;
 IF p.module='announcements' THEN merged:=merged||jsonb_build_object('created_by',p.submitted_by); END IF;
 SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('x.%I',key),',' ORDER BY key) INTO columns_sql,select_sql FROM jsonb_object_keys(merged) key;
 EXECUTE format('INSERT INTO public.%I(%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) x',p.module,columns_sql,select_sql,p.module) USING merged;
 ELSE
 SELECT string_agg(format('%I=x.%I',key,key),',' ORDER BY key) INTO assignments FROM jsonb_object_keys(p.proposed_values) key;
 EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) x WHERE t.%I::text=$2',p.module,assignments,p.module,col) USING merged,p.record_key;
 END IF;
 applied:=public.proposal_snapshot(p.module,p.record_key);
 END IF;
 END IF;
 UPDATE public.change_proposals SET status='approved',reviewed_by=auth.uid(),reviewed_at=now(),review_comment=_comment,applied_values=applied WHERE id=_id;
 INSERT INTO public.change_audit(proposal_id,event,actor_id,comment,previous_values,proposed_values) VALUES(_id,'approved',auth.uid(),_comment,p.previous_values,p.proposed_values);
 INSERT INTO public.change_audit(proposal_id,event,actor_id,previous_values,proposed_values) VALUES(_id,'applied',auth.uid(),p.previous_values,applied);
END $$;
REVOKE ALL ON FUNCTION public.decide_change(uuid,boolean,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.decide_change(uuid,boolean,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_committee_live_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='secretary')
 AND NOT public.has_role(auth.uid(),'president') AND NOT public.has_role(auth.uid(),'admin') THEN
 RAISE EXCEPTION 'President approval is required before changing live records' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NOT NULL AND NOT public.has_permission('admin.write') AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='treasurer') THEN
 RAISE EXCEPTION 'President approval is required before changing live records' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname NOT IN ('change_proposals','change_audit') LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||quote_ident(t.relname))::regclass AND tgname='mandatory_committee_approval') THEN
 EXECUTE format('CREATE TRIGGER mandatory_committee_approval BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_committee_live_changes()',t.relname);
 END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.guard_new_administrative_tables() RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; schema_name text; table_name text;
BEGIN
 FOR c IN SELECT * FROM pg_event_trigger_ddl_commands() WHERE command_tag IN ('CREATE TABLE','CREATE TABLE AS') AND object_type='table' LOOP
 SELECT n.nspname,t.relname INTO schema_name,table_name FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE t.oid=c.objid;
 IF schema_name='public' THEN EXECUTE format('CREATE TRIGGER mandatory_committee_approval BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_committee_live_changes()',table_name); END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.guard_new_administrative_tables() FROM PUBLIC,anon,authenticated;
CREATE EVENT TRIGGER mandatory_approval_on_new_tables ON ddl_command_end WHEN TAG IN ('CREATE TABLE','CREATE TABLE AS') EXECUTE FUNCTION public.guard_new_administrative_tables();