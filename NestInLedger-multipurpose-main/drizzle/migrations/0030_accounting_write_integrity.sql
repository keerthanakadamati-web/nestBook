CREATE TABLE public.flat_capacity (id boolean PRIMARY KEY DEFAULT true CHECK(id), used integer NOT NULL DEFAULT 0 CHECK(used BETWEEN 0 AND 15));
GRANT SELECT ON public.flat_capacity TO authenticated;
GRANT ALL ON public.flat_capacity TO service_role;
ALTER TABLE public.flat_capacity ENABLE ROW LEVEL SECURITY;
CREATE POLICY capacity_read ON public.flat_capacity FOR SELECT TO authenticated USING(public.has_permission('admin.read'));
DROP TRIGGER IF EXISTS mandatory_committee_approval ON public.flat_capacity;
LOCK TABLE public.flats IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO public.flat_capacity(id,used) SELECT true,count(*) FROM public.flats;
CREATE FUNCTION public.enforce_flat_capacity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='INSERT' THEN UPDATE public.flat_capacity SET used=used+1 WHERE id AND used<15; IF NOT FOUND THEN RAISE EXCEPTION 'All 15 authorized flats are already registered. A 16th flat is not allowed.' USING ERRCODE='23514'; END IF; RETURN NEW;
 ELSE UPDATE public.flat_capacity SET used=used-1 WHERE id; RETURN OLD; END IF;
