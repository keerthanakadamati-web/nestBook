CREATE TABLE public.financial_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_type text NOT NULL CHECK(period_type IN ('monthly','yearly')), period_start date NOT NULL, period_end date NOT NULL, generated_at timestamptz NOT NULL DEFAULT now(), prepared_by uuid NOT NULL, prepared_email text NOT NULL, snapshot jsonb NOT NULL, status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','submitted','reviewed','approved')), submitted_at timestamptz, secretary_reviewed_at timestamptz, secretary_reviewed_by uuid, president_reviewed_at timestamptz, president_reviewed_by uuid, approved_at timestamptz, approved_by uuid, CHECK(period_end>period_start)
);
GRANT SELECT ON public.financial_reports TO authenticated;
GRANT ALL ON public.financial_reports TO service_role;
ALTER TABLE public.financial_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Committee report visibility" ON public.financial_reports FOR SELECT TO authenticated USING ((public.has_role(auth.uid(),'treasurer') AND prepared_by=auth.uid()) OR ((public.has_role(auth.uid(),'president') OR public.has_role(auth.uid(),'secretary')) AND status<>'prepared') OR public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS mandatory_committee_approval ON public.financial_reports;
COMMENT ON TABLE public.financial_reports IS 'Immutable financial snapshots. No direct authenticated writes; report-only RPCs permit preparation, submission, review and President approval without changing live finances.';
CREATE FUNCTION public.financial_report_snapshot(_start date,_end date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; fy integer; fydate date; opening numeric; collections numeric; expenses_total numeric; opening_due numeric; billed numeric; closing_due numeric; today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
 IF NOT public.has_permission('finance.read') THEN RAISE EXCEPTION 'Finance access required' USING ERRCODE='42501'; END IF;
 IF _end<=_start OR _start<>date_trunc('month',_start)::date OR _end<>date_trunc('month',_end)::date OR _start>today OR _end> (date_trunc('month',today)+interval '1 month')::date THEN RAISE EXCEPTION 'Choose a current or previous reporting period'; END IF;
 fy:=extract(year from _start)::integer-CASE WHEN extract(month from _start)<4 THEN 1 ELSE 0 END; fydate:=make_date(fy,4,1);
 SELECT coalesce((SELECT opening_balance FROM public.fund_years WHERE fy_start=fy),0)+coalesce((SELECT sum(amount) FROM public.payments WHERE status='confirmed' AND paid_on>=fydate AND paid_on<_start),0)-coalesce((SELECT sum(amount) FROM public.expenses WHERE coalesce(expense_month,to_char(expense_date,'YYYY-MM'))>=to_char(fydate,'YYYY-MM') AND coalesce(expense_month,to_char(expense_date,'YYYY-MM'))<to_char(_start,'YYYY-MM')),0) INTO opening;
 SELECT coalesce(sum(amount),0) INTO collections FROM public.payments WHERE status='confirmed' AND paid_on>=_start AND paid_on<_end AND paid_on<=today;
 SELECT coalesce(sum(amount),0) INTO expenses_total FROM public.expenses WHERE coalesce(expense_month,to_char(expense_date,'YYYY-MM'))>=to_char(_start,'YYYY-MM') AND coalesce(expense_month,to_char(expense_date,'YYYY-MM'))<to_char(_end,'YYYY-MM');
 WITH calc AS (SELECT f.id, greatest((extract(year from _start)::integer-extract(year from billing_start)::integer)*12+extract(month from _start)::integer-extract(month from billing_start)::integer,0)*1500 AS before_bill, greatest((extract(year from _end)::integer-extract(year from greatest(date_trunc('month',billing_start)::date,_start))::integer)*12+extract(month from _end)::integer-extract(month from greatest(date_trunc('month',billing_start)::date,_start))::integer,0)*1500 AS period_bill, coalesce((SELECT sum(amount) FROM public.payments WHERE flat_id=f.id AND status='confirmed' AND paid_on<_start),0) AS before_paid, coalesce((SELECT sum(amount) FROM public.payments WHERE flat_id=f.id AND status='confirmed' AND paid_on<_end AND paid_on<=today),0) AS end_paid FROM public.flats f)
 SELECT coalesce(sum(greatest(before_bill-before_paid,0)),0),coalesce(sum(period_bill),0),coalesce(sum(greatest(before_bill+period_bill-end_paid,0)),0) INTO opening_due,billed,closing_due FROM calc;
 SELECT jsonb_build_object('periodStart',_start,'periodEnd',_end,'asOf',today,'openingOutstanding',opening_due,'maintenanceBilled',billed,'maintenanceCollected',collections,'outstandingDues',closing_due,'otherReceipts',0,'totalIncome',collections,'totalExpenses',expenses_total,'openingBalance',opening,'closingBalance',opening+collections-expenses_total,'openingBalanceRecorded',EXISTS(SELECT 1 FROM public.fund_years WHERE fy_start=fy),'basis','Collections use confirmed payment dates. Expenses use their recorded expense month. Billing uses the existing 1500 per flat/month rule; advance payments reduce individual flat dues. Yearly periods are April–March. Current periods are as of the generation date. No separate other-receipts records exist.','expenseCategories',coalesce((SELECT jsonb_agg(x) FROM (SELECT category,sum(amount) AS amount FROM public.expenses WHERE coalesce(expense_month,to_char(expense_date,'YYYY-MM'))>=to_char(_start,'YYYY-MM') AND coalesce(expense_month,to_char(expense_date,'YYYY-MM'))<to_char(_end,'YYYY-MM') GROUP BY category ORDER BY category)x),'[]'::jsonb),'transactions',coalesce((SELECT jsonb_agg(x ORDER BY date,id) FROM (SELECT p.id,p.paid_on AS date,'Maintenance'::text AS kind,f.flat_number AS flat,p.amount,p.method,coalesce(p.reference,p.receipt_no) AS reference,p.month_covered AS description,to_char(p.paid_on,'YYYY-MM') AS accounting_month FROM public.payments p JOIN public.flats f ON f.id=p.flat_id WHERE p.status='confirmed' AND p.paid_on>=_start AND p.paid_on<_end AND p.paid_on<=today UNION ALL SELECT e.id,e.expense_date,'Expense',NULL,e.amount,e.method,NULL,e.category||CASE WHEN e.description<>'' THEN ': '||e.description ELSE '' END,coalesce(e.expense_month,to_char(e.expense_date,'YYYY-MM')) FROM public.expenses e WHERE coalesce(e.expense_month,to_char(e.expense_date,'YYYY-MM'))>=to_char(_start,'YYYY-MM') AND coalesce(e.expense_month,to_char(e.expense_date,'YYYY-MM'))<to_char(_end,'YYYY-MM'))x),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.financial_report_snapshot(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.financial_report_snapshot(date,date) TO authenticated;
CREATE FUNCTION public.prepare_financial_report(_type text,_start date) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE finish date; rid uuid; payload jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'treasurer') OR public.has_role(auth.uid(),'resident') AND NOT public.has_permission('finance.read') THEN RAISE EXCEPTION 'Treasurer access required' USING ERRCODE='42501'; END IF;
 IF _type='monthly' THEN finish:=(_start+interval '1 month')::date; ELSIF _type='yearly' AND extract(month from _start)=4 THEN finish:=(_start+interval '1 year')::date; ELSE RAISE EXCEPTION 'Invalid report period'; END IF;
 -- An in-progress financial year is a year-to-date report, not a future projection.
 IF _type='yearly' THEN finish:=least(finish,(date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')+interval '1 month')::date); END IF;
 payload:=public.financial_report_snapshot(_start,finish);
 INSERT INTO public.financial_reports(period_type,period_start,period_end,prepared_by,prepared_email,snapshot) VALUES(_type,_start,finish,auth.uid(),coalesce(auth.jwt()->>'email',auth.uid()::text),payload) RETURNING id INTO rid;
 RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.prepare_financial_report(text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_financial_report(text,date) TO authenticated;
CREATE FUNCTION public.transition_financial_report(_id uuid,_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
 ELSE RAISE EXCEPTION 'This report action is not allowed' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.transition_financial_report(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transition_financial_report(uuid,text) TO authenticated;