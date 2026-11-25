import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionRole } from "@/lib/session";

export function GalleryNotification() {
  const { role } = useSessionRole(); const [threshold, setThreshold] = useState(0);
  useEffect(() => {
    if (role !== "president" && role !== "secretary") return;
    let active = true;
    const refresh = async () => { const result = await supabase.from("gallery_notifications").select("threshold").is("read_at", null).order("threshold", { ascending: false }).limit(1); if (active) setThreshold(result.data?.[0]?.threshold ?? 0); };
    void refresh(); const timer = window.setInterval(refresh, 30000); window.addEventListener("gallery-changed", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("gallery-changed", refresh); };
  }, [role]);
  if (!threshold || (role !== "president" && role !== "secretary")) return null;
  return <Link to="/storage" className="flex items-center gap-3 border-b border-border bg-accent px-5 py-3 text-sm text-accent-foreground"><Bell className="size-4 shrink-0" /><span>Gallery storage has reached {threshold}% of the application budget.</span></Link>;
}