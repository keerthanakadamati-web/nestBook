-- 1. Add society_id to society_settings (keeping id boolean default true for backward compatibility)
ALTER TABLE public.society_settings
  ADD COLUMN IF NOT EXISTS society_id uuid REFERENCES public.societies(id) ON DELETE CASCADE;

UPDATE public.society_settings
SET society_id = (SELECT id FROM public.societies WHERE code = 's1' LIMIT 1)
WHERE society_id IS NULL;

ALTER TABLE public.society_settings
  ALTER COLUMN society_id SET NOT NULL,
  ALTER COLUMN id SET DEFAULT true;

ALTER TABLE public.society_settings
  DROP CONSTRAINT IF EXISTS society_settings_single_row,
  DROP CONSTRAINT IF EXISTS society_settings_pkey;

ALTER TABLE public.society_settings
  ADD CONSTRAINT society_settings_pkey PRIMARY KEY (society_id);

-- 2. Add society_id to maintenance_rates
ALTER TABLE public.maintenance_rates
  ADD COLUMN IF NOT EXISTS society_id uuid REFERENCES public.societies(id) ON DELETE CASCADE;

UPDATE public.maintenance_rates
SET society_id = (SELECT id FROM public.societies WHERE code = 's1' LIMIT 1)
WHERE society_id IS NULL;

ALTER TABLE public.maintenance_rates
  ALTER COLUMN society_id SET NOT NULL,
  ALTER COLUMN society_id SET DEFAULT public.current_society();

ALTER TABLE public.maintenance_rates
  DROP CONSTRAINT IF EXISTS maintenance_rates_effective_month_key;

ALTER TABLE public.maintenance_rates
  ADD CONSTRAINT maintenance_rates_society_month_key UNIQUE (society_id, effective_month);

-- 3. Update validate_society_configuration() to be society-scoped
CREATE OR REPLACE FUNCTION public.validate_society_configuration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  changed boolean;
  localmonth date := date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NEW.monthly_amount IS NULL OR NEW.due_day IS NULL OR NEW.fy_start_month IS NULL
     OR NEW.reminder_start_day IS NULL OR NEW.reminders_enabled IS NULL
     OR NEW.payment_notifications IS NULL OR NEW.reminder_time IS NULL
     OR NEW.monthly_amount <= 0 OR NEW.monthly_amount > 100000000
     OR NEW.monthly_amount <> round(NEW.monthly_amount, 2) THEN
    RAISE EXCEPTION 'Enter a positive maintenance amount with at most two decimal places';
  END IF;
  IF NEW.due_day NOT BETWEEN 1 AND 31 OR NEW.reminder_start_day NOT BETWEEN 1 AND 31 OR NEW.fy_start_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Invalid day or financial year month';
  END IF;
  IF NEW.reminder_frequency IS DISTINCT FROM 'daily' OR NEW.reminder_method IS DISTINCT FROM 'gmail' THEN
    RAISE EXCEPTION 'Only the existing daily Gmail reminders are supported';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.reminder_timezone) THEN
    RAISE EXCEPTION 'Invalid time zone';
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.maintenance_rates(society_id, effective_month, monthly_amount, due_day, fy_start_month, approved_by)
    VALUES (NEW.society_id, DATE '1900-01-01', NEW.monthly_amount, NEW.due_day, NEW.fy_start_month, auth.uid())
    ON CONFLICT (society_id, effective_month) DO NOTHING;
    RETURN NEW;
  END IF;

  changed := (NEW.monthly_amount, NEW.due_day, NEW.fy_start_month, NEW.effective_month)
    IS DISTINCT FROM (OLD.monthly_amount, OLD.due_day, OLD.fy_start_month, OLD.effective_month);
  IF changed THEN
    IF NEW.effective_month <= localmonth OR NEW.effective_month <> date_trunc('month', NEW.effective_month)::date THEN
      RAISE EXCEPTION 'The effective month must be a future month';
    END IF;
    IF NEW.fy_start_month <> OLD.fy_start_month AND extract(month FROM NEW.effective_month) <> NEW.fy_start_month THEN
      RAISE EXCEPTION 'A financial year change must start in its new starting month';
    END IF;
    INSERT INTO public.maintenance_rates(society_id, effective_month, monthly_amount, due_day, fy_start_month, approved_by)
    VALUES (NEW.society_id, NEW.effective_month, NEW.monthly_amount, NEW.due_day, NEW.fy_start_month, auth.uid());
  END IF;
  RETURN NEW;