END $$;
REVOKE ALL ON FUNCTION public.enforce_flat_capacity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER authorized_flat_capacity BEFORE INSERT OR DELETE ON public.flats FOR EACH ROW EXECUTE FUNCTION public.enforce_flat_capacity();
ALTER TABLE public.flats ADD CONSTRAINT flat_number_nonblank CHECK(length(btrim(flat_number))>0);
CREATE UNIQUE INDEX flats_canonical_number ON public.flats(lower(btrim(flat_number)));
ALTER TABLE public.maintenance_bills ADD CONSTRAINT billing_month_first CHECK(bill_month=date_trunc('month',bill_month)::date);
CREATE TABLE public.payment_requests (actor_id uuid NOT NULL, request_id uuid NOT NULL, payload jsonb NOT NULL, payment_id uuid NOT NULL UNIQUE, proposal_id uuid, cash_reviewed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,request_id));
GRANT SELECT ON public.payment_requests TO authenticated;
GRANT ALL ON public.payment_requests TO service_role;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_payment_requests ON public.payment_requests FOR SELECT TO authenticated USING(actor_id=auth.uid());
DROP TRIGGER IF EXISTS mandatory_committee_approval ON public.payment_requests;
COMMENT ON TABLE public.payment_requests IS 'Operational idempotency registry; RPC-only writes. No live payment or proposal write permission is granted by this table.';
CREATE UNIQUE INDEX payments_online_reference_unique ON public.payments(lower(btrim(reference))) WHERE method='upi' AND nullif(btrim(reference),'') IS NOT NULL;
ALTER FUNCTION public.submit_change(text,text,text,jsonb) RENAME TO submit_change_bounded_legacy;
REVOKE ALL ON FUNCTION public.submit_change_bounded_legacy(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.submit_payment(_request uuid,_values jsonb,_cash_reviewed boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=auth.uid(); privileged boolean; secretary boolean; vals jsonb; old public.payment_requests; pid uuid:=gen_random_uuid(); proposal uuid; recordkey text; k text; flat uuid; amt numeric; paiddate date; meth text;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Please sign in again.' USING ERRCODE='42501'; END IF;
 IF _request IS NULL OR jsonb_typeof(_values)<>'object' THEN RAISE EXCEPTION 'A payment request identity is required.'; END IF;
 FOR k IN SELECT jsonb_object_keys(_values) LOOP IF NOT k=ANY(ARRAY['flat_id','amount','method','status','paid_on','month_covered','reference','notes']) THEN RAISE EXCEPTION 'Payment field is not permitted: %',k; END IF; END LOOP;
 flat:=(_values->>'flat_id')::uuid; amt:=(_values->>'amount')::numeric; paiddate:=(_values->>'paid_on')::date; meth:=_values->>'method';
 IF flat IS NULL OR amt IS NULL OR amt<=0 OR amt<>round(amt,2) OR paiddate IS NULL OR paiddate>(now() AT TIME ZONE 'Asia/Kolkata')::date OR meth IS NULL OR meth NOT IN ('cash','upi') OR nullif(btrim(_values->>'month_covered'),'') IS NULL THEN RAISE EXCEPTION 'Enter a valid amount, actual payment date and payment description.'; END IF;
 privileged:=public.has_permission('admin.write'); secretary:=public.has_role(actor,'secretary') AND NOT privileged;
 IF NOT privileged AND NOT secretary AND NOT (meth='upi' AND EXISTS(SELECT 1 FROM public.flats WHERE id=flat AND resident_user_id=actor)) THEN RAISE EXCEPTION 'You cannot record a payment for this flat.' USING ERRCODE='42501'; END IF;
 IF _cash_reviewed AND NOT (privileged OR secretary) THEN RAISE EXCEPTION 'Committee review required.' USING ERRCODE='42501'; END IF;
 vals:=jsonb_build_object('flat_id',flat,'amount',amt,'method',meth,'status',CASE WHEN meth='cash' THEN 'confirmed' ELSE 'pending' END,'paid_on',paiddate,'month_covered',btrim(_values->>'month_covered'),'reference',CASE WHEN meth='upi' THEN nullif(btrim(_values->>'reference'),'') ELSE NULL END,'notes',nullif(btrim(_values->>'notes'),''));
 IF meth='upi' AND vals->>'reference' IS NULL THEN RAISE EXCEPTION 'Enter the bank transaction reference.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payment-request:'||actor||':'||_request,0));
 SELECT * INTO old FROM public.payment_requests WHERE actor_id=actor AND request_id=_request;
 IF FOUND THEN IF old.payload IS DISTINCT FROM vals OR old.cash_reviewed IS DISTINCT FROM _cash_reviewed THEN RAISE EXCEPTION 'This request was already used for different payment details.' USING ERRCODE='23505'; END IF; RETURN jsonb_build_object('payment_id',old.payment_id,'proposal_id',old.proposal_id,'pending',old.proposal_id IS NOT NULL,'replayed',true); END IF;
 IF meth='upi' THEN PERFORM pg_advisory_xact_lock(hashtextextended('bank-reference:'||lower(vals->>'reference'),0)); IF EXISTS(SELECT 1 FROM public.payments WHERE method='upi' AND lower(btrim(reference))=lower(vals->>'reference')) OR EXISTS(SELECT 1 FROM public.payment_requests r JOIN public.change_proposals p ON p.id=r.proposal_id WHERE p.status='pending' AND r.payload->>'method'='upi' AND lower(r.payload->>'reference')=lower(vals->>'reference')) THEN RAISE EXCEPTION 'This bank reference has already been submitted. Review the existing payment.' USING ERRCODE='23505'; END IF; END IF;
 IF meth='cash' THEN PERFORM pg_advisory_xact_lock(hashtextextended('cash-review:'||flat||':'||paiddate,0)); IF NOT _cash_reviewed AND (EXISTS(SELECT 1 FROM public.payments WHERE flat_id=flat AND method='cash' AND amount=amt AND paid_on=paiddate AND status<>'rejected') OR EXISTS(SELECT 1 FROM public.payment_requests r JOIN public.change_proposals p ON p.id=r.proposal_id WHERE p.status='pending' AND r.payload->>'method'='cash' AND (r.payload->>'flat_id')::uuid=flat AND (r.payload->>'amount')::numeric=amt AND (r.payload->>'paid_on')::date=paiddate)) THEN RAISE EXCEPTION 'A matching cash payment already exists. Check its receipt before recording a separate payment.' USING ERRCODE='23505'; END IF; IF _cash_reviewed AND vals->>'notes' IS NULL THEN RAISE EXCEPTION 'Add a note explaining why this is a separate cash payment.'; END IF; END IF;
 IF secretary THEN proposal:=public.submit_change_bounded_legacy('payments','create','',vals); SELECT record_key INTO recordkey FROM public.change_proposals WHERE id=proposal; pid:=recordkey::uuid; INSERT INTO public.payment_requests(actor_id,request_id,payload,payment_id,proposal_id,cash_reviewed) VALUES(actor,_request,vals,pid,proposal,_cash_reviewed);
 ELSE INSERT INTO public.payment_requests(actor_id,request_id,payload,payment_id,cash_reviewed) VALUES(actor,_request,vals,pid,_cash_reviewed); INSERT INTO public.payments(id,flat_id,amount,method,status,paid_on,month_covered,reference,notes,recorded_by) SELECT pid,x.flat_id,x.amount,x.method,x.status,x.paid_on,x.month_covered,x.reference,x.notes,actor FROM jsonb_populate_record(NULL::public.payments,vals) x;
 END IF;
 RETURN jsonb_build_object('payment_id',pid,'proposal_id',proposal,'pending',proposal IS NOT NULL,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.submit_payment(uuid,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_payment(uuid,jsonb,boolean) TO authenticated;
CREATE FUNCTION public.submit_change(_module text,_action text,_key text,_values jsonb DEFAULT '{}') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE result jsonb; BEGIN
 IF _module='payments' AND _action='create' THEN IF nullif(_key,'') IS NULL THEN RAISE EXCEPTION 'Use a retry-safe payment request.'; END IF; result:=public.submit_payment(_key::uuid,_values,false); RETURN (result->>'proposal_id')::uuid; END IF;
 RETURN public.submit_change_bounded_legacy(_module,_action,_key,_values);
END $$;
REVOKE ALL ON FUNCTION public.submit_change(text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_change(text,text,text,jsonb) TO authenticated;
CREATE FUNCTION public.guard_payment_request() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE req public.payment_requests; BEGIN
 IF TG_OP='INSERT' THEN
 SELECT * INTO req FROM public.payment_requests WHERE payment_id=NEW.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Use the retry-safe payment submission.' USING ERRCODE='42501'; END IF;
 IF (req.payload->>'flat_id')::uuid IS DISTINCT FROM NEW.flat_id OR (req.payload->>'amount')::numeric IS DISTINCT FROM NEW.amount OR req.payload->>'method' IS DISTINCT FROM NEW.method OR (req.payload->>'paid_on')::date IS DISTINCT FROM NEW.paid_on OR req.payload->>'status' IS DISTINCT FROM NEW.status OR req.payload->>'month_covered' IS DISTINCT FROM NEW.month_covered OR req.payload->>'reference' IS DISTINCT FROM NEW.reference OR req.payload->>'notes' IS DISTINCT FROM NEW.notes THEN RAISE EXCEPTION 'Payment details differ from the submitted request.'; END IF;
 END IF;
 IF NEW.method='upi' AND (TG_OP='INSERT' OR NEW.reference IS DISTINCT FROM OLD.reference OR NEW.method IS DISTINCT FROM OLD.method) THEN IF nullif(btrim(NEW.reference),'') IS NULL THEN RAISE EXCEPTION 'Bank reference is required.'; END IF; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_payment_request() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER payment_request_boundary BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.guard_payment_request();