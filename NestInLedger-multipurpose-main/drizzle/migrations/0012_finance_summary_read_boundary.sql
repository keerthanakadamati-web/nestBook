CREATE OR REPLACE VIEW public.finance_accounts WITH (security_barrier=true) AS
WITH billed AS (
 SELECT f.id,f.flat_number,f.resident_name,f.billing_start,
 GREATEST((date_part('year',CURRENT_DATE)-date_part('year',f.billing_start))*12+(date_part('month',CURRENT_DATE)-date_part('month',f.billing_start))+1,0)::integer months_billed,
 COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.flat_id=f.id AND p.status='confirmed'),0) total_paid
 FROM public.flats f WHERE public.has_permission('finance.read')
)
SELECT id,flat_number,resident_name,billing_start,
 GREATEST(months_billed*1500-total_paid,0) outstanding,1500::numeric current_month_amount,
 CASE WHEN GREATEST(months_billed*1500-total_paid,0)=0 THEN 'paid'
 WHEN mod(GREATEST(months_billed*1500-total_paid,0),1500)<>0 THEN 'partial' ELSE 'outstanding' END status
FROM billed;
REVOKE ALL ON public.finance_accounts FROM PUBLIC,anon;
GRANT SELECT ON public.finance_accounts TO authenticated;
GRANT ALL ON public.finance_accounts TO service_role;