END
$function$;

-- 4. Seed default society_settings and historical maintenance_rates for all existing societies
INSERT INTO public.society_settings (
  id, society_id, society_name, monthly_amount, upi_id, payee_name,
  effective_month, due_day, fy_start_month,
  reminders_enabled, reminder_start_day, reminder_time, reminder_timezone,
  reminder_frequency, reminder_method, payment_notifications
)
SELECT
  true,
  s.id,
  s.name,
  1500.00,
  '',
  s.name,
  (date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') + interval '1 month')::date,
  1,
  4,
  true,
  1,
  TIME '10:00:00',
  'Asia/Kolkata',
  'daily',
  'gmail',
  true
FROM public.societies s
WHERE NOT EXISTS (
  SELECT 1 FROM public.society_settings ss WHERE ss.society_id = s.id
);

-- 5. Auto-create default society_settings when a new society is created
CREATE OR REPLACE FUNCTION public.init_society_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.decision_ok', 'on', true);
  INSERT INTO public.society_settings (
    id, society_id, society_name, monthly_amount, upi_id, payee_name,
    effective_month, due_day, fy_start_month,
    reminders_enabled, reminder_start_day, reminder_time, reminder_timezone,
    reminder_frequency, reminder_method, payment_notifications
  ) VALUES (
    true,
    NEW.id,
    NEW.name,
    1500.00,
    '',
    NEW.name,
    (date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') + interval '1 month')::date,
    1,
    4,
    true,
    1,
    TIME '10:00:00',
    'Asia/Kolkata',
    'daily',
    'gmail',
    true
  ) ON CONFLICT (society_id) DO NOTHING;
  PERFORM set_config('app.decision_ok', 'off', true);
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_init_society_settings ON public.societies;
CREATE TRIGGER trg_init_society_settings
AFTER INSERT ON public.societies
FOR EACH ROW EXECUTE FUNCTION public.init_society_settings();

-- 6. Update RLS policies for society_settings, maintenance_rates, and reminder_runs
DROP POLICY IF EXISTS "Labanya settings only" ON public.society_settings;
CREATE POLICY "Society settings scoped to active society"
  ON public.society_settings
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (society_id = public.current_society())
  WITH CHECK (society_id = public.current_society());

DROP POLICY IF EXISTS "Maintenance rates scoped to active society" ON public.maintenance_rates;
CREATE POLICY "Maintenance rates scoped to active society"
  ON public.maintenance_rates
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (society_id = public.current_society())
  WITH CHECK (society_id = public.current_society());

DROP POLICY IF EXISTS "Committee read reminder execution" ON public.reminder_runs;
CREATE POLICY "Committee read reminder execution"
  ON public.reminder_runs
  FOR SELECT
  TO authenticated
  USING (public.has_permission('admin.read') OR public.has_permission('finance.read'));

-- 7. Update maintenance_rate, bill_amount, freeze_monthly_bills, set_payment_configuration, notify_payment_confirmed, reminder_is_due, record_maintenance_reminders
CREATE OR REPLACE FUNCTION public.maintenance_rate(_month date, _society uuid DEFAULT public.current_society())
RETURNS public.maintenance_rates
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r
  FROM public.maintenance_rates r
  WHERE r.society_id = COALESCE(_society, (SELECT id FROM public.societies WHERE code = 's1' LIMIT 1))
    AND r.effective_month <= date_trunc('month', _month)::date
  ORDER BY r.effective_month DESC
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.bill_amount(_flat uuid, _month date)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    (SELECT amount FROM public.maintenance_bills WHERE flat_id = _flat AND bill_month = date_trunc('month', _month)::date),
    (public.maintenance_rate(_month, (SELECT society_id FROM public.flats WHERE id = _flat))).monthly_amount,
    1500
  )
$function$;

CREATE OR REPLACE FUNCTION public.freeze_monthly_bills()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  INSERT INTO public.maintenance_bills(flat_id, bill_month, amount, due_date)
  SELECT
    f.id,
    m::date,
    (public.maintenance_rate(m::date, f.society_id)).monthly_amount,
    public.maintenance_due_date(m::date, (public.maintenance_rate(m::date, f.society_id)).due_day)
  FROM public.flats f
  CROSS JOIN LATERAL generate_series(
    date_trunc('month', f.billing_start),
    date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata'),
    interval '1 month'
  ) m
  ON CONFLICT (flat_id, bill_month) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$function$;

CREATE OR REPLACE FUNCTION public.set_payment_configuration(_upi_id text, _payee_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'treasurer') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only the Treasurer can change payment configuration' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.decision_ok', 'on', true);
  UPDATE public.society_settings
  SET upi_id = trim(_upi_id), payee_name = trim(_payee_name), updated_at = now()
  WHERE society_id = public.current_society();
  PERFORM set_config('app.decision_ok', 'off', true);
