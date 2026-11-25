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
  IF NOT EXISTS (SELECT 1 FROM public.flats WHERE id = _flat AND occupancy = 'owner') THEN
    RAISE EXCEPTION 'Only owners living in their flat can vote. Rented flats cannot vote.'; END IF;
  IF EXISTS (SELECT 1 FROM public.society_poll_votes WHERE poll_id = _poll AND flat_id = _flat) THEN
    RAISE EXCEPTION 'Your flat has already voted.'; END IF;
  INSERT INTO public.society_poll_votes (poll_id, option_id, flat_id, user_id) VALUES (_poll, _option, _flat, auth.uid());
END $$;

DROP POLICY IF EXISTS "Committee reads all votes, owners their own" ON public.society_poll_votes;
CREATE POLICY "President and Secretary read all votes, owners their own" ON public.society_poll_votes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'president') OR public.has_role(auth.uid(),'secretary')
    OR EXISTS (SELECT 1 FROM public.flats f WHERE f.id = flat_id AND f.resident_user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.poll_eligible_flats() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT count(*)::int FROM public.flats WHERE occupancy = 'owner' AND auth.uid() IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.poll_eligible_flats() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.poll_eligible_flats() TO authenticated;