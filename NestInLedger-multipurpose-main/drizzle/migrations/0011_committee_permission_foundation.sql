CREATE OR REPLACE FUNCTION public.has_permission(_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND (
 (r.role IN ('admin','president') AND _permission IN ('admin.read','admin.write','finance.read','finance.write','roles.manage','audit.read','changes.approve')) OR
 (r.role = 'secretary' AND _permission IN ('admin.read','finance.read','changes.propose')) OR
 (r.role = 'treasurer' AND _permission IN ('finance.read','finance.propose'))))
$$;
REVOKE ALL ON FUNCTION public.has_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated, service_role;

ALTER POLICY "Admins manage announcements" ON public.announcements USING (public.has_permission('admin.write')) WITH CHECK (public.has_permission('admin.write'));
ALTER POLICY "Admins manage flats" ON public.flats USING (public.has_permission('admin.write')) WITH CHECK (public.has_permission('admin.write'));
ALTER POLICY "Admins manage expenses" ON public.expenses USING (public.has_permission('finance.write')) WITH CHECK (public.has_permission('finance.write'));
ALTER POLICY "Admins manage fund years" ON public.fund_years USING (public.has_permission('finance.write')) WITH CHECK (public.has_permission('finance.write'));
ALTER POLICY "Admins manage payments" ON public.payments USING (public.has_permission('finance.write')) WITH CHECK (public.has_permission('finance.write'));
ALTER POLICY "Admins can insert settings" ON public.society_settings WITH CHECK (public.has_permission('admin.write'));
ALTER POLICY "Admins can update settings" ON public.society_settings USING (public.has_permission('admin.write')) WITH CHECK (public.has_permission('admin.write'));
ALTER POLICY "Admins can read all roles" ON public.user_roles USING (public.has_permission('roles.manage'));
ALTER POLICY "Admins read reminders" ON public.maintenance_reminders USING (public.has_permission('finance.read'));
ALTER POLICY "Admins read payment emails" ON public.payment_emails USING (public.has_permission('finance.read'));
CREATE POLICY "Committee read flats" ON public.flats FOR SELECT TO authenticated USING (public.has_permission('admin.read'));
CREATE POLICY "Committee read announcements" ON public.announcements FOR SELECT TO authenticated USING (public.has_permission('admin.read'));
CREATE POLICY "Finance read payments" ON public.payments FOR SELECT TO authenticated USING (public.has_permission('finance.read'));
CREATE POLICY "Finance read expenses" ON public.expenses FOR SELECT TO authenticated USING (public.has_permission('finance.read'));
CREATE POLICY "Finance read fund years" ON public.fund_years FOR SELECT TO authenticated USING (public.has_permission('finance.read'));

CREATE VIEW public.finance_accounts WITH (security_barrier=true) AS
SELECT id, flat_number, resident_name, billing_start, outstanding, current_month_amount, status
FROM public.flat_accounts WHERE public.has_permission('finance.read');
REVOKE ALL ON public.finance_accounts FROM PUBLIC, anon;
GRANT SELECT ON public.finance_accounts TO authenticated;
GRANT ALL ON public.finance_accounts TO service_role;

-- Secretary/Treasurer cannot use owner submission/tenant RPCs as a bypass,
-- even if an administrator accidentally links their account to a flat.
ALTER POLICY "Residents submit own upi payment" ON public.payments WITH CHECK (
 method = 'upi' AND status = 'pending'
 AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('secretary','treasurer'))
 AND EXISTS (SELECT 1 FROM public.flats f WHERE f.id=payments.flat_id AND f.resident_user_id=auth.uid()));
CREATE OR REPLACE FUNCTION public.guard_committee_live_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.has_permission('admin.write')
 AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('secretary','treasurer')) THEN
 RAISE EXCEPTION 'President approval is required before changing live records' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_committee_live_changes() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER committee_flats_guard BEFORE INSERT OR UPDATE OR DELETE ON public.flats FOR EACH ROW EXECUTE FUNCTION public.guard_committee_live_changes();
CREATE TRIGGER committee_payments_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.guard_committee_live_changes();

CREATE OR REPLACE FUNCTION public.set_committee_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(91827364);
 IF NOT public.has_permission('roles.manage') THEN RAISE EXCEPTION 'Only the President or existing admin can manage roles' USING ERRCODE='42501'; END IF;
 IF _user_id=auth.uid() THEN RAISE EXCEPTION 'You cannot change your own role'; END IF;
 IF _role='admin' THEN RAISE EXCEPTION 'The admin role is reserved for existing accounts'; END IF;
 IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=_user_id) THEN RAISE EXCEPTION 'Account not found'; END IF;
 DELETE FROM public.user_roles WHERE user_id=_user_id AND role IN ('admin','president','secretary','treasurer','resident');
 INSERT INTO public.user_roles(user_id,role) VALUES (_user_id,_role);
END $$;
REVOKE ALL ON FUNCTION public.set_committee_role(uuid,public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_committee_role(uuid,public.app_role) TO authenticated;

-- Retain the old first-time setup endpoint without allowing later self-promotion.
CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(91827364);
 IF EXISTS (SELECT 1 FROM public.user_roles) THEN RETURN false; END IF;
 INSERT INTO public.user_roles(user_id,role) VALUES(auth.uid(),'admin');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_first_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.flats,public.payments,public.expenses,public.announcements,public.fund_years TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.society_settings TO authenticated;
GRANT SELECT ON public.user_roles,public.maintenance_reminders,public.payment_emails,public.flat_accounts TO authenticated;
GRANT ALL ON public.flats,public.payments,public.expenses,public.announcements,public.fund_years,public.society_settings,public.user_roles,public.maintenance_reminders,public.payment_emails TO service_role;