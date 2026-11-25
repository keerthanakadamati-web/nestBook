CREATE TABLE public.fund_years (
  fy_start integer PRIMARY KEY,
  opening_balance numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fund_years TO authenticated;
GRANT ALL ON public.fund_years TO service_role;
ALTER TABLE public.fund_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage fund years" ON public.fund_years FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.expenses ADD COLUMN expense_month text;
UPDATE public.expenses SET expense_month = to_char(expense_date, 'YYYY-MM') WHERE expense_month IS NULL;