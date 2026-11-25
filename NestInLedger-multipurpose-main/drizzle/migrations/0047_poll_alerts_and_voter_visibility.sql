CREATE OR REPLACE FUNCTION public.push_on_poll() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'active' THEN PERFORM public.queue_push_event('poll', NEW.id::text); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS push_on_poll ON public.society_polls;
CREATE TRIGGER push_on_poll AFTER INSERT ON public.society_polls FOR EACH ROW EXECUTE FUNCTION public.push_on_poll();

DROP POLICY IF EXISTS "Signed-in read poll votes" ON public.society_poll_votes;
CREATE POLICY "Committee reads all votes, owners their own" ON public.society_poll_votes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'president') OR has_role(auth.uid(),'secretary')
    OR EXISTS (SELECT 1 FROM public.flats f WHERE f.id = flat_id AND f.resident_user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.poll_vote_counts() RETURNS TABLE(poll_id uuid, option_id uuid, votes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT v.poll_id, v.option_id, count(*) FROM public.society_poll_votes v WHERE auth.uid() IS NOT NULL GROUP BY 1,2
$$;
REVOKE ALL ON FUNCTION public.poll_vote_counts() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.poll_vote_counts() TO authenticated;