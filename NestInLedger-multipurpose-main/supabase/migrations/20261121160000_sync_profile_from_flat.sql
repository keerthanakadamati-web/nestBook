create or replace function public.sync_profile_from_flat() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.resident_user_id is not null and coalesce(trim(new.resident_name),'') <> ''
     and (tg_op = 'INSERT' or new.resident_name is distinct from old.resident_name or new.resident_user_id is distinct from old.resident_user_id) then
    insert into public.profiles (user_id, full_name, updated_at) values (new.resident_user_id, trim(new.resident_name), now())
    on conflict (user_id) do update set full_name = excluded.full_name, updated_at = now();
  end if;
  return new;
end $$;
drop trigger if exists sync_profile_from_flat on public.flats;
create trigger sync_profile_from_flat after insert or update of resident_name, resident_user_id on public.flats for each row execute function public.sync_profile_from_flat();
insert into public.profiles (user_id, full_name, updated_at)
select distinct on (resident_user_id) resident_user_id, trim(resident_name), now() from public.flats
where resident_user_id is not null and trim(resident_name) <> '' order by resident_user_id, created_at desc
on conflict (user_id) do update set full_name = excluded.full_name, updated_at = now();
