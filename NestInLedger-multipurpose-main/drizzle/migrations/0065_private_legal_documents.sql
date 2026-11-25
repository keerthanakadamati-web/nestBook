CREATE OR REPLACE FUNCTION public.can_access_legal_documents(_society uuid, _write boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') AND _society=public.current_society() AND (
 EXISTS(SELECT 1 FROM public.society_committee c WHERE c.user_id=auth.uid() AND c.society_id=_society AND c.role = ANY(CASE WHEN _write THEN ARRAY['president'] ELSE ARRAY['president','secretary','treasurer'] END))
 OR (NOT EXISTS(SELECT 1 FROM public.society_committee c WHERE c.user_id=auth.uid()) AND _society=(SELECT id FROM public.societies WHERE code='s1') AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid() AND r.role::text = ANY(CASE WHEN _write THEN ARRAY['president'] ELSE ARRAY['president','secretary','treasurer'] END)))
 )
$$;
REVOKE ALL ON FUNCTION public.can_access_legal_documents(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_legal_documents(uuid,boolean) TO authenticated,service_role;
CREATE TABLE public.legal_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), society_id uuid NOT NULL REFERENCES public.societies(id),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 150),
 file_path text NOT NULL UNIQUE, file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 255),
 file_size bigint NOT NULL CHECK(file_size>0 AND file_size<=10485760), mime_type text NOT NULL,
 uploaded_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.legal_documents TO authenticated;
GRANT ALL ON public.legal_documents TO service_role;
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY legal_document_committee_read ON public.legal_documents FOR SELECT TO authenticated USING(public.can_access_legal_documents(society_id,false));
CREATE OR REPLACE FUNCTION public.legal_document_object_access(_path text, _write boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid;
BEGIN
 IF split_part(_path,'/',1) !~ '^[0-9a-f-]{36}$' THEN RETURN false; END IF;
 BEGIN sid:=split_part(_path,'/',1)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 IF NOT public.can_access_legal_documents(sid,_write) THEN RETURN false; END IF;
 IF _write THEN RETURN split_part(_path,'/',2)=auth.uid()::text AND array_length(string_to_array(_path,'/'),1)=3 AND NOT EXISTS(SELECT 1 FROM public.legal_documents d WHERE d.file_path=_path); END IF;
 RETURN EXISTS(SELECT 1 FROM public.legal_documents d WHERE d.society_id=sid AND d.file_path=_path);
END $$;
REVOKE ALL ON FUNCTION public.legal_document_object_access(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.legal_document_object_access(text,boolean) TO authenticated,service_role;
CREATE POLICY legal_document_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='legal-documents' AND public.legal_document_object_access(name,true));
CREATE POLICY legal_document_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='legal-documents' AND public.legal_document_object_access(name,false));
CREATE POLICY legal_document_staging_cleanup ON storage.objects FOR DELETE TO authenticated USING(bucket_id='legal-documents' AND owner_id=auth.uid()::text AND public.legal_document_object_access(name,true));
CREATE OR REPLACE FUNCTION public.register_legal_document(_title text,_path text,_name text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid:=public.current_society(); obj storage.objects; result uuid;
BEGIN
 IF NOT public.can_access_legal_documents(sid,true) THEN RAISE EXCEPTION 'Only your President can upload legal documents.' USING ERRCODE='42501'; END IF;
 IF btrim(coalesce(_title,''))='' OR length(btrim(_title))>150 OR length(coalesce(_name,'')) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'Enter a valid title and file name.'; END IF;
 IF NOT public.legal_document_object_access(_path,true) THEN RAISE EXCEPTION 'Invalid upload.' USING ERRCODE='42501'; END IF;
 SELECT * INTO obj FROM storage.objects WHERE bucket_id='legal-documents' AND name=_path AND owner_id=auth.uid()::text;
 IF obj.id IS NULL OR coalesce((obj.metadata->>'size')::bigint,0) NOT BETWEEN 1 AND 10485760 OR coalesce(obj.metadata->>'mimetype','') NOT IN ('application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document') THEN RAISE EXCEPTION 'Choose a PDF, Word document, JPG or PNG up to 10 MB.'; END IF;
 INSERT INTO public.legal_documents(society_id,title,file_path,file_name,file_size,mime_type,uploaded_by) VALUES(sid,btrim(_title),_path,_name,(obj.metadata->>'size')::bigint,obj.metadata->>'mimetype',auth.uid()) RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.register_legal_document(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_legal_document(text,text,text) TO authenticated;
COMMENT ON TABLE public.legal_documents IS 'Private society-owned legal files: President uploads via validated RPC, committee reads scoped by society, no Admin or resident access.';