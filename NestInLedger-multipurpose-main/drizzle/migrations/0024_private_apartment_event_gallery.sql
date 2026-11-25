CREATE TABLE public.gallery_albums (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), association text NOT NULL DEFAULT 'labanya-enclave' CHECK (association='labanya-enclave'),
 event_name text NOT NULL CHECK (length(trim(event_name)) BETWEEN 1 AND 160), event_date date NOT NULL,
 description text NOT NULL DEFAULT '' CHECK(length(description)<=5000), published boolean NOT NULL DEFAULT false,
 cover_photo_id uuid, created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), deleted boolean NOT NULL DEFAULT false
);
GRANT SELECT,INSERT,UPDATE ON public.gallery_albums TO authenticated;
GRANT ALL ON public.gallery_albums TO service_role;
ALTER TABLE public.gallery_albums ENABLE ROW LEVEL SECURITY;
CREATE POLICY gallery_album_read ON public.gallery_albums FOR SELECT TO authenticated USING (public.has_permission('admin.read') OR (published AND NOT deleted AND (public.has_role(auth.uid(),'resident') OR public.has_permission('finance.read'))));
CREATE POLICY gallery_album_write ON public.gallery_albums FOR ALL TO authenticated USING(public.has_permission('admin.write')) WITH CHECK(public.has_permission('admin.write'));
CREATE TABLE public.gallery_uploads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), album_id uuid NOT NULL REFERENCES public.gallery_albums(id), uploader uuid NOT NULL,
 file_path text NOT NULL UNIQUE, thumbnail_path text NOT NULL UNIQUE, file_name text NOT NULL,
 file_size bigint, thumbnail_size bigint, width integer, height integer, original_size bigint,
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','ready','accepted','removed')), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gallery_uploads TO authenticated;
GRANT ALL ON public.gallery_uploads TO service_role;
ALTER TABLE public.gallery_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY gallery_upload_read ON public.gallery_uploads FOR SELECT TO authenticated USING(public.has_permission('admin.read'));
CREATE TABLE public.gallery_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), album_id uuid NOT NULL REFERENCES public.gallery_albums(id), upload_id uuid NOT NULL UNIQUE REFERENCES public.gallery_uploads(id),
 file_path text NOT NULL UNIQUE DEFAULT '', thumbnail_path text NOT NULL UNIQUE DEFAULT '', file_name text NOT NULL DEFAULT '',
 file_size bigint NOT NULL DEFAULT 0, thumbnail_size bigint NOT NULL DEFAULT 0, width integer NOT NULL DEFAULT 0, height integer NOT NULL DEFAULT 0,
 uploader uuid, uploaded_at timestamptz NOT NULL DEFAULT now(), deleted boolean NOT NULL DEFAULT false
);
GRANT SELECT,INSERT,UPDATE ON public.gallery_photos TO authenticated;
GRANT ALL ON public.gallery_photos TO service_role;
ALTER TABLE public.gallery_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY gallery_photo_read ON public.gallery_photos FOR SELECT TO authenticated USING(public.has_permission('admin.read') OR (NOT deleted AND EXISTS(SELECT 1 FROM public.gallery_albums a WHERE a.id=album_id AND a.published AND NOT a.deleted) AND (public.has_role(auth.uid(),'resident') OR public.has_permission('finance.read'))));
CREATE POLICY gallery_photo_write ON public.gallery_photos FOR ALL TO authenticated USING(public.has_permission('admin.write')) WITH CHECK(public.has_permission('admin.write'));
CREATE TABLE public.gallery_budget (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), budget_bytes bigint NOT NULL DEFAULT 1000000000 CHECK(budget_bytes BETWEEN 1000000 AND 1000000000000), generation uuid NOT NULL DEFAULT gen_random_uuid(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,UPDATE ON public.gallery_budget TO authenticated;
GRANT ALL ON public.gallery_budget TO service_role;
ALTER TABLE public.gallery_budget ENABLE ROW LEVEL SECURITY;
CREATE POLICY gallery_budget_read ON public.gallery_budget FOR SELECT TO authenticated USING(public.has_permission('admin.read'));
CREATE POLICY gallery_budget_write ON public.gallery_budget FOR UPDATE TO authenticated USING(public.has_permission('admin.write')) WITH CHECK(public.has_permission('admin.write'));
CREATE TABLE public.gallery_storage_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), measured_at timestamptz NOT NULL DEFAULT now(), used_bytes bigint NOT NULL, file_count integer NOT NULL, photo_count integer NOT NULL
);
GRANT SELECT ON public.gallery_storage_history TO authenticated;
GRANT ALL ON public.gallery_storage_history TO service_role;
ALTER TABLE public.gallery_storage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY gallery_history_read ON public.gallery_storage_history FOR SELECT TO authenticated USING(public.has_permission('admin.read'));
CREATE TABLE public.gallery_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient_id uuid NOT NULL, generation uuid NOT NULL, threshold integer NOT NULL CHECK(threshold IN (70,85,95)),
 used_bytes bigint NOT NULL, budget_bytes bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz,
 UNIQUE(recipient_id,generation,threshold)
);
GRANT SELECT ON public.gallery_notifications TO authenticated;
GRANT ALL ON public.gallery_notifications TO service_role;
ALTER TABLE public.gallery_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY gallery_alert_read ON public.gallery_notifications FOR SELECT TO authenticated USING(recipient_id=auth.uid() AND (public.has_role(auth.uid(),'president') OR public.has_role(auth.uid(),'secretary')));
CREATE OR REPLACE FUNCTION public.approval_fields(_module text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT CASE _module
 WHEN 'flats' THEN ARRAY['flat_number','resident_name','mobile','resident_user_id','billing_start','occupancy','tenant_name','tenant_phone','tenant_email','tenant_start','tenant_end']
 WHEN 'payments' THEN ARRAY['flat_id','amount','method','status','paid_on','month_covered','reference','notes']
 WHEN 'expenses' THEN ARRAY['expense_date','expense_month','category','description','amount','paid_by','method','notes']
 WHEN 'announcements' THEN ARRAY['title','category','description','event_date','event_time','location','expires_on','published']
 WHEN 'fund_years' THEN ARRAY['opening_balance']
 WHEN 'society_settings' THEN ARRAY['society_name','monthly_amount','upi_id','payee_name','effective_month','due_day','fy_start_month','reminders_enabled','reminder_start_day','reminder_time','reminder_timezone','reminder_frequency','reminder_method','payment_notifications']
 WHEN 'complaints' THEN ARRAY['category','status','priority','assigned_to','due_on','progress_update','resolution_details','reopen_requested']
 WHEN 'gallery_albums' THEN ARRAY['event_name','event_date','description','published','cover_photo_id','deleted']
 WHEN 'gallery_photos' THEN ARRAY['album_id','upload_id','deleted']
 WHEN 'gallery_budget' THEN ARRAY['budget_bytes'] ELSE NULL END $$;
CREATE FUNCTION public.validate_gallery_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u public.gallery_uploads; BEGIN
 IF TG_TABLE_NAME='gallery_photos' THEN
  IF TG_OP='INSERT' THEN
   SELECT * INTO u FROM public.gallery_uploads WHERE id=NEW.upload_id FOR UPDATE;
   IF NOT FOUND OR u.state<>'ready' OR u.album_id<>NEW.album_id THEN RAISE EXCEPTION 'A verified gallery upload is required'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.gallery_albums WHERE id=NEW.album_id AND NOT deleted) THEN RAISE EXCEPTION 'Album unavailable'; END IF;
   NEW.file_path:=u.file_path; NEW.thumbnail_path:=u.thumbnail_path; NEW.file_name:=u.file_name;
   NEW.file_size:=u.file_size; NEW.thumbnail_size:=u.thumbnail_size; NEW.width:=u.width; NEW.height:=u.height; NEW.uploader:=u.uploader; NEW.uploaded_at:=u.created_at;
   UPDATE public.gallery_uploads SET state='accepted' WHERE id=u.id;
  ELSE
   IF (to_jsonb(NEW)-'deleted') IS DISTINCT FROM (to_jsonb(OLD)-'deleted') THEN RAISE EXCEPTION 'Photo metadata is immutable'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='gallery_albums' THEN
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.association<>OLD.association OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at) THEN RAISE EXCEPTION 'Album identity is immutable'; END IF;
  IF NEW.cover_photo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.gallery_photos WHERE id=NEW.cover_photo_id AND album_id=NEW.id AND NOT deleted) THEN RAISE EXCEPTION 'Cover must be an active photo in this album'; END IF;
 ELSIF TG_TABLE_NAME='gallery_budget' THEN
  NEW.updated_at:=now(); IF NEW.budget_bytes IS DISTINCT FROM OLD.budget_bytes THEN NEW.generation:=gen_random_uuid(); END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER gallery_photo_validation BEFORE INSERT OR UPDATE ON public.gallery_photos FOR EACH ROW EXECUTE FUNCTION public.validate_gallery_record();
