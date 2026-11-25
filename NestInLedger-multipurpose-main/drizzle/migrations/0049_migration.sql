create or replace function public.is_society_member() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.user_roles where user_id = auth.uid()) $$;
grant execute on function public.is_society_member() to authenticated;
alter policy "Signed-in can read license" on public.society_license using (public.is_society_member());
alter policy "Signed-in read equipment" on public.society_equipment using (public.is_society_member());
alter policy "Signed-in users read directory" on public.society_directory using (public.is_society_member());
alter policy "Signed-in users read society files" on public.society_files using (public.is_society_member());
alter policy "Signed-in read service logs" on public.equipment_service_logs using (public.is_society_member());
alter policy "Signed-in read society-documents" on storage.objects using (bucket_id = 'society-documents' and auth.uid() is not null and public.is_society_member());
alter policy "Private complaint photos read" on storage.objects using (bucket_id = 'complaint-photos' and exists (select 1 from public.complaints c where c.id::text = (storage.foldername(objects.name))[1] and (c.owner_id = auth.uid() or public.has_permission('admin.read') or exists (select 1 from public.flats f where f.id = c.flat_id and f.resident_user_id = auth.uid()))));