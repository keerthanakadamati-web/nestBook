CREATE TABLE public.society_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  expires_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.society_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.society_polls(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE public.society_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.society_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.society_poll_options(id) ON DELETE CASCADE,
  flat_id uuid NOT NULL REFERENCES public.flats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, flat_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.society_polls, public.society_poll_options TO authenticated;
GRANT SELECT ON public.society_poll_votes TO authenticated;
GRANT ALL ON public.society_polls, public.society_poll_options, public.society_poll_votes TO service_role;
ALTER TABLE public.society_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.society_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.society_poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in read polls" ON public.society_polls FOR SELECT TO authenticated USING (true);
CREATE POLICY "Committee manages polls" ON public.society_polls FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'president') OR has_role(auth.uid(),'secretary'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'president') OR has_role(auth.uid(),'secretary'));
CREATE POLICY "Signed-in read poll options" ON public.society_poll_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "Committee manages poll options" ON public.society_poll_options FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'president') OR has_role(auth.uid(),'secretary'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'president') OR has_role(auth.uid(),'secretary'));
CREATE POLICY "Signed-in read poll votes" ON public.society_poll_votes FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS mandatory_committee_approval ON public.society_polls;
DROP TRIGGER IF EXISTS mandatory_committee_approval ON public.society_poll_options;
DROP TRIGGER IF EXISTS mandatory_committee_approval ON public.society_poll_votes;

CREATE OR REPLACE FUNCTION public.cast_poll_vote(_poll uuid, _option uuid, _flat uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.society_polls;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in.'; END IF;
  SELECT * INTO p FROM public.society_polls WHERE id = _poll;
  IF NOT FOUND THEN RAISE EXCEPTION 'Poll not found.'; END IF;
  IF p.status <> 'active' OR (p.expires_at IS NOT NULL AND p.expires_at < now()) THEN
    RAISE EXCEPTION 'This poll is closed.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.society_poll_options WHERE id = _option AND poll_id = _poll) THEN
    RAISE EXCEPTION 'Invalid choice.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.flats WHERE id = _flat AND resident_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'You can vote only for your own flat.'; END IF;
  IF EXISTS (SELECT 1 FROM public.society_poll_votes WHERE poll_id = _poll AND flat_id = _flat) THEN
    RAISE EXCEPTION 'Your flat has already voted.'; END IF;
  INSERT INTO public.society_poll_votes (poll_id, option_id, flat_id, user_id) VALUES (_poll, _option, _flat, auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.cast_poll_vote(uuid, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cast_poll_vote(uuid, uuid, uuid) TO authenticated;