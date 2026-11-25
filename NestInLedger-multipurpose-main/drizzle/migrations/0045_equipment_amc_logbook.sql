CREATE TABLE public.society_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  vendor_name text,
  vendor_phone text,
  amc_start date,
  amc_end date,
  amc_cost numeric,
  last_service date,
  next_service date,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.equipment_service_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.society_equipment(id) ON DELETE CASCADE,
  service_date date NOT NULL DEFAULT current_date,
  technician text,
  work_done text NOT NULL,
  next_service date,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.society_equipment, public.equipment_service_logs TO authenticated;
GRANT ALL ON public.society_equipment, public.equipment_service_logs TO service_role;
ALTER TABLE public.society_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_service_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in read equipment" ON public.society_equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY "Committee manages equipment" ON public.society_equipment FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'president') OR has_role(auth.uid(),'secretary'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'president') OR has_role(auth.uid(),'secretary'));
CREATE POLICY "Signed-in read service logs" ON public.equipment_service_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Committee manages service logs" ON public.equipment_service_logs FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'president') OR has_role(auth.uid(),'secretary'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'president') OR has_role(auth.uid(),'secretary'));
DROP TRIGGER IF EXISTS mandatory_committee_approval ON public.society_equipment;
DROP TRIGGER IF EXISTS mandatory_committee_approval ON public.equipment_service_logs;
INSERT INTO public.society_equipment (name, category, created_by) VALUES
 ('Passenger Lift','lift',NULL),('Borewell & Water Pumps','water',NULL),('Generator / Inverter','power',NULL),
 ('CCTV Cameras','security',NULL),('Fire Extinguishers','fire',NULL),('Water Tanks (cleaning)','water',NULL);