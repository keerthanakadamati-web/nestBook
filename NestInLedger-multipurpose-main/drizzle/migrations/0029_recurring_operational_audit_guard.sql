-- Operational audit rows are written only by SECURITY DEFINER recurring triggers.
-- No authenticated INSERT/UPDATE/DELETE grants or policies exist on this table.
DROP TRIGGER IF EXISTS mandatory_committee_approval ON public.recurring_expense_events;
REVOKE INSERT, UPDATE, DELETE ON public.recurring_expense_events FROM authenticated, anon;
CREATE UNIQUE INDEX IF NOT EXISTS recurring_entry_expense_once ON public.recurring_entries(expense_id) WHERE expense_id IS NOT NULL;