END
$function$;

CREATE OR REPLACE FUNCTION public.notify_payment_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE enabled boolean;
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed') THEN
    SELECT ss.payment_notifications INTO enabled
    FROM public.flats f
    JOIN public.society_settings ss ON ss.society_id = f.society_id
    WHERE f.id = NEW.flat_id;
    IF coalesce(enabled, false) THEN
      PERFORM net.http_post(
        url := 'https://project--0fd07ec0-305c-47b1-a041-c1113df57b56.lovable.app/api/public/hooks/payment-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT token FROM public.internal_tokens WHERE name = 'email_hook')
        ),
        body := jsonb_build_object('payment_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.reminder_is_due(_at timestamp with time zone, _society uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.society_settings ss
    WHERE (_society IS NULL OR ss.society_id = _society)
      AND ss.reminders_enabled
      AND extract(day FROM _at AT TIME ZONE ss.reminder_timezone) >= ss.reminder_start_day
      AND (_at AT TIME ZONE ss.reminder_timezone)::time >= ss.reminder_time
  )
$function$;

CREATE OR REPLACE FUNCTION public.record_maintenance_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s record;
  today date;
  n integer := 0;
  added integer;
BEGIN
  FOR s IN
    SELECT society_id, reminder_timezone
    FROM public.society_settings
    WHERE reminders_enabled
      AND extract(day FROM now() AT TIME ZONE reminder_timezone) >= reminder_start_day
      AND (now() AT TIME ZONE reminder_timezone)::time >= reminder_time
  LOOP
    today := (now() AT TIME ZONE s.reminder_timezone)::date;
    INSERT INTO public.maintenance_reminders(flat_id, reminder_date, amount_due)
    SELECT fa.id, today, fa.outstanding
    FROM public.flat_accounts fa
    JOIN public.flats f ON f.id = fa.id
    WHERE f.society_id = s.society_id AND fa.outstanding > 0
    ON CONFLICT (flat_id, reminder_date) DO NOTHING;
    GET DIAGNOSTICS added = ROW_COUNT;
    n := n + added;
  END LOOP;
  RETURN n;
END
$function$;

-- 8. Update proposal_snapshot, submit_change_bounded_legacy, and decide_change_core for per-society society_settings + Treasurer proposals
CREATE OR REPLACE FUNCTION public.proposal_snapshot(_module text, _key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  resolved_key text := _key;
  col text;
BEGIN
  IF _module = 'user_roles' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.role), '[]')
    INTO result
    FROM public.user_roles r
    WHERE user_id = _key::uuid;
    RETURN result;
  END IF;
  IF public.approval_fields(_module) IS NULL THEN
    RAISE EXCEPTION 'Unsupported administrative module';
  END IF;
  IF _module = 'society_settings' THEN
    col := 'society_id';
    IF _key = 'true' OR nullif(_key, '') IS NULL THEN
      resolved_key := public.current_society()::text;
    END IF;
  ELSIF _module = 'fund_years' THEN
    col := 'fy_start';
  ELSE
    col := 'id';
  END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE %I::text=$1 FOR UPDATE', _module, col)
  INTO result
  USING resolved_key;
  RETURN result;
END
$function$;

