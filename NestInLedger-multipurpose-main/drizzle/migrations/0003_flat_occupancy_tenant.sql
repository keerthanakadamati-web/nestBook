ALTER TABLE public.flats
  ADD COLUMN occupancy text NOT NULL DEFAULT 'owner' CHECK (occupancy IN ('owner','rented')),
  ADD COLUMN tenant_name text,
  ADD COLUMN tenant_phone text,
  ADD COLUMN tenant_email text,
  ADD COLUMN tenant_start date,
  ADD COLUMN tenant_end date;