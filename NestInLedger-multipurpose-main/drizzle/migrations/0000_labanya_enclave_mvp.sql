-- Roles
create type public.app_role as enum ('admin', 'resident');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;

create policy "Users can read own roles"
on public.user_roles for select to authenticated
using (user_id = auth.uid());

create policy "Admins can read all roles"
on public.user_roles for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- Society settings (single row)
create table public.society_settings (
  id boolean primary key default true,
  society_name text not null default 'Labanya Enclave',
  monthly_amount numeric(10,2) not null default 1500,
  upi_id text not null default '',
  payee_name text not null default 'Labanya Enclave',
  updated_at timestamptz not null default now(),
  constraint society_settings_single_row check (id)
);

grant select on public.society_settings to authenticated;
grant insert, update on public.society_settings to authenticated;
grant all on public.society_settings to service_role;
alter table public.society_settings enable row level security;

create policy "Everyone signed in can read settings"
on public.society_settings for select to authenticated using (true);

create policy "Admins can insert settings"
on public.society_settings for insert to authenticated
with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update settings"
on public.society_settings for update to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

insert into public.society_settings (id) values (true);

-- Flats
create table public.flats (
  id uuid primary key default gen_random_uuid(),
  flat_number text not null unique,
  resident_name text not null,
  mobile text not null,
  resident_user_id uuid unique,
  billing_start date not null default date_trunc('month', now())::date,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.flats to authenticated;
grant all on public.flats to service_role;
alter table public.flats enable row level security;

create policy "Admins manage flats"
on public.flats for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy "Residents read own flat"
on public.flats for select to authenticated
using (resident_user_id = auth.uid());

-- Payments
create sequence public.receipt_seq start 1001;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  method text not null check (method in ('upi', 'cash')),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'rejected')),
  paid_on date not null default current_date,
  month_covered text not null default to_char(now(), 'FMMonth YYYY'),
  reference text,
  notes text,
  recorded_by uuid,
  receipt_no text not null unique default 'LE-' || nextval('public.receipt_seq')::text,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;

create policy "Admins manage payments"
on public.payments for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy "Residents read own payments"
on public.payments for select to authenticated
using (exists (
  select 1 from public.flats f
  where f.id = payments.flat_id and f.resident_user_id = auth.uid()
));

create policy "Residents submit own upi payment"
on public.payments for insert to authenticated
with check (
  method = 'upi'
  and status = 'pending'
  and exists (
    select 1 from public.flats f
    where f.id = payments.flat_id and f.resident_user_id = auth.uid()
  )
);

-- Account summary view (respects RLS of underlying tables)
create view public.flat_accounts with (security_invoker = true) as
with billed as (
  select
    f.id,
    f.flat_number,
    f.resident_name,
    f.mobile,
    f.resident_user_id,
    f.billing_start,
    greatest(
      (date_part('year', current_date) - date_part('year', f.billing_start)) * 12
      + (date_part('month', current_date) - date_part('month', f.billing_start)) + 1,
      0
    )::int as months_billed,
    coalesce((
      select sum(p.amount) from public.payments p
      where p.flat_id = f.id and p.status = 'confirmed'
    ), 0)::numeric as total_paid
  from public.flats f
)
select
  b.*,
  (b.months_billed * 1500)::numeric as total_charged,
  greatest(b.months_billed * 1500 - b.total_paid, 0)::numeric as outstanding,
  1500::numeric as current_month_amount,
  greatest((b.months_billed - 1) * 1500 - b.total_paid, 0)::numeric as previous_outstanding,
  case
    when greatest(b.months_billed * 1500 - b.total_paid, 0) = 0 then 'paid'
    when mod(greatest(b.months_billed * 1500 - b.total_paid, 0), 1500) <> 0 then 'partial'
    else 'outstanding'
  end as status
from billed b;

grant select on public.flat_accounts to authenticated;
grant all on public.flat_accounts to service_role;

-- First signed-up user becomes admin (society secretary bootstrap)
create or replace function public.claim_first_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count int;
begin
  if auth.uid() is null then
    return false;
  end if;
  select count(*) into admin_count from public.user_roles where role = 'admin';
  if admin_count = 0 then
    insert into public.user_roles (user_id, role) values (auth.uid(), 'admin')
    on conflict do nothing;
    return true;
  end if;
  return false;
end;
$$;

grant execute on function public.claim_first_admin() to authenticated;
