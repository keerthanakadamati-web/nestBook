CREATE TABLE public.recurring_expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 category text NOT NULL,
 expected_amount numeric NOT NULL CHECK (expected_amount > 0),
 due_day integer NOT NULL CHECK (due_day BETWEEN 1 AND 31),
 vendor text,
 start_date date NOT NULL,
 end_date date,
 frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly','quarterly','annually')),
 notes text,
 requires_receipt boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.recurring_expenses TO authenticated;
GRANT ALL ON public.recurring_expenses TO service_role;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY recurring_read ON public.recurring_expenses FOR SELECT TO authenticated USING (public.has_permission('finance.read'));
CREATE POLICY recurring_write ON public.recurring_expenses FOR ALL TO authenticated USING (public.has_permission('finance.write')) WITH CHECK (public.has_permission('finance.write'));
CREATE TABLE public.recurring_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recurring_id uuid NOT NULL REFERENCES public.recurring_expenses(id),
 period text NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
 expected_amount numeric NOT NULL CHECK (expected_amount > 0),
 status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','paid')),
 actual_amount numeric CHECK (actual_amount IS NULL OR actual_amount > 0),
 paid_on date,
 payment_reference text,
 method text CHECK (method IS NULL OR method IN ('cash','online')),
 notes text,
 expense_id uuid REFERENCES public.expenses(id),
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (recurring_id, period)
);
GRANT SELECT ON public.recurring_entries TO authenticated;
GRANT ALL ON public.recurring_entries TO service_role;
ALTER TABLE public.recurring_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY recurring_entry_read ON public.recurring_entries FOR SELECT TO authenticated USING (public.has_permission('finance.read'));
DROP TRIGGER mandatory_committee_approval ON public.recurring_entries;
CREATE TABLE public.expense_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entry_id uuid REFERENCES public.recurring_entries(id),
 expense_id uuid REFERENCES public.expenses(id),
 file_path text NOT NULL,
 file_name text NOT NULL,
 file_size bigint NOT NULL,
 uploaded_by uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.expense_attachments TO authenticated;
GRANT ALL ON public.expense_attachments TO service_role;
ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY expense_attachment_read ON public.expense_attachments FOR SELECT TO authenticated USING (public.has_permission('finance.read'));
CREATE POLICY expense_attachment_add ON public.expense_attachments FOR INSERT TO authenticated WITH CHECK (public.has_permission('finance.write') OR public.has_permission('finance.propose'));
CREATE POLICY expense_attachment_remove ON public.expense_attachments FOR DELETE TO authenticated USING (public.has_permission('finance.write'));
DROP TRIGGER mandatory_committee_approval ON public.expense_attachments;
CREATE FUNCTION public.expense_from_paid_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.recurring_expenses; new_expense uuid;
BEGIN
 IF NEW.status='paid' AND OLD.status IS DISTINCT FROM 'paid' AND NEW.expense_id IS NULL THEN
 IF NEW.actual_amount IS NULL OR NEW.actual_amount <= 0 OR NEW.paid_on IS NULL THEN
 RAISE EXCEPTION 'Enter the actual amount and payment date before marking paid';
 END IF;
 SELECT * INTO s FROM public.recurring_expenses WHERE id=NEW.recurring_id;
 INSERT INTO public.expenses(expense_date,expense_month,category,description,amount,paid_by,method,notes,recorded_by)
 VALUES(NEW.paid_on,NEW.period,s.category,s.name,NEW.actual_amount,coalesce(nullif(s.vendor,''),'Committee'),coalesce(NEW.method,'online'),NEW.notes,auth.uid())
 RETURNING id INTO new_expense;
 NEW.expense_id:=new_expense;
 END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END $$;
