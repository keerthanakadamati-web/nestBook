CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.maintenance_reminders
  ADD COLUMN email_status text,
  ADD COLUMN email_error text,
  ADD COLUMN email_sent_at timestamptz,
  ADD COLUMN email_to text;

CREATE TABLE public.payment_emails (
  payment_id uuid PRIMARY KEY REFERENCES public.payments(id) ON DELETE CASCADE,
  email_status text NOT NULL DEFAULT 'sending',
  email_error text,
  email_to text,
  email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_emails TO authenticated;
GRANT ALL ON public.payment_emails TO service_role;
ALTER TABLE public.payment_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read payment emails" ON public.payment_emails
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.internal_tokens (
  name text PRIMARY KEY,
  token text NOT NULL
);
GRANT ALL ON public.internal_tokens TO service_role;
ALTER TABLE public.internal_tokens ENABLE ROW LEVEL SECURITY;
INSERT INTO public.internal_tokens (name, token)
VALUES ('email_hook', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.notify_payment_confirmed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed') THEN
    PERFORM net.http_post(
      url := 'https://project--0fd07ec0-305c-47b1-a041-c1113df57b56.lovable.app/api/public/hooks/payment-email',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT token FROM public.internal_tokens WHERE name='email_hook')),
      body := jsonb_build_object('payment_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_payment_confirmed() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER payments_confirmed_email
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.notify_payment_confirmed();