CREATE OR REPLACE FUNCTION public.submit_change_bounded_legacy(_module text, _action text, _key text, _values jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  prev jsonb;
  proposal uuid;
  email text;
  k text;
  cols text[];
  keyvalue text;
  is_secretary boolean;
  is_treasurer boolean;
BEGIN
  is_secretary := public.has_role(auth.uid(), 'secretary') AND NOT public.has_role(auth.uid(), 'president') AND NOT public.has_role(auth.uid(), 'admin');
  is_treasurer := public.has_role(auth.uid(), 'treasurer') AND NOT public.has_role(auth.uid(), 'president') AND NOT public.has_role(auth.uid(), 'admin');
  IF NOT is_secretary AND NOT (is_treasurer AND _module IN ('recurring_expenses', 'recurring_entries', 'expenses', 'society_settings')) THEN
    RAISE EXCEPTION 'Only authorized committee members can submit proposals' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_values) <> 'object' THEN RAISE EXCEPTION 'Invalid proposed values'; END IF;
  IF _action = 'create_login' AND _module = 'flats' THEN
    IF _values - 'email' <> '{}' OR coalesce(_values->>'email', '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'Enter a valid owner email';
    END IF;
  ELSIF _action = 'set_role' AND _module = 'user_roles' THEN
    IF _values - 'role' <> '{}' OR coalesce(_values->>'role', '') NOT IN ('resident', 'secretary', 'treasurer', 'president') THEN
      RAISE EXCEPTION 'Invalid role';
    END IF;
    IF _key = auth.uid()::text THEN RAISE EXCEPTION 'You cannot request a change to your own role'; END IF;
  ELSE
    cols := public.approval_fields(_module);
    IF cols IS NULL OR _action NOT IN ('create', 'update', 'delete') THEN RAISE EXCEPTION 'Unsupported administrative change'; END IF;
    FOR k IN SELECT jsonb_object_keys(_values) LOOP
      IF NOT k = ANY(cols) THEN RAISE EXCEPTION 'Field is not permitted: %', k; END IF;
    END LOOP;
    IF _action = 'delete' AND _values <> '{}' THEN RAISE EXCEPTION 'Deletion must not include replacement values'; END IF;
    IF _action <> 'delete' AND _values = '{}' THEN RAISE EXCEPTION 'Enter proposed values'; END IF;
  END IF;

  IF _module = 'society_settings' THEN
    keyvalue := public.current_society()::text;
  ELSE
    keyvalue := CASE WHEN _action = 'create' AND _module NOT IN ('fund_years', 'society_settings') THEN gen_random_uuid()::text ELSE _key END;
  END IF;
  IF keyvalue IS NULL OR keyvalue = '' THEN RAISE EXCEPTION 'Record is required'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_module || ':' || keyvalue, 0));
  prev := public.proposal_snapshot(_module, keyvalue);
  IF _action = 'create' THEN
    IF prev IS NOT NULL THEN RAISE EXCEPTION 'Record already exists'; END IF;
  ELSIF prev IS NULL THEN
    RAISE EXCEPTION 'Record not found';
  END IF;
  IF _action = 'set_role' AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = keyvalue::uuid) THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF _action = 'create_login' AND prev->>'resident_user_id' IS NOT NULL THEN RAISE EXCEPTION 'Flat already has a linked owner'; END IF;

  SELECT u.email INTO email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO public.change_proposals(module, action, record_key, previous_values, proposed_values, submitted_by, submitted_email, society_id)
  VALUES (_module, _action, keyvalue, prev, _values, auth.uid(), coalesce(email, auth.uid()::text), public.current_society())
  RETURNING id INTO proposal;
  INSERT INTO public.change_audit(proposal_id, event, actor_id, previous_values, proposed_values)
  VALUES (proposal, 'submitted', auth.uid(), prev, _values);
  RETURN proposal;
END
$function$;