CREATE TRIGGER paid_entry_creates_expense BEFORE UPDATE ON public.recurring_entries FOR EACH ROW EXECUTE FUNCTION public.expense_from_paid_entry();
CREATE FUNCTION public.generate_recurring_entries(_month text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE created integer; m date;
BEGIN
 IF NOT (public.has_permission('finance.write') OR public.has_permission('finance.propose')) THEN
 RAISE EXCEPTION 'Finance access required' USING ERRCODE='42501';
 END IF;
 IF _month !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'Invalid month'; END IF;
 m:=(_month||'-01')::date;
 INSERT INTO public.recurring_entries(recurring_id,period,expected_amount,created_by)
 SELECT s.id,_month,s.expected_amount,auth.uid()
 FROM public.recurring_expenses s
 WHERE s.status='active'
 AND s.start_date < m + interval '1 month'
 AND (s.end_date IS NULL OR s.end_date >= m)
 AND (s.frequency='monthly'
 OR (s.frequency='quarterly' AND mod((extract(year FROM m)::int*12+extract(month FROM m)::int) - (extract(year FROM s.start_date)::int*12+extract(month FROM s.start_date)::int),3)=0)
 OR (s.frequency='annually' AND extract(month FROM m)=extract(month FROM s.start_date)))
 ON CONFLICT (recurring_id,period) DO NOTHING;
 GET DIAGNOSTICS created=ROW_COUNT;
 RETURN created;
END $$;
REVOKE ALL ON FUNCTION public.generate_recurring_entries(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_recurring_entries(text) TO authenticated;
CREATE FUNCTION public.pay_recurring_entry(_entry uuid,_amount numeric,_paid_on date,_method text,_reference text,_notes text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_permission('finance.write') THEN RAISE EXCEPTION 'Finance write access required' USING ERRCODE='42501'; END IF;
 IF _amount IS NULL OR _amount<=0 THEN RAISE EXCEPTION 'Enter a positive amount'; END IF;
 IF _paid_on IS NULL THEN RAISE EXCEPTION 'Enter the payment date'; END IF;
 IF _method NOT IN ('cash','online') THEN RAISE EXCEPTION 'Choose a payment method'; END IF;
 UPDATE public.recurring_entries SET status='paid',actual_amount=_amount,paid_on=_paid_on,method=_method,payment_reference=nullif(_reference,''),notes=nullif(_notes,'') WHERE id=_entry AND status='planned';
 IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found or already paid'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.pay_recurring_entry(uuid,numeric,date,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pay_recurring_entry(uuid,numeric,date,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.approval_fields(_module text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE _module
 WHEN 'flats' THEN ARRAY['flat_number','resident_name','mobile','resident_user_id','billing_start','occupancy','tenant_name','tenant_phone','tenant_email','tenant_start','tenant_end']
 WHEN 'payments' THEN ARRAY['flat_id','amount','method','status','paid_on','month_covered','reference','notes']
 WHEN 'expenses' THEN ARRAY['expense_date','expense_month','category','description','amount','paid_by','method','notes']
 WHEN 'announcements' THEN ARRAY['title','category','description','event_date','event_time','location','expires_on','published']
 WHEN 'fund_years' THEN ARRAY['opening_balance']
 WHEN 'society_settings' THEN ARRAY['society_name','monthly_amount','upi_id','payee_name','effective_month','due_day','fy_start_month','reminders_enabled','reminder_start_day','reminder_time','reminder_timezone','reminder_frequency','reminder_method','payment_notifications']
 WHEN 'complaints' THEN ARRAY['category','status','priority','assigned_to','due_on','progress_update','resolution_details','reopen_requested']
 WHEN 'gallery_albums' THEN ARRAY['event_name','event_date','description','published','cover_photo_id','deleted']
 WHEN 'gallery_photos' THEN ARRAY['album_id','upload_id','deleted']
 WHEN 'gallery_budget' THEN ARRAY['budget_bytes']
 WHEN 'recurring_expenses' THEN ARRAY['name','category','expected_amount','due_day','vendor','start_date','end_date','frequency','notes','requires_receipt','status']
 WHEN 'recurring_entries' THEN ARRAY['expected_amount','status','actual_amount','paid_on','payment_reference','method','notes']
 ELSE NULL END
$$;
CREATE OR REPLACE FUNCTION public.submit_change(_module text,_action text,_key text,_values jsonb DEFAULT '{}') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prev jsonb; proposal uuid; email text; k text; cols text[]; keyvalue text; is_secretary boolean; is_treasurer boolean;
BEGIN
 is_secretary:=public.has_role(auth.uid(),'secretary') AND NOT public.has_role(auth.uid(),'president') AND NOT public.has_role(auth.uid(),'admin');
 is_treasurer:=public.has_role(auth.uid(),'treasurer') AND NOT public.has_role(auth.uid(),'president') AND NOT public.has_role(auth.uid(),'admin');
 IF NOT is_secretary AND NOT (is_treasurer AND _module IN ('recurring_expenses','recurring_entries','expenses')) THEN
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
DROP POLICY "President and submitting Secretary read proposals" ON public.change_proposals;
CREATE POLICY "President and submitters read proposals" ON public.change_proposals FOR SELECT TO authenticated
 USING (public.has_role(auth.uid(),'president') OR (submitted_by=auth.uid() AND (public.has_role(auth.uid(),'secretary') OR public.has_role(auth.uid(),'treasurer'))));
CREATE POLICY expense_document_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='expense-documents' AND public.has_permission('finance.read'));
CREATE POLICY expense_document_add ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='expense-documents' AND (public.has_permission('finance.write') OR public.has_permission('finance.propose')));
CREATE POLICY expense_document_remove ON storage.objects FOR DELETE TO authenticated USING (bucket_id='expense-documents' AND public.has_permission('finance.write'));