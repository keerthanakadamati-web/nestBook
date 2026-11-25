DROP TRIGGER IF EXISTS mandatory_committee_approval ON public.push_subscriptions;
DROP TRIGGER IF EXISTS mandatory_committee_approval ON public.push_delivery_logs;
COMMENT ON TABLE public.push_subscriptions IS 'Personal device notification sign-ups; owner-scoped RLS. Intentionally exempt from mandatory_committee_approval — do not re-attach.';
COMMENT ON TABLE public.push_delivery_logs IS 'Server-written push outcomes (service role only). Intentionally exempt from mandatory_committee_approval.';