CREATE OR REPLACE FUNCTION public.decide_change_core(_id uuid, _approve boolean, _comment text DEFAULT ''::text, _resolved_user uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p public.change_proposals;
  current_values jsonb;
  merged jsonb;
  applied jsonb;
  columns_sql text;
  select_sql text;
  assignments text;
  col text;
  target_key text;
BEGIN
  IF current_setting('app.decision_ok', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Use the approval decision function' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM public.change_proposals WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;
  IF p.submitted_by = auth.uid() THEN RAISE EXCEPTION 'You cannot approve your own proposal' USING ERRCODE = '42501'; END IF;
  IF p.status <> 'pending' THEN RAISE EXCEPTION 'This proposal has already been decided'; END IF;
  IF NOT _approve THEN
    IF trim(coalesce(_comment, '')) = '' THEN RAISE EXCEPTION 'Give a reason for rejection'; END IF;
    UPDATE public.change_proposals SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_comment = _comment WHERE id = _id;
    INSERT INTO public.change_audit(proposal_id, event, actor_id, comment) VALUES (_id, 'rejected', auth.uid(), _comment);
    RETURN;
  END IF;

  target_key := CASE WHEN p.module = 'society_settings' AND p.record_key = 'true' THEN coalesce(p.society_id, public.current_society())::text ELSE p.record_key END;
  PERFORM pg_advisory_xact_lock(hashtextextended(p.module || ':' || target_key, 0));
  current_values := public.proposal_snapshot(p.module, target_key);
  IF current_values IS DISTINCT FROM p.previous_values THEN
    RAISE EXCEPTION 'Record changed since submission. Reject and request a fresh proposal.' USING ERRCODE = '40001';
  END IF;

  IF p.action = 'set_role' THEN
    IF p.record_key = auth.uid()::text OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p.record_key::uuid AND role = 'admin') THEN
      RAISE EXCEPTION 'Cannot change your own role or a legacy admin';
    END IF;
    PERFORM public.set_committee_role(p.record_key::uuid, (p.proposed_values->>'role')::public.app_role);
    applied := public.proposal_snapshot('user_roles', p.record_key);
  ELSIF p.action = 'create_login' THEN
    IF _resolved_user IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _resolved_user AND lower(email) = lower(p.proposed_values->>'email')) THEN
      RAISE EXCEPTION 'Owner account must match the requested email';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _resolved_user AND role <> 'resident') THEN
      RAISE EXCEPTION 'Cannot link a committee account as an owner';
    END IF;
    INSERT INTO public.user_roles(user_id, role) VALUES (_resolved_user, 'resident') ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.flats SET resident_user_id = _resolved_user WHERE id = p.record_key::uuid;
    applied := public.proposal_snapshot('flats', p.record_key);
  ELSE
    col := CASE WHEN p.module = 'fund_years' THEN 'fy_start' WHEN p.module = 'society_settings' THEN 'society_id' ELSE 'id' END;
    IF p.action = 'delete' THEN
      IF p.module = 'flats' AND (EXISTS (SELECT 1 FROM public.payments WHERE flat_id = p.record_key::uuid) OR EXISTS (SELECT 1 FROM public.maintenance_reminders WHERE flat_id = p.record_key::uuid)) THEN
        RAISE EXCEPTION 'Flat has financial or reminder records and cannot be deleted';
      END IF;
      EXECUTE format('DELETE FROM public.%I WHERE %I::text=$1', p.module, col) USING target_key;
      applied := NULL;
    ELSE
      merged := coalesce(current_values, '{}') || p.proposed_values;
      IF p.action = 'create' THEN
        merged := merged || jsonb_build_object(col, target_key);
        IF p.module = 'payments' OR p.module = 'expenses' THEN merged := merged || jsonb_build_object('recorded_by', p.submitted_by); END IF;
        IF p.module = 'announcements' THEN merged := merged || jsonb_build_object('created_by', p.submitted_by); END IF;
        SELECT string_agg(format('%I', key), ',' ORDER BY key), string_agg(format('x.%I', key), ',' ORDER BY key)
        INTO columns_sql, select_sql
        FROM jsonb_object_keys(merged) key;
        EXECUTE format('INSERT INTO public.%I(%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) x', p.module, columns_sql, select_sql, p.module) USING merged;
      ELSE
        SELECT string_agg(format('%I=x.%I', key, key), ',' ORDER BY key)
        INTO assignments
        FROM jsonb_object_keys(p.proposed_values) key;
        EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) x WHERE t.%I::text=$2', p.module, assignments, p.module, col) USING merged, target_key;
      END IF;
      applied := public.proposal_snapshot(p.module, target_key);
    END IF;
  END IF;

  UPDATE public.change_proposals
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_comment = _comment, applied_values = applied
  WHERE id = _id;
  INSERT INTO public.change_audit(proposal_id, event, actor_id, comment, previous_values, proposed_values)
  VALUES (_id, 'approved', auth.uid(), _comment, p.previous_values, p.proposed_values);
  INSERT INTO public.change_audit(proposal_id, event, actor_id, previous_values, proposed_values)
  VALUES (_id, 'applied', auth.uid(), p.previous_values, applied);
END
$function$;