CREATE TRIGGER gallery_album_validation BEFORE INSERT OR UPDATE ON public.gallery_albums FOR EACH ROW EXECUTE FUNCTION public.validate_gallery_record();
CREATE TRIGGER gallery_budget_validation BEFORE UPDATE ON public.gallery_budget FOR EACH ROW EXECUTE FUNCTION public.validate_gallery_record();
CREATE FUNCTION public.validate_gallery_proposal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v jsonb; u public.gallery_uploads; BEGIN
 IF NEW.module NOT IN ('gallery_albums','gallery_photos','gallery_budget') THEN RETURN NEW; END IF;
 IF NEW.action='delete' THEN RAISE EXCEPTION 'Use the bounded gallery removal action'; END IF;
 v:=coalesce(NEW.previous_values,'{}')||NEW.proposed_values;
 IF NEW.module='gallery_photos' THEN
  IF NEW.action='create' THEN
   SELECT * INTO u FROM public.gallery_uploads WHERE id=(v->>'upload_id')::uuid;
   IF NOT FOUND OR u.state<>'ready' OR u.uploader<>NEW.submitted_by OR u.album_id<>(v->>'album_id')::uuid THEN RAISE EXCEPTION 'Your verified upload is required'; END IF;
  ELSIF NEW.proposed_values - 'deleted'<>'{}' THEN RAISE EXCEPTION 'Only photo removal may be proposed'; END IF;
 ELSIF NEW.module='gallery_albums' THEN
  IF length(trim(coalesce(v->>'event_name',''))) NOT BETWEEN 1 AND 160 OR length(coalesce(v->>'description',''))>5000 OR v->>'event_date' IS NULL THEN RAISE EXCEPTION 'Enter a valid event name and date'; END IF;
  PERFORM (v->>'event_date')::date;
 ELSIF NEW.module='gallery_budget' THEN
  IF NEW.action<>'update' OR (v->>'budget_bytes')::bigint NOT BETWEEN 1000000 AND 1000000000000 THEN RAISE EXCEPTION 'Invalid gallery budget'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER gallery_proposal_validation BEFORE INSERT ON public.change_proposals FOR EACH ROW EXECUTE FUNCTION public.validate_gallery_proposal();
