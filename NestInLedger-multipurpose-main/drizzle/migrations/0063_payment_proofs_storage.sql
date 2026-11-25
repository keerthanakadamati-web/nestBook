CREATE POLICY "payment proofs owner upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'payment-proofs' AND EXISTS (SELECT 1 FROM public.flats f WHERE f.id::text = (storage.foldername(name))[2] AND f.resident_user_id = auth.uid()));
CREATE POLICY "payment proofs read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payment-proofs' AND (public.has_permission('finance.read') OR EXISTS (SELECT 1 FROM public.flats f WHERE f.id::text = (storage.foldername(name))[2] AND f.resident_user_id = auth.uid())));