CREATE FUNCTION public.gallery_object_readable(_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (
 (public.has_permission('admin.read') AND EXISTS(SELECT 1 FROM public.gallery_uploads u WHERE _path IN (u.file_path,u.thumbnail_path) AND u.state<>'removed')) OR
 EXISTS(SELECT 1 FROM public.gallery_photos p JOIN public.gallery_albums a ON a.id=p.album_id WHERE _path IN(p.file_path,p.thumbnail_path) AND NOT p.deleted AND NOT a.deleted AND a.published AND (public.has_role(auth.uid(),'resident') OR public.has_permission('finance.read'))))
$$;
REVOKE ALL ON FUNCTION public.gallery_object_readable(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gallery_object_readable(text) TO authenticated;
CREATE POLICY gallery_private_files ON storage.objects FOR SELECT TO authenticated USING(bucket_id='apartment-event-photos' AND public.gallery_object_readable(name));
CREATE FUNCTION public.measure_gallery_storage() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE bytes bigint; files integer; photos integer; b public.gallery_budget; t integer; BEGIN
 IF NOT public.has_permission('admin.read') THEN RAISE EXCEPTION 'Gallery management access required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gallery-storage-measure',0));
 SELECT coalesce(sum((metadata->>'size')::bigint),0),count(*) INTO bytes,files FROM storage.objects WHERE bucket_id='apartment-event-photos';
 SELECT count(*) INTO photos FROM public.gallery_photos p JOIN public.gallery_albums a ON a.id=p.album_id WHERE NOT p.deleted AND NOT a.deleted;
 SELECT * INTO b FROM public.gallery_budget LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Gallery budget not configured'; END IF;
 INSERT INTO public.gallery_storage_history(used_bytes,file_count,photo_count) VALUES(bytes,files,photos);
 FOREACH t IN ARRAY ARRAY[70,85,95] LOOP
  IF bytes*100>=b.budget_bytes*t THEN
   INSERT INTO public.gallery_notifications(recipient_id,generation,threshold,used_bytes,budget_bytes)
   SELECT DISTINCT user_id,b.generation,t,bytes,b.budget_bytes FROM public.user_roles WHERE role IN('president','secretary')
   ON CONFLICT(recipient_id,generation,threshold) DO NOTHING;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('usedBytes',bytes,'fileCount',files,'photoCount',photos,'budgetBytes',b.budget_bytes);
END $$;
REVOKE ALL ON FUNCTION public.measure_gallery_storage() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.measure_gallery_storage() TO authenticated;
CREATE FUNCTION public.read_gallery_notifications() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT (public.has_role(auth.uid(),'president') OR public.has_role(auth.uid(),'secretary')) THEN RAISE EXCEPTION 'Access denied'; END IF;
 UPDATE public.gallery_notifications SET read_at=now() WHERE recipient_id=auth.uid() AND read_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.read_gallery_notifications() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_gallery_notifications() TO authenticated;
REVOKE ALL ON FUNCTION public.validate_gallery_record(),public.validate_gallery_proposal() FROM PUBLIC,anon,authenticated;